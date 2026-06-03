// V9 SLC-166 MT-2 — Worker Handler `email_bulk_pre_filter` (FEAT-071, MIG-051 + MIG-052/107).
//
// Picks ai_jobs entries with job_type='email_bulk_pre_filter', loads the
// email_bulk_run (must be at status='parsed'), iterates email_message-rows
// where pre_filter_label IS NULL in Batches von 50, ruft Haiku-Adapter
// (Strict-JSON-Batch-Klassifikation) auf, persistiert label+confidence pro
// email_message, schreibt ai_cost_ledger pro Bedrock-Call (role=
// 'email_bulk_pre_filter') und schliesst mit status='pre_filtered' +
// pre_filter_cost_eur ab.
//
// Status-Maschine (MIG-051):
//   parsed         -> pre_filtering -> pre_filtered  (success)
//   parsed         -> pre_filtering -> failed        (any error in haiku / db)
//   != parsed      -> no-op                          (skip + rpc_complete_ai_job)
//
// Idempotenz (DEC-184 + DEC-180):
//   Worker selectiert nur email_message-Rows mit pre_filter_label IS NULL.
//   Bei Re-Run nach Crash werden bereits gelabelte Rows uebersprungen — labels
//   sind ueber pre_filter_label CHECK eindeutig, Re-Klassifikation passiert
//   per Filter-Review-UI (MT-3, Out-of-Scope dieser MT).
//
// Confidence-Threshold (DEC-184 + Slice-Spec L98-99):
//   ENV V9_PRE_FILTER_CONFIDENCE_THRESHOLD ueberschreibt den Default 0.6.
//   Calls mit confidence < threshold → label='unclear', confidence unveraendert.
//
// Cost-Tracking (DEC-182, Slice-Spec L100-101):
//   ai_cost_ledger.usd_cost wird in USD geschrieben (Haiku-native), zusaetzlich
//   addieren wir die EUR-Approximation in email_bulk_run.pre_filter_cost_eur
//   pro Batch via simple Fixed-Rate USD_TO_EUR_APPROX (V9.0 Pragmatismus —
//   live Wechselkurs ist Out-of-Scope V9.0, dokumentiert in DEC-181 + DEC-182).
//
// Dependency-Injection: executeEmailBulkPreFilter(job, deps) fuer Tests,
// thin handleEmailBulkPreFilterJob(job) Wrapper fuer Production.

import { createAdminClient } from "../../lib/supabase/admin";
import {
  captureException,
  captureInfo,
  captureWarning,
} from "../../lib/logger";
import {
  HaikuSchemaError,
  invokeHaiku,
  type HaikuPromptRequest,
} from "../../lib/ai/bedrock-haiku";
import {
  PRE_FILTER_BATCH_RESULT_SCHEMA,
  type PreFilterBatchResult,
  type PreFilterLabel,
} from "../../lib/bulk-email/pre-filter/labels";
import {
  V9_PRE_FILTER_DEFAULT_CONFIDENCE_THRESHOLD,
  V9_PRE_FILTER_PROMPT_VERSION,
  V9_PRE_FILTER_SYSTEM_PROMPT,
  buildPreFilterUserPrompt,
  type PreFilterEmailPromptInput,
} from "../../lib/bulk-email/pre-filter/prompt";
import type { ClaimedJob } from "../condensation/claim-loop";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_BATCH_SIZE = 50;
const LOG_SOURCE = "email_bulk_pre_filter";
const AI_COST_LEDGER_ROLE = "email_bulk_pre_filter";

// V9.0-Pragmatismus: feste Approximation von Haiku-USD → EUR fuer
// pre_filter_cost_eur-Buchung (DEC-181 + DEC-182). Stand Mitte 2025:
// 1 USD ≈ 0.92 EUR. V9.1+ kann FX-Service injecten.
const USD_TO_EUR_APPROX = 0.92;

type AdminClient = ReturnType<typeof createAdminClient>;

interface EmailBulkPreFilterPayload {
  bulk_run_id: string;
}

interface BulkRunRow {
  id: string;
  tenant_id: string;
  status: string;
}

interface EmailMessageRow {
  id: string;
  subject: string | null;
  from_address: string | null;
  to_addresses: string[] | null;
  body_text: string | null;
}

/**
 * Test-Injection-Hook fuer Haiku-Call. Production setzt das nicht — Default
 * ruft invokeHaiku aus dem Bedrock-Haiku-Adapter direkt auf, der wiederum
 * via __setHaikuCallerForTests im Vitest-Pfad gemockt werden kann.
 *
 * Eigene HaikuInvoker-Type, weil wir hier nur das fuer den Worker relevante
 * Sub-Set des invokeHaiku-Vertrags brauchen (parsed data + cost + tokens).
 */
export type HaikuInvoker = (
  request: HaikuPromptRequest,
) => Promise<{
  data: PreFilterBatchResult;
  tokensIn: number;
  tokensOut: number;
  usdCost: number;
  modelId: string;
}>;

const defaultHaikuInvoker: HaikuInvoker = async (request) => {
  const result = await invokeHaiku(request, PRE_FILTER_BATCH_RESULT_SCHEMA);
  return {
    data: result.data,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    usdCost: result.costUsd,
    modelId: result.modelId,
  };
};

export interface HandleEmailBulkPreFilterDeps {
  adminClient: AdminClient;
  /** Pluggable for tests — defaults to invokeHaiku with batch-result-schema. */
  haikuInvoker?: HaikuInvoker;
  /** Pluggable for tests — defaults to DEFAULT_BATCH_SIZE (50). */
  batchSize?: number;
  /** Pluggable for tests — defaults to ENV or 0.6. */
  confidenceThreshold?: number;
}

interface PreFilterSummary {
  classifiedCount: number;
  unclearOverrideCount: number;
  batchCount: number;
  totalUsdCost: number;
  totalEurCost: number;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function resolveConfidenceThreshold(override?: number): number {
  if (typeof override === "number") return override;
  const envValue = process.env.V9_PRE_FILTER_CONFIDENCE_THRESHOLD;
  if (envValue) {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  }
  return V9_PRE_FILTER_DEFAULT_CONFIDENCE_THRESHOLD;
}

export async function executeEmailBulkPreFilter(
  job: ClaimedJob,
  deps: HandleEmailBulkPreFilterDeps,
): Promise<void> {
  const { adminClient } = deps;
  const haikuInvoker = deps.haikuInvoker ?? defaultHaikuInvoker;
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  const confidenceThreshold = resolveConfidenceThreshold(deps.confidenceThreshold);
  const startMs = Date.now();

  const payload = job.payload as unknown as EmailBulkPreFilterPayload;
  if (!payload || !isUuid(payload.bulk_run_id)) {
    throw new Error(
      "email_bulk_pre_filter: payload.bulk_run_id missing or not a UUID",
    );
  }
  const bulkRunId = payload.bulk_run_id;

  // 1. Load bulk_run via service_role.
  const { data: runRow, error: loadError } = await adminClient
    .from("email_bulk_run")
    .select("id, tenant_id, status")
    .eq("id", bulkRunId)
    .single();
  if (loadError || !runRow) {
    throw new Error(
      `email_bulk_pre_filter: email_bulk_run ${bulkRunId} not found: ${
        loadError?.message ?? "no row"
      }`,
    );
  }
  const run = runRow as BulkRunRow;

  // 2. Status-Skip fuer alles ausser 'parsed' (idempotent, kein Throw).
  if (run.status !== "parsed") {
    captureWarning(
      `email_bulk_pre_filter: skipping bulk_run ${bulkRunId} with status='${run.status}' (expected 'parsed')`,
      {
        source: LOG_SOURCE,
        metadata: { jobId: job.id, bulkRunId, status: run.status },
      },
    );
    const { error: skipCompleteError } = await adminClient.rpc(
      "rpc_complete_ai_job",
      { p_job_id: job.id },
    );
    if (skipCompleteError) {
      throw new Error(
        `email_bulk_pre_filter: rpc_complete_ai_job failed on status-skip path: ${skipCompleteError.message}`,
      );
    }
    return;
  }

  // 3. Status='pre_filtering'.
  const { error: startError } = await adminClient
    .from("email_bulk_run")
    .update({
      status: "pre_filtering",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bulkRunId);
  if (startError) {
    throw new Error(
      `email_bulk_pre_filter: status='pre_filtering' UPDATE failed: ${startError.message}`,
    );
  }

  try {
    // 4. Load all unlabelled email_message-rows.
    const { data: messageRows, error: messagesError } = await adminClient
      .from("email_message")
      .select("id, subject, from_address, to_addresses, body_text")
      .eq("bulk_run_id", bulkRunId)
      .is("pre_filter_label", null);
    if (messagesError) {
      throw new Error(
        `email_bulk_pre_filter: email_message SELECT failed: ${messagesError.message}`,
      );
    }
    const messages = (messageRows ?? []) as EmailMessageRow[];

    // 5. Klassifikations-Loop in Batches.
    const summary = await classifyInBatches(
      adminClient,
      run,
      job,
      messages,
      batchSize,
      confidenceThreshold,
      haikuInvoker,
    );

    // 6. Flip status -> pre_filtered + pre_filter_cost_eur.
    const { error: finishError } = await adminClient
      .from("email_bulk_run")
      .update({
        status: "pre_filtered",
        pre_filter_cost_eur: summary.totalEurCost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bulkRunId);
    if (finishError) {
      throw new Error(
        `email_bulk_pre_filter: status='pre_filtered' UPDATE failed: ${finishError.message}`,
      );
    }

    // 7. Mark ai_job complete.
    const { error: completeError } = await adminClient.rpc(
      "rpc_complete_ai_job",
      { p_job_id: job.id },
    );
    if (completeError) {
      throw new Error(
        `email_bulk_pre_filter: rpc_complete_ai_job failed: ${completeError.message}`,
      );
    }

    captureInfo(
      `email_bulk_pre_filter: bulk_run=${bulkRunId} done in ${
        Date.now() - startMs
      }ms (classified=${summary.classifiedCount}, unclear_override=${summary.unclearOverrideCount}, batches=${summary.batchCount}, cost_usd=${summary.totalUsdCost.toFixed(4)}, cost_eur=${summary.totalEurCost.toFixed(4)})`,
      {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          bulkRunId,
          classifiedCount: summary.classifiedCount,
          unclearOverrideCount: summary.unclearOverrideCount,
          batchCount: summary.batchCount,
          totalUsdCost: summary.totalUsdCost,
          totalEurCost: summary.totalEurCost,
          promptVersion: V9_PRE_FILTER_PROMPT_VERSION,
        },
      },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const failureReason = err instanceof HaikuSchemaError
      ? `haiku_pre_filter_schema_error: ${reason}`
      : `haiku_pre_filter_error: ${reason}`;
    try {
      await adminClient
        .from("email_bulk_run")
        .update({
          status: "failed",
          failure_reason: failureReason.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", bulkRunId);
    } catch (statusFailErr) {
      captureException(statusFailErr, {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          bulkRunId,
          phase: "set-status-failed",
        },
      });
    }
    captureException(err, {
      source: LOG_SOURCE,
      metadata: { jobId: job.id, bulkRunId },
    });
    throw err;
  }
}

/** Production wrapper — used by the claim-loop dispatcher. */
export async function handleEmailBulkPreFilterJob(
  job: ClaimedJob,
): Promise<void> {
  await executeEmailBulkPreFilter(job, { adminClient: createAdminClient() });
}

// ──────────────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────────────

async function classifyInBatches(
  admin: AdminClient,
  run: BulkRunRow,
  job: ClaimedJob,
  messages: EmailMessageRow[],
  batchSize: number,
  confidenceThreshold: number,
  haikuInvoker: HaikuInvoker,
): Promise<PreFilterSummary> {
  const summary: PreFilterSummary = {
    classifiedCount: 0,
    unclearOverrideCount: 0,
    batchCount: 0,
    totalUsdCost: 0,
    totalEurCost: 0,
  };

  for (let offset = 0; offset < messages.length; offset += batchSize) {
    const batch = messages.slice(offset, offset + batchSize);
    if (batch.length === 0) continue;

    const promptInput: PreFilterEmailPromptInput[] = batch.map((m) => ({
      message_id: m.id,
      subject: m.subject,
      from_address: m.from_address,
      to_addresses: m.to_addresses,
      body_text: m.body_text,
    }));

    const callStart = Date.now();
    const callResult = await haikuInvoker({
      system: V9_PRE_FILTER_SYSTEM_PROMPT,
      user: buildPreFilterUserPrompt(promptInput),
    });
    const callLatencyMs = Date.now() - callStart;

    // Map results-by-message_id; missing message_ids fallen auf 'unclear' zurueck.
    const resultsByMessageId = new Map<string, { label: PreFilterLabel; confidence: number }>();
    for (const r of callResult.data) {
      resultsByMessageId.set(r.message_id, { label: r.label, confidence: r.confidence });
    }

    for (const m of batch) {
      const haikuResult = resultsByMessageId.get(m.id);
      let finalLabel: PreFilterLabel;
      let finalConfidence: number;
      if (!haikuResult) {
        finalLabel = "unclear";
        finalConfidence = 0;
        summary.unclearOverrideCount += 1;
      } else if (haikuResult.confidence < confidenceThreshold) {
        finalLabel = "unclear";
        finalConfidence = haikuResult.confidence;
        summary.unclearOverrideCount += 1;
      } else {
        finalLabel = haikuResult.label;
        finalConfidence = haikuResult.confidence;
      }

      const { error: updateError } = await admin
        .from("email_message")
        .update({
          pre_filter_label: finalLabel,
          pre_filter_confidence: finalConfidence,
        })
        .eq("id", m.id);
      if (updateError) {
        throw new Error(
          `email_bulk_pre_filter: email_message UPDATE failed for ${m.id}: ${updateError.message}`,
        );
      }
      summary.classifiedCount += 1;
    }

    // ai_cost_ledger pro Batch.
    const usdCost = callResult.usdCost;
    const eurCost = usdCost * USD_TO_EUR_APPROX;
    summary.totalUsdCost += usdCost;
    summary.totalEurCost += eurCost;
    summary.batchCount += 1;

    const { error: costInsertError } = await admin
      .from("ai_cost_ledger")
      .insert({
        tenant_id: run.tenant_id,
        job_id: job.id,
        model_id: callResult.modelId,
        tokens_in: callResult.tokensIn,
        tokens_out: callResult.tokensOut,
        usd_cost: usdCost,
        duration_ms: callLatencyMs,
        iteration: 1,
        role: AI_COST_LEDGER_ROLE,
      });
    if (costInsertError) {
      // Audit-Fail ist nicht-fatal — Hot-Path soll nicht durch Logging-Probleme
      // abgebrochen werden (V8.1-Audit-Pattern). Loggen + weiter.
      captureException(
        new Error(
          `email_bulk_pre_filter: ai_cost_ledger INSERT failed: ${costInsertError.message}`,
        ),
        {
          source: LOG_SOURCE,
          metadata: { jobId: job.id, bulkRunId: run.id, batchIndex: summary.batchCount - 1 },
        },
      );
    }
  }

  return summary;
}
