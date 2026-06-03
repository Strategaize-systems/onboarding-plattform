// V9 SLC-166 MT-6 — Worker Handler `email_bulk_thread_redact` (FEAT-072,
// MIG-051 + MIG-106 + MIG-108).
//
// Picks ai_jobs entries with job_type='email_bulk_thread_redact', laedt die
// email_bulk_run (status='pre_filtered'), liest content+unclear Emails,
// aggregiert Threads via aggregateThreads (MT-4 Pure-Function), persistiert
// email_thread-Rows + UPDATE email_message.thread_id, ruft pro Thread
// redactEmailThread (MT-5 Wrapper um chatWithLLM Sonnet eu-central-1) auf,
// schreibt participant_pseudonyms + redacted_body + ai_cost_ledger pro Call
// (role='email_bulk_pii_redact') und schliesst mit status='thread_redacted'
// + thread_count=N ab.
//
// Status-Maschine (MIG-051 + MIG-106):
//   pre_filtered  -> thread_redacting -> thread_redacted (success)
//   pre_filtered  -> thread_redacting -> failed          (any error)
//   != pre_filtered -> no-op                             (skip + rpc_complete_ai_job)
//
// Idempotenz (Spec R3 + L184):
//   Beim Re-Run nach Crash werden bereits persistierte email_thread-Rows
//   (gleiche bulk_run_id + root_message_id) uebersprungen — wir gruppieren
//   nur die noch nicht persistierten Threads. UPDATE email_message.thread_id
//   nutzt eq message_id (nicht UPSERT) — bei bestehendem thread_id wird er
//   ueberschrieben mit dem Wert aus dem neuen Run (was OK ist, weil der Re-Run
//   den gleichen Algorithmus laeuft und ggf. gleiche Group ergibt).
//
// Cost-Tracking (DEC-167 Pattern + V5-Worker handle-redact-pii-job):
//   redactEmailThread liefert chars/4-Token-Heuristik. Wir multiplizieren mit
//   Sonnet-USD-pro-Token-Konstanten und schreiben pro Thread einen
//   ai_cost_ledger-Eintrag mit role='email_bulk_pii_redact'. Audit-Fail
//   ist non-fatal (V8.1-Pattern + V5-Worker-Pattern L208-220).
//
// Dependency-Injection: executeEmailBulkThreadRedact(job, deps) fuer Tests,
// thin handleEmailBulkThreadRedactJob(job) Wrapper fuer Production.

import { createAdminClient } from "../../lib/supabase/admin";
import {
  captureException,
  captureInfo,
  captureWarning,
} from "../../lib/logger";
import { chatWithLLM } from "../../lib/llm";
import {
  aggregateThreads,
  type EmailForThreading,
  type EmailThread,
} from "../../lib/bulk-email/thread-aggregation";
import {
  redactEmailThread,
  type EmailForRedaction,
} from "../../lib/ai/pii-patterns/email-adapter";
import type { ClaimedJob } from "../condensation/claim-loop";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOG_SOURCE = "email_bulk_thread_redact";
const AI_COST_LEDGER_ROLE = "email_bulk_pii_redact";

// Sonnet-4 Pricing (USD pro Token) — Pattern aus V5-Worker handle-redact-pii-job.ts
const COST_PER_INPUT_TOKEN_USD = 0.003 / 1000;
const COST_PER_OUTPUT_TOKEN_USD = 0.015 / 1000;

const MODEL_ID = process.env.LLM_MODEL || "eu.anthropic.claude-sonnet-4-20250514-v1:0";

type AdminClient = ReturnType<typeof createAdminClient>;

interface EmailBulkThreadRedactPayload {
  bulk_run_id: string;
}

interface BulkRunRow {
  id: string;
  tenant_id: string;
  status: string;
  uploader_user_id: string;
}

interface EmailMessageRow {
  id: string;
  message_id: string;
  subject: string | null;
  date: string | null;
  in_reply_to: string | null;
  references_array: string[] | null;
  from_address: string | null;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  body_text: string | null;
}

interface ExistingThreadRow {
  id: string;
  root_message_id: string;
}

/**
 * Test-Injection-Hook fuer Bedrock-Call. Production setzt das nicht — Default
 * delegiert an chatWithLLM (Sonnet eu-central-1). redactEmailThread nimmt das
 * via options.chatCaller entgegen.
 */
export type ChatCaller = typeof chatWithLLM;

export interface HandleEmailBulkThreadRedactDeps {
  adminClient: AdminClient;
  /** Pluggable for tests — defaults to chatWithLLM. */
  chatCaller?: ChatCaller;
  /** Pluggable for tests — Tenant-Domain wird sonst aus uploader-email-Domain
   *  abgeleitet. Tests koennen direkt einen String setzen. */
  tenantDomainResolver?: (run: BulkRunRow) => Promise<string | undefined>;
}

interface ThreadRedactSummary {
  threadInsertedCount: number;
  threadSkippedCount: number;
  emailRedactedCount: number;
  totalUsdCost: number;
  /**
   * V9 SLC-166 MT-7 L-1 Code-Defense: Thread-DB-IDs, die im aktuellen Worker-
   * Lauf INSERTed wurden und noch NICHT erfolgreich auf 'redacted' geflippt
   * sind. Bei einem Crash im outer try wird der catch-Block diese Threads
   * auf 'failed' setzen (Spec L179 — per-Thread Crash-State).
   */
  inProgressThreadIds: Set<string>;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

const defaultTenantDomainResolver = async (
  _run: BulkRunRow,
): Promise<string | undefined> => {
  // V9.0-Pragmatismus: Tenant-Domain-Lookup ist out-of-scope. extractParticipantMap
  // funktioniert auch ohne tenantDomain (first-seen Reihenfolge). MT-7 oder
  // V9.1+ kann einen echten Resolver einfuegen.
  return undefined;
};

export async function executeEmailBulkThreadRedact(
  job: ClaimedJob,
  deps: HandleEmailBulkThreadRedactDeps,
): Promise<void> {
  const { adminClient } = deps;
  const chatCaller = deps.chatCaller ?? chatWithLLM;
  const resolveTenantDomain =
    deps.tenantDomainResolver ?? defaultTenantDomainResolver;
  const startMs = Date.now();

  // V9 SLC-166 MT-7 L-1 Code-Defense: per-Thread "in flight"-Tracking. Wird
  // unten an processThreads weitergereicht; Set wird live mutiert (push bei
  // INSERT email_thread('redacting'), pop bei erfolgreichem UPDATE auf
  // 'redacted'). Bei Crash setzt der catch-Block die verbliebenen IDs auf
  // 'failed' (Spec L179 — per-Thread Crash-State, ergaenzt zum Run-Level-
  // Fail aus MT-6).
  const inProgressThreadIds = new Set<string>();

  const payload = job.payload as unknown as EmailBulkThreadRedactPayload;
  if (!payload || !isUuid(payload.bulk_run_id)) {
    throw new Error(
      "email_bulk_thread_redact: payload.bulk_run_id missing or not a UUID",
    );
  }
  const bulkRunId = payload.bulk_run_id;

  // 1. Load bulk_run via service_role.
  const { data: runRow, error: loadError } = await adminClient
    .from("email_bulk_run")
    .select("id, tenant_id, status, uploader_user_id")
    .eq("id", bulkRunId)
    .single();
  if (loadError || !runRow) {
    throw new Error(
      `email_bulk_thread_redact: email_bulk_run ${bulkRunId} not found: ${
        loadError?.message ?? "no row"
      }`,
    );
  }
  const run = runRow as BulkRunRow;

  // 2. Status-Skip fuer alles ausser 'pre_filtered' (idempotent, kein Throw).
  if (run.status !== "pre_filtered") {
    captureWarning(
      `email_bulk_thread_redact: skipping bulk_run ${bulkRunId} with status='${run.status}' (expected 'pre_filtered')`,
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
        `email_bulk_thread_redact: rpc_complete_ai_job failed on status-skip path: ${skipCompleteError.message}`,
      );
    }
    return;
  }

  // 3. Status='thread_redacting'.
  const { error: startError } = await adminClient
    .from("email_bulk_run")
    .update({
      status: "thread_redacting",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bulkRunId);
  if (startError) {
    throw new Error(
      `email_bulk_thread_redact: status='thread_redacting' UPDATE failed: ${startError.message}`,
    );
  }

  try {
    // 4. Load content+unclear email_message-rows fuer Aggregation.
    const { data: messageRows, error: messagesError } = await adminClient
      .from("email_message")
      .select(
        "id, message_id, subject, date, in_reply_to, references_array, from_address, to_addresses, cc_addresses, body_text",
      )
      .eq("bulk_run_id", bulkRunId)
      .in("pre_filter_label", ["content", "unclear"]);
    if (messagesError) {
      throw new Error(
        `email_bulk_thread_redact: email_message SELECT failed: ${messagesError.message}`,
      );
    }
    const messages = (messageRows ?? []) as EmailMessageRow[];

    // 5. Pure-Aggregation (MT-4).
    const threadingInput: EmailForThreading[] = messages.map((m) => ({
      message_id: m.message_id,
      in_reply_to: m.in_reply_to,
      references_array: m.references_array,
      subject: m.subject,
      date: m.date,
    }));
    const allThreads = aggregateThreads(threadingInput);

    // 6. Idempotency-Filter: bestehende email_thread fuer diesen bulk_run
    //    skippen (Re-Run-Schutz).
    const { data: existingRows, error: existingError } = await adminClient
      .from("email_thread")
      .select("id, root_message_id")
      .eq("bulk_run_id", bulkRunId);
    if (existingError) {
      throw new Error(
        `email_bulk_thread_redact: existing email_thread SELECT failed: ${existingError.message}`,
      );
    }
    const existingRoots = new Set<string>(
      (existingRows ?? []).map((r) => (r as ExistingThreadRow).root_message_id),
    );

    const todoThreads = allThreads.filter(
      (t) => !existingRoots.has(t.root_message_id),
    );

    // 7. Optional: Tenant-Domain fuer GF-Priority.
    const tenantDomain = await resolveTenantDomain(run);

    // 8. Pro Thread: INSERT email_thread('redacting') → redactEmailThread →
    //    UPDATE email_thread('redacted') + UPDATE email_message.thread_id +
    //    pii_redacted=true + ai_cost_ledger.
    const summary = await processThreads(
      adminClient,
      run,
      job,
      todoThreads,
      messages,
      tenantDomain,
      chatCaller,
      inProgressThreadIds,
    );

    // 9. Skip-Count = bestehende Threads die wir wegen Idempotenz nicht
    //    angefasst haben. Total fuer thread_count = persistierte + neue.
    summary.threadSkippedCount = existingRoots.size;
    const totalThreadCount =
      summary.threadInsertedCount + summary.threadSkippedCount;

    // 10. Flip status -> thread_redacted + thread_count.
    const { error: finishError } = await adminClient
      .from("email_bulk_run")
      .update({
        status: "thread_redacted",
        thread_count: totalThreadCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bulkRunId);
    if (finishError) {
      throw new Error(
        `email_bulk_thread_redact: status='thread_redacted' UPDATE failed: ${finishError.message}`,
      );
    }

    // 11. Mark ai_job complete.
    const { error: completeError } = await adminClient.rpc(
      "rpc_complete_ai_job",
      { p_job_id: job.id },
    );
    if (completeError) {
      throw new Error(
        `email_bulk_thread_redact: rpc_complete_ai_job failed: ${completeError.message}`,
      );
    }

    captureInfo(
      `email_bulk_thread_redact: bulk_run=${bulkRunId} done in ${
        Date.now() - startMs
      }ms (threads_total=${totalThreadCount}, threads_new=${summary.threadInsertedCount}, threads_skipped=${summary.threadSkippedCount}, emails_redacted=${summary.emailRedactedCount}, cost_usd=${summary.totalUsdCost.toFixed(4)})`,
      {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          bulkRunId,
          totalThreadCount,
          threadInsertedCount: summary.threadInsertedCount,
          threadSkippedCount: summary.threadSkippedCount,
          emailRedactedCount: summary.emailRedactedCount,
          totalUsdCost: summary.totalUsdCost,
        },
      },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const failureReason = `thread_redact_error: ${reason}`;

    // V9 SLC-166 MT-7 L-1 Code-Defense: in-flight email_thread-Rows auf
    // 'failed' setzen (Spec L179). Best-effort — ein DB-Fehler hier wird
    // geloggt aber nicht re-thrown, weil der Run-Level-Fail-State unten die
    // primaere Recovery-Quelle ist und Idempotency-Filter beim Re-Run
    // 'redacting'-Stale-Rows ohnehin erkennt.
    if (inProgressThreadIds.size > 0) {
      try {
        await adminClient
          .from("email_thread")
          .update({ thread_status: "failed" })
          .in("id", Array.from(inProgressThreadIds));
      } catch (threadFailErr) {
        captureException(threadFailErr, {
          source: LOG_SOURCE,
          metadata: {
            jobId: job.id,
            bulkRunId,
            phase: "set-thread-status-failed",
            inProgressCount: inProgressThreadIds.size,
          },
        });
      }
    }

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
export async function handleEmailBulkThreadRedactJob(
  job: ClaimedJob,
): Promise<void> {
  await executeEmailBulkThreadRedact(job, {
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
  threads: EmailThread[],
  messages: EmailMessageRow[],
  tenantDomain: string | undefined,
  chatCaller: ChatCaller,
  inProgressThreadIds: Set<string>,
): Promise<ThreadRedactSummary> {
  const summary: ThreadRedactSummary = {
    threadInsertedCount: 0,
    threadSkippedCount: 0,
    emailRedactedCount: 0,
    totalUsdCost: 0,
    inProgressThreadIds,
  };

  // Lookup: message_id (RFC-5322) -> EmailMessageRow.
  const messagesByMessageId = new Map<string, EmailMessageRow>();
  for (const m of messages) {
    messagesByMessageId.set(m.message_id, m);
  }

  for (const thread of threads) {
    // 1. INSERT email_thread('redacting') BEFORE Bedrock-Call — so dass bei
    //    Crash der DB-State sichtbar 'redacting' bleibt und der Operator
    //    Stale-Detection kann.
    const { data: insertedRow, error: insertError } = await admin
      .from("email_thread")
      .insert({
        tenant_id: run.tenant_id,
        bulk_run_id: run.id,
        root_message_id: thread.root_message_id,
        subject: thread.subject || null,
        email_count: thread.email_count,
        first_date: thread.first_date,
        last_date: thread.last_date,
        thread_status: "redacting",
      })
      .select("id")
      .single();
    if (insertError || !insertedRow) {
      throw new Error(
        `email_bulk_thread_redact: email_thread INSERT failed (root=${thread.root_message_id}): ${
          insertError?.message ?? "no row"
        }`,
      );
    }
    const threadDbId = (insertedRow as { id: string }).id;

    // V9 SLC-166 MT-7 L-1 Code-Defense: Thread ist jetzt 'redacting' und
    // in flight. Bei Crash bis vor dem 'redacted'-UPDATE muss er auf 'failed'.
    inProgressThreadIds.add(threadDbId);

    // 2. Map die Email-Message-Rows fuer diesen Thread.
    const threadEmails: EmailForRedaction[] = [];
    const threadDbIds: string[] = [];
    for (const mid of thread.message_ids) {
      const m = messagesByMessageId.get(mid);
      if (!m) continue;
      threadEmails.push({
        message_id: m.message_id,
        from_address: m.from_address,
        to_addresses: m.to_addresses,
        cc_addresses: m.cc_addresses,
        subject: m.subject,
        date: m.date,
        body_text: m.body_text,
      });
      threadDbIds.push(m.id);
    }

    // 3. UPDATE email_message.thread_id (alle Member auf den neuen Thread-DB-ID).
    if (threadDbIds.length > 0) {
      const { error: linkError } = await admin
        .from("email_message")
        .update({ thread_id: threadDbId })
        .in("id", threadDbIds);
      if (linkError) {
        throw new Error(
          `email_bulk_thread_redact: email_message.thread_id UPDATE failed (thread_db_id=${threadDbId}): ${linkError.message}`,
        );
      }
    }

    // 4. Bedrock-PII-Redaction (V5-Pattern via redactEmailThread Wrapper).
    const redactResult = await redactEmailThread(thread, threadEmails, {
      chatCaller,
      tenantDomain,
    });

    // 5. UPDATE email_thread mit redacted-body + participant_pseudonyms +
    //    thread_status='redacted'.
    const pseudonymsJson: Record<string, string> = {};
    for (const [email, pseudonym] of redactResult.participantMap.byEmail) {
      pseudonymsJson[email] = pseudonym;
    }
    const { error: redactUpdateError } = await admin
      .from("email_thread")
      .update({
        participant_pseudonyms: pseudonymsJson,
        redacted_body: redactResult.redactedBody,
        thread_status: "redacted",
      })
      .eq("id", threadDbId);
    if (redactUpdateError) {
      throw new Error(
        `email_bulk_thread_redact: email_thread UPDATE(redacted) failed (thread_db_id=${threadDbId}): ${redactUpdateError.message}`,
      );
    }

    // V9 SLC-166 MT-7 L-1 Code-Defense: Thread ist jetzt 'redacted' und nicht
    // mehr in flight. Aus der Crash-Recovery-Liste entfernen.
    inProgressThreadIds.delete(threadDbId);

    // 6. UPDATE email_message.pii_redacted=true fuer alle Thread-Member.
    if (threadDbIds.length > 0) {
      const { error: piiFlagError } = await admin
        .from("email_message")
        .update({ pii_redacted: true })
        .in("id", threadDbIds);
      if (piiFlagError) {
        throw new Error(
          `email_bulk_thread_redact: email_message.pii_redacted UPDATE failed (thread_db_id=${threadDbId}): ${piiFlagError.message}`,
        );
      }
    }

    // 7. ai_cost_ledger pro Bedrock-Call. Non-fatal bei Insert-Fehler
    //    (V8.1-Pattern + V5-Worker-Pattern handle-redact-pii-job L208-220).
    const usdCost =
      redactResult.estimatedInputTokens * COST_PER_INPUT_TOKEN_USD +
      redactResult.estimatedOutputTokens * COST_PER_OUTPUT_TOKEN_USD;
    summary.totalUsdCost += usdCost;

    const { error: costInsertError } = await admin
      .from("ai_cost_ledger")
      .insert({
        tenant_id: run.tenant_id,
        job_id: job.id,
        model_id: MODEL_ID,
        tokens_in: redactResult.estimatedInputTokens,
        tokens_out: redactResult.estimatedOutputTokens,
        usd_cost: usdCost,
        duration_ms: redactResult.callDurationMs,
        iteration: 1,
        role: AI_COST_LEDGER_ROLE,
      });
    if (costInsertError) {
      captureException(
        new Error(
          `email_bulk_thread_redact: ai_cost_ledger INSERT failed (non-fatal): ${costInsertError.message}`,
        ),
        {
          source: LOG_SOURCE,
          metadata: {
            jobId: job.id,
            bulkRunId: run.id,
            threadDbId,
            costErrorCode: (costInsertError as { code?: string }).code,
          },
        },
      );
    }

    summary.threadInsertedCount += 1;
    summary.emailRedactedCount += threadDbIds.length;
  }

  return summary;
}
