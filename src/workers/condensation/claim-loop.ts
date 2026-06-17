// Claim-Loop: Polls ai_jobs queue via SKIP LOCKED RPC.
// Dispatches claimed jobs to the handler.

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "../../lib/supabase/admin";
import { captureException, captureInfo, captureWarning } from "../../lib/logger";

export interface ClaimedJob {
  id: string;
  tenant_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  /**
   * V9.75 Worker-Defense-Stempel (DEC-221): Tier der Session, die diesen Job
   * ausloeste. NULL bei ungated/legacy/session-losen Forward-Bucket-Runs. Wird
   * vom Claim-RPC mitgeliefert (Migration 121 §5). Optional, damit Bestands-
   * Job-Literale (Tests/Handler) unveraendert bleiben; der Gate behandelt
   * `null`/`undefined` identisch (`!= null`).
   */
  session_tier?: string | null;
}

export type JobHandler = (job: ClaimedJob) => Promise<void>;

// ============================================================
// V9.75 Worker-Defense (ARCHITECTURE §4 Schicht 2, DEC-221)
// ============================================================

type GateResolution =
  | { kind: "session"; sessionId: string }
  // bulk-email Forward-Bucket-Run OHNE capture_session (V9.1 Continuous-Pipeline)
  | { kind: "session-less" }
  | { kind: "unresolved" };

/**
 * Loest fuer einen NULL-gestempelten gated Job die echte Session aus dem Payload
 * auf (billige Aufloesung, ARCHITECTURE §4). Nur die im Payload referenzierbaren
 * Pfade werden versucht — gelingt keiner, faellt der Job fail-closed durch.
 *
 *  - email_bulk_* : payload.bulk_run_id -> email_bulk_run.capture_session_id
 *                   (NULL = session-loser Forward-Bucket-Run -> "session-less")
 *  - payload.capture_session_id (direkt)
 *  - payload.block_checkpoint_id -> block_checkpoint.capture_session_id
 */
async function resolveSessionForGate(
  client: SupabaseClient,
  job: Pick<ClaimedJob, "job_type" | "payload">,
): Promise<GateResolution> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;

  // Bulk-Email-Jobs referenzieren einen Run; der Run kann legitim session-los sein.
  if (job.job_type.startsWith("email_bulk_")) {
    const runId = payload.bulk_run_id;
    if (typeof runId !== "string") return { kind: "unresolved" };
    const { data, error } = await client
      .from("email_bulk_run")
      .select("capture_session_id")
      .eq("id", runId)
      .maybeSingle();
    if (error || !data) return { kind: "unresolved" };
    return data.capture_session_id
      ? { kind: "session", sessionId: data.capture_session_id as string }
      : { kind: "session-less" };
  }

  // Direkte capture_session_id im Payload.
  if (typeof payload.capture_session_id === "string") {
    return { kind: "session", sessionId: payload.capture_session_id };
  }

  // block_checkpoint_id -> capture_session_id.
  if (typeof payload.block_checkpoint_id === "string") {
    const { data, error } = await client
      .from("block_checkpoint")
      .select("capture_session_id")
      .eq("id", payload.block_checkpoint_id)
      .maybeSingle();
    if (error || !data || !data.capture_session_id) return { kind: "unresolved" };
    return { kind: "session", sessionId: data.capture_session_id as string };
  }

  return { kind: "unresolved" };
}

/**
 * Worker-Defense-in-Depth: prueft unmittelbar nach dem Claim, ob der Job unter
 * seinem Tier laufen darf. Backstop gegen einen vergessenen Dispatch-Pfad oder
 * einen direkten ai_jobs-INSERT, der das Schicht-1-Dispatch-Gate umgeht.
 *
 * Rueckgabe: `true` = Job darf laufen, `false` = fail-closed
 * (`tier_gate_denied_worker`, kein Handler-Aufruf).
 *
 *  1. Stempel-Check `fn_tier_allows(session_tier, job_type)`: ungated job_types
 *     (lead_push_retry, Unbekanntes) und ausreichend gestempelte Jobs passieren.
 *  2. Ein NICHT-NULL-Stempel, der durchfaellt, ist eine autoritative Ablehnung.
 *  3. Ein NULL-Stempel auf einem gated job_type ist ein vergessener/umgangener
 *     Pfad: echte Session aus dem Payload aufloesen und neu pruefen. Der EINZIGE
 *     legitime NULL-gestempelte gated Job ist ein session-loser bulk-email
 *     Forward-Bucket-Run (V9.1) — der wird ausgenommen; alles andere
 *     Unaufloesbare faellt fail-closed durch.
 */
export async function evaluateWorkerTierGate(
  client: SupabaseClient,
  job: Pick<ClaimedJob, "job_type" | "session_tier" | "payload">,
): Promise<boolean> {
  // 1. Primaerer Check gegen den Stempel.
  const { data: stampAllowed, error: stampErr } = await client.rpc(
    "fn_tier_allows",
    { p_session_tier: job.session_tier, p_job_type: job.job_type },
  );
  if (stampErr) return false; // fail-closed bei RPC-Fehler (Defense-in-Depth)
  if (stampAllowed === true) return true;

  // 2. Nicht-NULL-Stempel, der durchfaellt = autoritative Ablehnung.
  if (job.session_tier != null) return false;

  // 3. NULL-Stempel auf gated Job -> echte Session aus dem Payload aufloesen.
  const resolved = await resolveSessionForGate(client, job);

  if (resolved.kind === "session-less") {
    // Carve-out: NUR die session-lose bulk-email Forward-Bucket-Pipeline ist
    // ausgenommen (sonst re-bricht die stabile V9.1-Continuous-Pipeline).
    return job.job_type.startsWith("email_bulk_");
  }
  if (resolved.kind === "session") {
    const { data: reAllowed, error: reErr } = await client.rpc(
      "fn_session_tier_allows",
      { p_session_id: resolved.sessionId, p_job_type: job.job_type },
    );
    return !reErr && reAllowed === true;
  }
  // Unaufloesbar -> fail-closed (macht den vergessenen Pfad sichtbar).
  return false;
}

const JOB_TYPES = ["knowledge_unit_condensation", "recondense_with_gaps", "sop_generation", "diagnosis_generation", "evidence_extraction", "dialogue_transcription", "dialogue_extraction", "bridge_generation", "walkthrough_stub_processing", "walkthrough_transcribe", "walkthrough_redact_pii", "walkthrough_extract_steps", "walkthrough_map_subtopics", "handbook_snapshot_generation", "lead_push_retry", "email_bulk_parse", "email_bulk_pre_filter", "email_bulk_thread_redact", "email_bulk_pattern_extract", "email_bulk_synthesis"] as const;

/**
 * Start the polling claim-loop.
 * Polls for multiple job types in round-robin fashion.
 * Runs indefinitely until the process is killed.
 */
export async function startClaimLoop(
  handler: JobHandler,
  recondenseHandler?: JobHandler,
  sopHandler?: JobHandler,
  diagnosisHandler?: JobHandler,
  evidenceHandler?: JobHandler,
  dialogueTranscriptionHandler?: JobHandler,
  dialogueExtractionHandler?: JobHandler,
  bridgeHandler?: JobHandler,
  walkthroughStubHandler?: JobHandler,
  handbookSnapshotHandler?: JobHandler,
  walkthroughTranscribeHandler?: JobHandler,
  walkthroughRedactPiiHandler?: JobHandler,
  walkthroughExtractStepsHandler?: JobHandler,
  walkthroughMapSubtopicsHandler?: JobHandler,
  leadPushRetryHandler?: JobHandler,
  emailBulkParseHandler?: JobHandler,
  emailBulkPreFilterHandler?: JobHandler,
  emailBulkThreadRedactHandler?: JobHandler,
  emailBulkPatternExtractHandler?: JobHandler,
  emailBulkSynthesisHandler?: JobHandler
): Promise<never> {
  const pollMs = parseInt(process.env.AI_WORKER_POLL_MS || "2000", 10);
  const adminClient = createAdminClient();

  captureInfo(`Worker claim-loop started (poll=${pollMs}ms, types=${JOB_TYPES.join(",")})`, {
    source: "claim-loop",
  });

  let typeIndex = 0;

  while (true) {
    try {
      // Round-robin across job types
      const jobType = JOB_TYPES[typeIndex % JOB_TYPES.length];
      typeIndex++;

      // Claim next pending job via SKIP LOCKED RPC
      const { data, error } = await adminClient.rpc(
        "rpc_claim_next_ai_job_for_type",
        { p_job_type: jobType }
      );

      if (error) {
        captureException(new Error(`Claim RPC error: ${error.message}`), {
          source: "claim-loop",
          metadata: { code: error.code },
        });
        await sleep(pollMs);
        continue;
      }

      // No job available — sleep and retry
      if (!data) {
        await sleep(pollMs);
        continue;
      }

      const job = data as ClaimedJob;
      console.log(`[claim-loop] Claimed job ${job.id} (tenant=${job.tenant_id})`);

      // V9.75 Worker-Defense (ARCHITECTURE §4 Schicht 2): re-check tier
      // entitlement before dispatch. A gated job that slipped past the
      // dispatch gate (forgotten path / direct ai_jobs INSERT) is failed-closed.
      const tierAllowed = await evaluateWorkerTierGate(adminClient, job);
      if (!tierAllowed) {
        captureWarning(
          `[claim-loop] tier_gate_denied_worker — job ${job.id} (type=${job.job_type}, tier=${job.session_tier ?? "null"})`,
          {
            source: "claim-loop",
            metadata: {
              jobId: job.id,
              jobType: job.job_type,
              tenantId: job.tenant_id,
              sessionTier: job.session_tier,
            },
          },
        );
        try {
          await adminClient.rpc("rpc_fail_ai_job", {
            p_job_id: job.id,
            p_error: "tier_gate_denied_worker",
          });
        } catch (failError) {
          captureException(failError, {
            source: "claim-loop",
            metadata: { jobId: job.id, action: "rpc_fail_ai_job" },
          });
        }
        continue; // do not dispatch to any handler
      }

      // Dispatch to correct handler based on job_type
      try {
        if (job.job_type === "recondense_with_gaps" && recondenseHandler) {
          await recondenseHandler(job);
        } else if (job.job_type === "sop_generation" && sopHandler) {
          await sopHandler(job);
        } else if (job.job_type === "diagnosis_generation" && diagnosisHandler) {
          await diagnosisHandler(job);
        } else if (job.job_type === "evidence_extraction" && evidenceHandler) {
          await evidenceHandler(job);
        } else if (job.job_type === "dialogue_transcription" && dialogueTranscriptionHandler) {
          await dialogueTranscriptionHandler(job);
        } else if (job.job_type === "dialogue_extraction" && dialogueExtractionHandler) {
          await dialogueExtractionHandler(job);
        } else if (job.job_type === "bridge_generation" && bridgeHandler) {
          await bridgeHandler(job);
        } else if (
          job.job_type === "walkthrough_stub_processing" &&
          walkthroughStubHandler
        ) {
          await walkthroughStubHandler(job);
        } else if (
          job.job_type === "handbook_snapshot_generation" &&
          handbookSnapshotHandler
        ) {
          await handbookSnapshotHandler(job);
        } else if (
          job.job_type === "walkthrough_transcribe" &&
          walkthroughTranscribeHandler
        ) {
          await walkthroughTranscribeHandler(job);
        } else if (
          job.job_type === "walkthrough_redact_pii" &&
          walkthroughRedactPiiHandler
        ) {
          await walkthroughRedactPiiHandler(job);
        } else if (
          job.job_type === "walkthrough_extract_steps" &&
          walkthroughExtractStepsHandler
        ) {
          await walkthroughExtractStepsHandler(job);
        } else if (
          job.job_type === "walkthrough_map_subtopics" &&
          walkthroughMapSubtopicsHandler
        ) {
          await walkthroughMapSubtopicsHandler(job);
        } else if (
          job.job_type === "lead_push_retry" &&
          leadPushRetryHandler
        ) {
          await leadPushRetryHandler(job);
        } else if (
          job.job_type === "email_bulk_parse" &&
          emailBulkParseHandler
        ) {
          await emailBulkParseHandler(job);
        } else if (
          job.job_type === "email_bulk_pre_filter" &&
          emailBulkPreFilterHandler
        ) {
          await emailBulkPreFilterHandler(job);
        } else if (
          job.job_type === "email_bulk_thread_redact" &&
          emailBulkThreadRedactHandler
        ) {
          await emailBulkThreadRedactHandler(job);
        } else if (
          job.job_type === "email_bulk_pattern_extract" &&
          emailBulkPatternExtractHandler
        ) {
          await emailBulkPatternExtractHandler(job);
        } else if (
          job.job_type === "email_bulk_synthesis" &&
          emailBulkSynthesisHandler
        ) {
          await emailBulkSynthesisHandler(job);
        } else {
          await handler(job);
        }
      } catch (handlerError) {
        // Handler failed — mark job as failed
        captureException(handlerError, {
          source: "claim-loop",
          metadata: { jobId: job.id, tenantId: job.tenant_id },
        });

        try {
          await adminClient.rpc("rpc_fail_ai_job", {
            p_job_id: job.id,
            p_error:
              handlerError instanceof Error
                ? handlerError.message
                : String(handlerError),
          });
        } catch (failError) {
          captureException(failError, {
            source: "claim-loop",
            metadata: { jobId: job.id, action: "rpc_fail_ai_job" },
          });
        }
      }
    } catch (loopError) {
      // Unexpected top-level error — log and continue
      captureException(loopError, { source: "claim-loop" });
      await sleep(pollMs * 2);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
