// V9 SLC-167 MT-5 — Worker Handler `email_bulk_pattern_extract` (FEAT-073,
// MIG-051 + MIG-106 + MIG-109).
//
// Spec: slices/SLC-167-v9-pattern-curation-cost-cap.md (MT-5 Expected behavior)
// DECs: DEC-180 (Async-Worker), DEC-181 (V4.1-Sections + USD->EUR-Approx),
//       DEC-182 (Cost-Cap-Flow)
//
// Picks ai_jobs entries with job_type='email_bulk_pattern_extract', laedt
// email_bulk_run (status='pattern_extracting' — vom MT-4 Server-Action gesetzt,
// im Unterschied zu pre-filter wo der Worker selbst auf 'pre_filtering' flippt),
// iteriert redacted email_thread-Rows, ruft Bedrock-Sonnet (eu-central-1) via
// extractPatternFromThread auf, persistiert email_pattern Rows (1..5 pro Thread)
// + ai_cost_ledger (role='email_bulk_pattern_extraction') + akkumuliert
// email_bulk_run.pattern_extraction_cost_eur. Schliesst mit status='pattern_extracted'
// + patterns_extracted=COUNT ab.
//
// Status-Maschine (MIG-051):
//   pattern_extracting -> pattern_extracted  (success)
//   pattern_extracting -> failed             (any error in sonnet / db / live-cap)
//   != pattern_extracting -> no-op           (skip + rpc_complete_ai_job)
//
// Idempotenz (DEC-184 + Slice-Spec R5):
//   Worker selectiert email_thread WHERE bulk_run_id=X AND thread_status='redacted'.
//   Pro Thread: skip wenn bereits email_pattern.thread_id Row existiert
//   (Re-Run-Schutz). Bestehende curierte Pattern (curation_status != 'pending_curation')
//   bleiben unangetastet — geht implizit aus dem Skip-by-thread_id.
//
// Live-Cap-Source (Spec-Drift D-MT5-Live-Cap-Source — DOKUMENTIERT):
//   Slice-Spec L165 sagt "SELECT SUM(cost_eur) FROM ai_cost_ledger WHERE
//   bulk_run_id=X". Realschema: ai_cost_ledger hat kein bulk_run_id (nur job_id),
//   usd_cost statt cost_eur. V9-Konvention: email_bulk_run.pattern_extraction_cost_eur
//   akkumuliert vom Worker. checkLiveCapInWorker liest diese Spalte
//   (siehe cost-cap.ts Modul-Header).
//
// Bedrock-Schema-Drift-Handling (AC-SLC-167-14):
//   SonnetSchemaError auf einzelnem Thread: captureException + continue. Der
//   Thread bleibt thread_status='redacted' ohne email_pattern Row. Beim Re-Run
//   wird er erneut versucht (gewollt — vielleicht ist Modell-Drift transient).
//
// ai_cost_ledger role (Spec-konsistent):
//   role='email_bulk_pattern_extraction' (Suffix-Konvention der ai_cost_ledger
//   roles aus handle-pre-filter-job 'email_bulk_pre_filter' +
//   handle-thread-redact-job 'email_bulk_pii_redact'). Spec L40+L165 nutzen
//   inkonsistent 'email_bulk_pattern_extraction' vs Job-Type-Konstante
//   'email_bulk_pattern_extract' — Job-Type bleibt im Code-Const aus MT-4
//   Code-Drift-Disziplin (Spec-Drift D-MT4-Job-Type-Name), role-Naming folgt
//   Spec-Konvention.
//
// Dependency-Injection: executeEmailBulkPatternExtract(job, deps) fuer Tests,
// thin handleEmailBulkPatternExtractJob(job) Wrapper fuer Production.

import { createAdminClient } from "../../lib/supabase/admin";
import {
  captureException,
  captureInfo,
  captureWarning,
} from "../../lib/logger";
import {
  extractPatternFromThread,
  SonnetSchemaError,
  type PatternExtractionResult,
  type ThreadMeta,
} from "../../lib/ai/bedrock-sonnet/email-pattern";
import {
  DEFAULT_RUN_CAP_EUR,
  checkLiveCapInWorker,
  createCostCapStoreFromSupabase,
  type CostCapStore,
} from "../../lib/bulk-email/cost-cap";
import { USD_TO_EUR_APPROX } from "../../lib/bulk-email/cost-estimate";
import type { ClaimedJob } from "../condensation/claim-loop";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOG_SOURCE = "email_bulk_pattern_extract";
const AI_COST_LEDGER_ROLE = "email_bulk_pattern_extraction";

type AdminClient = ReturnType<typeof createAdminClient>;

interface EmailBulkPatternExtractPayload {
  bulk_run_id: string;
}

interface BulkRunRow {
  id: string;
  tenant_id: string;
  status: string;
  pattern_extraction_cost_eur: string | number | null;
}

interface ThreadRow {
  id: string;
  root_message_id: string;
  subject: string | null;
  email_count: number | null;
  first_date: string | null;
  redacted_body: string | null;
  thread_status: string;
}

/**
 * Test-Injection-Hook fuer Sonnet-Call. Production setzt das nicht — Default
 * delegiert an extractPatternFromThread (eu-central-1).
 */
export type PatternExtractor = (
  redactedBody: string,
  threadMeta: ThreadMeta,
) => Promise<{
  data: PatternExtractionResult;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  modelId: string;
  region: string;
}>;

const defaultPatternExtractor: PatternExtractor = async (body, meta) => {
  const result = await extractPatternFromThread(body, meta);
  return {
    data: result.data,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
    modelId: result.modelId,
    region: result.region,
  };
};

export interface HandleEmailBulkPatternExtractDeps {
  adminClient: AdminClient;
  /** Pluggable for tests — defaults to extractPatternFromThread Sonnet-Call. */
  patternExtractor?: PatternExtractor;
  /** Pluggable for tests — defaults to createCostCapStoreFromSupabase(adminClient). */
  costStore?: CostCapStore;
  /** Pluggable for tests — defaults to ENV V9_BULK_EMAIL_RUN_CAP_EUR or 20. */
  runCapEur?: number;
}

interface PatternExtractionSummary {
  threadsProcessed: number;
  threadsSkipped: number;
  threadsFailed: number;
  patternsInserted: number;
  totalUsdCost: number;
  totalEurCost: number;
  costCapExceeded: boolean;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function resolveRunCap(override?: number): number {
  if (typeof override === "number") return override;
  const envValue = process.env.V9_BULK_EMAIL_RUN_CAP_EUR;
  if (envValue) {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_RUN_CAP_EUR;
}

function numericOrZero(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function executeEmailBulkPatternExtract(
  job: ClaimedJob,
  deps: HandleEmailBulkPatternExtractDeps,
): Promise<void> {
  const { adminClient } = deps;
  const patternExtractor = deps.patternExtractor ?? defaultPatternExtractor;
  const costStore = deps.costStore ?? createCostCapStoreFromSupabase(adminClient);
  const runCapEur = resolveRunCap(deps.runCapEur);
  const startMs = Date.now();

  const payload = job.payload as unknown as EmailBulkPatternExtractPayload;
  if (!payload || !isUuid(payload.bulk_run_id)) {
    throw new Error(
      "email_bulk_pattern_extract: payload.bulk_run_id missing or not a UUID",
    );
  }
  const bulkRunId = payload.bulk_run_id;

  // 1. Load bulk_run via service_role.
  const { data: runRow, error: loadError } = await adminClient
    .from("email_bulk_run")
    .select("id, tenant_id, status, pattern_extraction_cost_eur")
    .eq("id", bulkRunId)
    .single();
  if (loadError || !runRow) {
    throw new Error(
      `email_bulk_pattern_extract: email_bulk_run ${bulkRunId} not found: ${
        loadError?.message ?? "no row"
      }`,
    );
  }
  const run = runRow as BulkRunRow;

  // 2. Status-Skip fuer alles ausser 'pattern_extracting' (idempotent, kein Throw).
  //    Unterschied zu pre-filter/thread-redact: MT-4 Server-Action setzt den
  //    Status auf 'pattern_extracting' bevor das Job enqueued wird. Worker
  //    erwartet diesen State.
  if (run.status !== "pattern_extracting") {
    captureWarning(
      `email_bulk_pattern_extract: skipping bulk_run ${bulkRunId} with status='${run.status}' (expected 'pattern_extracting')`,
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
        `email_bulk_pattern_extract: rpc_complete_ai_job failed on status-skip path: ${skipCompleteError.message}`,
      );
    }
    return;
  }

  try {
    // 3. Load redacted threads.
    const { data: threadRows, error: threadsError } = await adminClient
      .from("email_thread")
      .select("id, root_message_id, subject, email_count, first_date, redacted_body, thread_status")
      .eq("bulk_run_id", bulkRunId)
      .eq("thread_status", "redacted");
    if (threadsError) {
      throw new Error(
        `email_bulk_pattern_extract: email_thread SELECT failed: ${threadsError.message}`,
      );
    }
    const threads = (threadRows ?? []) as ThreadRow[];

    // 4. Load existing email_pattern.thread_id for idempotency.
    const { data: existingRows, error: existingError } = await adminClient
      .from("email_pattern")
      .select("thread_id")
      .eq("bulk_run_id", bulkRunId);
    if (existingError) {
      throw new Error(
        `email_bulk_pattern_extract: existing email_pattern SELECT failed: ${existingError.message}`,
      );
    }
    const existingThreadIds = new Set<string>(
      (existingRows ?? []).map(
        (r) => (r as { thread_id: string }).thread_id,
      ),
    );

    // 5. Iterate threads + Sonnet-Call + INSERT + Live-Cap-Check.
    //    Initial cost = aktueller persistierter Stand (z.B. nach Worker-Restart).
    let accumulatedEurCost = numericOrZero(run.pattern_extraction_cost_eur);
    const summary = await processThreads(
      adminClient,
      run,
      job,
      threads,
      existingThreadIds,
      patternExtractor,
      costStore,
      runCapEur,
      accumulatedEurCost,
    );

    // 6. Wenn Live-Cap exceeded: status='failed' + failure_reason.
    if (summary.costCapExceeded) {
      const reason = `cost_cap_run_exceeded: ${summary.totalEurCost.toFixed(
        4,
      )} EUR > cap ${runCapEur} EUR`;
      const { error: failError } = await adminClient
        .from("email_bulk_run")
        .update({
          status: "failed",
          failure_reason: reason.slice(0, 1000),
          patterns_extracted: summary.patternsInserted,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bulkRunId);
      if (failError) {
        throw new Error(
          `email_bulk_pattern_extract: status='failed' UPDATE (cap-exceed path) failed: ${failError.message}`,
        );
      }

      const { error: completeError } = await adminClient.rpc(
        "rpc_complete_ai_job",
        { p_job_id: job.id },
      );
      if (completeError) {
        throw new Error(
          `email_bulk_pattern_extract: rpc_complete_ai_job failed on cap-exceed path: ${completeError.message}`,
        );
      }

      captureWarning(
        `email_bulk_pattern_extract: bulk_run=${bulkRunId} STOPPED via cost-cap (cost=${summary.totalEurCost.toFixed(
          4,
        )} EUR, cap=${runCapEur} EUR, patterns_inserted=${summary.patternsInserted})`,
        {
          source: LOG_SOURCE,
          metadata: {
            jobId: job.id,
            bulkRunId,
            totalEurCost: summary.totalEurCost,
            runCapEur,
            patternsInserted: summary.patternsInserted,
          },
        },
      );
      return;
    }

    // 7. Flip status -> pattern_extracted + patterns_extracted.
    const { error: finishError } = await adminClient
      .from("email_bulk_run")
      .update({
        status: "pattern_extracted",
        patterns_extracted: summary.patternsInserted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bulkRunId);
    if (finishError) {
      throw new Error(
        `email_bulk_pattern_extract: status='pattern_extracted' UPDATE failed: ${finishError.message}`,
      );
    }

    // 8. Mark ai_job complete.
    const { error: completeError } = await adminClient.rpc(
      "rpc_complete_ai_job",
      { p_job_id: job.id },
    );
    if (completeError) {
      throw new Error(
        `email_bulk_pattern_extract: rpc_complete_ai_job failed: ${completeError.message}`,
      );
    }

    captureInfo(
      `email_bulk_pattern_extract: bulk_run=${bulkRunId} done in ${
        Date.now() - startMs
      }ms (threads_processed=${summary.threadsProcessed}, threads_skipped=${summary.threadsSkipped}, threads_failed=${summary.threadsFailed}, patterns_inserted=${summary.patternsInserted}, cost_usd=${summary.totalUsdCost.toFixed(4)}, cost_eur=${summary.totalEurCost.toFixed(4)})`,
      {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          bulkRunId,
          threadsProcessed: summary.threadsProcessed,
          threadsSkipped: summary.threadsSkipped,
          threadsFailed: summary.threadsFailed,
          patternsInserted: summary.patternsInserted,
          totalUsdCost: summary.totalUsdCost,
          totalEurCost: summary.totalEurCost,
        },
      },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const failureReason = `pattern_extract_error: ${reason}`;
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
export async function handleEmailBulkPatternExtractJob(
  job: ClaimedJob,
): Promise<void> {
  await executeEmailBulkPatternExtract(job, {
    adminClient: createAdminClient(),
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────────────

async function processThreads(
  admin: AdminClient,
  run: BulkRunRow,
  job: ClaimedJob,
  threads: ThreadRow[],
  existingThreadIds: Set<string>,
  patternExtractor: PatternExtractor,
  costStore: CostCapStore,
  runCapEur: number,
  initialEurCost: number,
): Promise<PatternExtractionSummary> {
  const summary: PatternExtractionSummary = {
    threadsProcessed: 0,
    threadsSkipped: 0,
    threadsFailed: 0,
    patternsInserted: 0,
    totalUsdCost: 0,
    totalEurCost: initialEurCost,
    costCapExceeded: false,
  };

  for (const thread of threads) {
    // Idempotency: thread already has email_pattern → skip.
    if (existingThreadIds.has(thread.id)) {
      summary.threadsSkipped += 1;
      continue;
    }

    if (!thread.redacted_body || thread.redacted_body.length === 0) {
      // Thread ohne redacted_body kann nicht extrahiert werden (Pipeline-Lueck).
      summary.threadsSkipped += 1;
      captureWarning(
        `email_bulk_pattern_extract: thread ${thread.id} has empty redacted_body — skipping`,
        {
          source: LOG_SOURCE,
          metadata: { jobId: job.id, bulkRunId: run.id, threadId: thread.id },
        },
      );
      continue;
    }

    const threadMeta: ThreadMeta = {
      threadId: thread.id,
      subject: thread.subject ?? undefined,
      emailCount: thread.email_count ?? undefined,
      firstDate: thread.first_date ?? undefined,
    };

    // 1. Sonnet-Call (mit per-Thread Schema-Drift-Handling).
    let callResult: Awaited<ReturnType<PatternExtractor>>;
    try {
      callResult = await patternExtractor(thread.redacted_body, threadMeta);
    } catch (extractErr) {
      // AC-SLC-167-14: SonnetSchemaError → skip + continue. Andere Errors (z.B.
      // Bedrock-Timeout) auch skip + continue, weil Run-Level-Failure-Reason aus
      // dem catch-Block oben primaere Recovery-Quelle ist. Aber: andere Errors
      // re-thrown wir, weil sie Run-blocking sind.
      if (extractErr instanceof SonnetSchemaError) {
        summary.threadsFailed += 1;
        captureException(extractErr, {
          source: LOG_SOURCE,
          metadata: {
            jobId: job.id,
            bulkRunId: run.id,
            threadId: thread.id,
            kind: "sonnet_schema_drift",
          },
        });
        continue;
      }
      throw extractErr; // Bedrock-Timeout / Network-Error → Run-Fail
    }

    // 2. INSERT email_pattern Rows (1..5 per Thread). Pattern.themes ist
    //    Thread-Level (PatternExtractionResult.themes), nicht Pattern-Level.
    //    email_pattern.themes erbt deshalb pro Pattern den Thread-Level-Array.
    const patternRows = callResult.data.patterns.map((p) => ({
      tenant_id: run.tenant_id,
      bulk_run_id: run.id,
      thread_id: thread.id,
      title: p.title,
      description: p.description,
      evidence_snippets: p.evidence_snippets,
      themes: callResult.data.themes,
      confidence: p.confidence,
      suggested_section: p.suggested_section,
      // curation_status defaults to 'pending_curation' via DB schema
    }));

    if (patternRows.length > 0) {
      const { error: insertError } = await admin
        .from("email_pattern")
        .insert(patternRows);
      if (insertError) {
        throw new Error(
          `email_bulk_pattern_extract: email_pattern INSERT failed (thread=${thread.id}): ${insertError.message}`,
        );
      }
      summary.patternsInserted += patternRows.length;
    }

    // 3. Akkumuliere cost + UPDATE email_bulk_run.pattern_extraction_cost_eur
    //    (Live-Cap-Source).
    const callEurCost = callResult.costUsd * USD_TO_EUR_APPROX;
    summary.totalUsdCost += callResult.costUsd;
    summary.totalEurCost += callEurCost;

    const { error: costUpdateError } = await admin
      .from("email_bulk_run")
      .update({
        pattern_extraction_cost_eur: summary.totalEurCost,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    if (costUpdateError) {
      throw new Error(
        `email_bulk_pattern_extract: pattern_extraction_cost_eur UPDATE failed (thread=${thread.id}): ${costUpdateError.message}`,
      );
    }

    // 4. ai_cost_ledger per Bedrock-Call. Audit-Fail ist nicht-fatal
    //    (V8.1-Pattern + handle-pre-filter-job non-fatal).
    const { error: costInsertError } = await admin
      .from("ai_cost_ledger")
      .insert({
        tenant_id: run.tenant_id,
        job_id: job.id,
        model_id: callResult.modelId,
        tokens_in: callResult.tokensIn,
        tokens_out: callResult.tokensOut,
        usd_cost: callResult.costUsd,
        duration_ms: callResult.latencyMs,
        iteration: 1,
        role: AI_COST_LEDGER_ROLE,
      });
    if (costInsertError) {
      captureException(
        new Error(
          `email_bulk_pattern_extract: ai_cost_ledger INSERT failed (non-fatal): ${costInsertError.message}`,
        ),
        {
          source: LOG_SOURCE,
          metadata: {
            jobId: job.id,
            bulkRunId: run.id,
            threadId: thread.id,
          },
        },
      );
    }

    summary.threadsProcessed += 1;

    // 5. Live-Cap-Check NACH UPDATE. Source: email_bulk_run.pattern_extraction_cost_eur.
    const liveCheck = await checkLiveCapInWorker(run.id, runCapEur, costStore);
    if (liveCheck.exceeded) {
      summary.costCapExceeded = true;
      summary.totalEurCost = liveCheck.currentEur; // truth-source-aligned
      // Outer handler setzt status='failed' + failure_reason via summary.costCapExceeded
      break;
    }
  }

  return summary;
}
