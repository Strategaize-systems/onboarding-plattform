// V9.1 SLC-V9.1-B MT-2 — Continuous-Pipeline-Trigger-Service (FEAT-077).
//
// Slice: SLC-V9.1-B — Continuous-Cost-Cap-Service + Pipeline-Trigger
// Spec:  slices/SLC-V9.1-B-continuous-cost-cap.md (MT-2)
// DECs:  DEC-197 (3-Schichten-Cost-Cap), DEC-205 (Forward-Bucket-Continuous),
//        DEC-207 (Pipeline-Entry-Mechanik — siehe unten).
//
// DEC-207 (Pipeline-Entry, Founder-Entscheid 2026-06-10): Continuous-Forward-
// Bucket-Runs haben bereits email_message-Rows (aus SLC-V9.1-A IMAP-Sync via
// rpc_inbound_record_message) — die V9.0-'parse'-Stage (Storage-mbox-Download)
// ist fuer sie irrelevant. Die V9.0-Worker chainen sich NICHT selbst (jeder
// skippt ausser bei seinem exakten Vorgaenger-Status; die Stage-Uebergaenge sind
// in V9.0 UI-/Server-Action-orchestriert). Fuer den autonomen Continuous-Modus
// uebernimmt DIESER Trigger-Cron die Stage-Orchestrierung: er walkt jeden
// Forward-Bucket-Run pro Tick eine Stage weiter, gated vom Continuous-Cost-Cap
// (MT-1) vor dem Pipeline-Start und vor der teuren Sonnet-Stage. Kein neuer
// Worker, maximale V9.0-Reuse.
//
// Spec-Drift gegenueber MT-2-Wortlaut (dokumentiert): Spec sagt 'continuous ->
// parsing' + ai_jobs job_type='email_bulk_pipeline_trigger'. Real: es gibt KEINEN
// 'email_bulk_pipeline_trigger'-Worker (Dead-Job), und 'parsing' wuerde den
// parse-Worker einen nicht-existenten Storage-mbox suchen lassen. Korrekt:
// 'continuous' -> 'parsed' + enqueue 'email_bulk_pre_filter' (Parse-Stage
// uebersprungen). Stage-Preconditions der V9.0-Worker:
//   pre_filter   erwartet 'parsed'           -> setzt pre_filtering/pre_filtered
//   thread_redact erwartet 'pre_filtered'     -> setzt thread_redacting/redacted
//   pattern_extract erwartet 'pattern_extracting' (vom Caller gesetzt)
//
// audit_log gibt es in OP nicht — Logging via @/lib/logger (error_log).

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertSessionTierAllows } from "@/lib/auth/assert-session-tier";
import { captureInfo, captureWarning } from "@/lib/logger";

import {
  checkContinuousCostCap,
  createContinuousCapStoreFromSupabase,
  type ContinuousCapStore,
} from "./continuous-cost-cap";
import {
  notifyFounderCapHit,
  type FounderCapHitInput,
} from "./notify-founder";

const LOG_SOURCE = "cron:email-bulk-pipeline-trigger";

/** Default Trigger-Min-Count: ab so vielen akkumulierten Emails wird getriggert. */
export const DEFAULT_TRIGGER_MIN_COUNT = 25;

/**
 * Resolved Trigger-Min-Count aus ENV `V91_BULK_EMAIL_TRIGGER_MIN_COUNT`,
 * Fallback 25 (DEC-197). Ungueltige/nicht-positive Werte fallen auf Default.
 */
export function resolveTriggerMinCount(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.V91_BULK_EMAIL_TRIGGER_MIN_COUNT;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_TRIGGER_MIN_COUNT;
}

/** Job-Type-Konstanten (Strings spiegeln src/workers/bulk-email/job-types.ts). */
const JOB_PRE_FILTER = "email_bulk_pre_filter";
const JOB_THREAD_REDACT = "email_bulk_thread_redact";
const JOB_PATTERN_EXTRACT = "email_bulk_pattern_extract";

/** Forward-Bucket-Runs in diesen Stati sind Trigger-relevant. */
const PIPELINE_ACTIVE_STATUSES = [
  "continuous",
  "pre_filtered",
  "thread_redacted",
] as const;

export interface PipelineTriggerSummary {
  /** Wie viele Forward-Bucket-Runs der Cron evaluiert hat. */
  runs_evaluated: number;
  /** continuous -> parsed Pipeline-Starts. */
  runs_triggered: number;
  /** Stage-Fortschritte bestehender Runs (pre_filtered/thread_redacted weiter). */
  runs_advanced: number;
  /** Runs auf 'paused' gesetzt wegen Daily/Monthly-Cap-Hit. */
  runs_skipped_cap: number;
  /** continuous-Runs unter Trigger-Schwelle + kein Daily-Roll-Over. */
  runs_skipped_threshold: number;
}

interface BulkRunRow {
  id: string;
  tenant_id: string;
  status: string;
  email_count: number | null;
  created_at: string;
  capture_session_id: string | null;
}

export interface PipelineTriggerDeps {
  adminClient: SupabaseClient;
  /** Default: createContinuousCapStoreFromSupabase(adminClient). */
  capStore?: ContinuousCapStore;
  /** Default: notifyFounderCapHit. Injectable fuer hermetische Tests. */
  notifyCapHit?: (input: FounderCapHitInput) => Promise<unknown>;
  /** Default: resolveTriggerMinCount(). */
  triggerMinCount?: number;
  /** Default: aktueller Zeitpunkt. Injectable fuer Daily-Roll-Over-Tests. */
  now?: Date;
}

/** UTC 'YYYY-MM-DD' eines ISO-Timestamps oder Date. */
function utcDateOf(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Continuous-Pipeline-Trigger: walkt Forward-Bucket-Runs cost-cap-gated eine
 * Stage weiter. Idempotent pro Tick (jeder Run wird nach Status dispatcht);
 * mehrfaches Triggern desselben Runs ist unmoeglich, weil der Status nach jedem
 * Schritt wechselt.
 */
export async function runPipelineTrigger(
  deps: PipelineTriggerDeps,
): Promise<PipelineTriggerSummary> {
  const { adminClient } = deps;
  const capStore =
    deps.capStore ?? createContinuousCapStoreFromSupabase(adminClient);
  const notify = deps.notifyCapHit ?? ((i: FounderCapHitInput) => notifyFounderCapHit(i));
  const minCount = deps.triggerMinCount ?? resolveTriggerMinCount();
  const now = deps.now ?? new Date();
  const todayUtc = utcDateOf(now);

  const summary: PipelineTriggerSummary = {
    runs_evaluated: 0,
    runs_triggered: 0,
    runs_advanced: 0,
    runs_skipped_cap: 0,
    runs_skipped_threshold: 0,
  };

  const { data, error } = await adminClient
    .from("email_bulk_run")
    .select("id, tenant_id, status, email_count, created_at, capture_session_id")
    .eq("inbound_source", "forward_bucket")
    .in("status", PIPELINE_ACTIVE_STATUSES as unknown as string[]);
  if (error) {
    throw new Error(
      `pipeline-trigger: email_bulk_run SELECT failed: ${error.message}`,
    );
  }
  const runs = (data ?? []) as BulkRunRow[];
  summary.runs_evaluated = runs.length;

  for (const run of runs) {
    if (run.status === "continuous") {
      const emailCount = run.email_count ?? 0;
      const dailyRollOver = utcDateOf(run.created_at) < todayUtc;
      const thresholdMet = emailCount >= minCount || dailyRollOver;
      if (!thresholdMet) {
        summary.runs_skipped_threshold += 1;
        continue;
      }
      const cap = await checkContinuousCostCap(run.tenant_id, capStore);
      if (!cap.allowed) {
        await pauseRun(adminClient, run.id, now);
        await safeNotify(notify, {
          tenantId: run.tenant_id,
          reason: cap.reason ?? "daily_cap_hit",
          cap: cap.cap ?? 0,
          actual: cap.actual ?? 0,
        });
        captureWarning("pipeline-trigger: run paused (cap hit)", {
          source: LOG_SOURCE,
          metadata: {
            category: "email_bulk_pipeline_trigger",
            bulk_run_id: run.id,
            tenant_id: run.tenant_id,
            reason: cap.reason,
          },
        });
        summary.runs_skipped_cap += 1;
        continue;
      }
      await updateStatus(adminClient, run.id, "parsed", now);
      await enqueue(adminClient, run.tenant_id, JOB_PRE_FILTER, run.id, run.capture_session_id);
      summary.runs_triggered += 1;
      continue;
    }

    if (run.status === "pre_filtered") {
      // Naechste Stage: Thread-Redact (Worker erwartet 'pre_filtered',
      // flippt selbst auf thread_redacting). Kein Status-Set noetig.
      await enqueue(adminClient, run.tenant_id, JOB_THREAD_REDACT, run.id, run.capture_session_id);
      summary.runs_advanced += 1;
      continue;
    }

    if (run.status === "thread_redacted") {
      // Teure Sonnet-Stage: Cost-Cap erneut pruefen, bevor wir starten.
      const cap = await checkContinuousCostCap(run.tenant_id, capStore);
      if (!cap.allowed) {
        await pauseRun(adminClient, run.id, now);
        await safeNotify(notify, {
          tenantId: run.tenant_id,
          reason: cap.reason ?? "daily_cap_hit",
          cap: cap.cap ?? 0,
          actual: cap.actual ?? 0,
        });
        summary.runs_skipped_cap += 1;
        continue;
      }
      // Pattern-Extract-Worker erwartet 'pattern_extracting' (Caller-gesetzt).
      // Die Per-Email-Approval-Schicht (MT-3) sitzt im Worker vor dem Sonnet-Call.
      await updateStatus(adminClient, run.id, "pattern_extracting", now);
      await enqueue(adminClient, run.tenant_id, JOB_PATTERN_EXTRACT, run.id, run.capture_session_id);
      summary.runs_advanced += 1;
      continue;
    }
  }

  captureInfo("pipeline-trigger run", {
    source: LOG_SOURCE,
    metadata: { category: "email_bulk_pipeline_trigger", ...summary },
  });

  return summary;
}

async function updateStatus(
  admin: SupabaseClient,
  runId: string,
  status: string,
  now: Date,
): Promise<void> {
  const { error } = await admin
    .from("email_bulk_run")
    .update({ status, updated_at: now.toISOString() })
    .eq("id", runId);
  if (error) {
    throw new Error(
      `pipeline-trigger: status='${status}' UPDATE failed for ${runId}: ${error.message}`,
    );
  }
}

async function pauseRun(
  admin: SupabaseClient,
  runId: string,
  now: Date,
): Promise<void> {
  await updateStatus(admin, runId, "paused", now);
}

async function enqueue(
  admin: SupabaseClient,
  tenantId: string,
  jobType: string,
  bulkRunId: string,
  captureSessionId: string | null,
): Promise<void> {
  // V9.75 Tier-Gate (Schicht 1) + session_tier-Stempel. Forward-Bucket-Runs sind
  // ueblicherweise session-los (capture_session_id NULL) -> per-Session-Gate nicht
  // anwendbar (autonome V9.1-Continuous-Pipeline), session_tier bleibt NULL. Ist
  // der Run an eine Session gebunden, greift das handbook-Gate (ARCHITECTURE §4).
  let sessionTier: string | null = null;
  if (captureSessionId) {
    const gate = await assertSessionTierAllows(admin, captureSessionId, jobType);
    if (!gate.allowed) {
      throw new Error(
        `pipeline-trigger: tier_gate_denied (${jobType}) for bulk_run ${bulkRunId} (session ${captureSessionId})`,
      );
    }
    sessionTier = gate.tier;
  }

  const { error } = await admin.from("ai_jobs").insert({
    tenant_id: tenantId,
    job_type: jobType,
    status: "pending",
    payload: { bulk_run_id: bulkRunId },
    session_tier: sessionTier,
  });
  if (error) {
    throw new Error(
      `pipeline-trigger: ai_jobs enqueue (${jobType}) failed for ${bulkRunId}: ${error.message}`,
    );
  }
}

/** Notify darf den Cron nie crashen — Email-Fehler werden geschluckt + geloggt. */
async function safeNotify(
  notify: (input: FounderCapHitInput) => Promise<unknown>,
  input: FounderCapHitInput,
): Promise<void> {
  try {
    await notify(input);
  } catch (e) {
    captureWarning("pipeline-trigger: founder notify failed (non-fatal)", {
      source: LOG_SOURCE,
      metadata: {
        category: "email_bulk_pipeline_trigger",
        tenant_id: input.tenantId,
        error: e instanceof Error ? e.message : String(e),
      },
    });
  }
}
