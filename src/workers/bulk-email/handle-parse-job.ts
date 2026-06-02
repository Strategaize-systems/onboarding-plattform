// V9 SLC-165 MT-5 — Worker Handler `email_bulk_parse` (FEAT-070, MIG-051).
//
// Picks ai_jobs entries with job_type='email_bulk_parse', loads the
// email_bulk_run, downloads the source .mbox/.eml from the `bulk-email`
// Storage bucket via service_role, iterates the parser, INSERTs email_message
// rows in 100-row batches and finishes by setting bulk_run.status='parsed' +
// email_count.
//
// Status-Maschine (MIG-051):
//   uploaded -> parsing -> parsed   (success)
//   uploaded -> parsing -> failed   (any error in download / parse / insert)
//   != uploaded         -> no-op    (skip with warning + complete job)
//
// Crash-Recovery (DEC-MT-5-B confirmed 2026-06-02):
//   Worker always starts with `DELETE FROM email_message WHERE bulk_run_id=X`.
//   On crash the run stays at status='parsing' until a manual re-enqueue
//   (UI hook lands in V9.1+). Re-running cleans previous partial INSERTs and
//   re-parses from scratch — idempotent in effect.
//
// Storage-Read (DEC-MT-5-C confirmed 2026-06-02):
//   admin.storage.from('bulk-email').download(storage_path) with service_role.
//   Mirrors walkthrough-pattern (handle-transcribe-job.ts L132-141). Full
//   buffer load — Slice MT-4 already caps uploads at 500 MB, and the
//   parseMboxStream generator iterates incrementally inside the buffer.
//
// Batch-Insert (DEC-MT-5-A confirmed 2026-06-02):
//   Sammle 100 ParsedEmails -> one bulk INSERT per batch. Atomar pro Batch,
//   ~1 roundtrip per 100 emails. Skipped emails are counted but not persisted
//   in V9.0 (Slice-Spec L169 — defekt-row counts go to logs only).
//
// Dependency-Injection: executeEmailBulkParse(job, deps) for tests, thin
// handleEmailBulkParseJob(job) wrapper for production.

import { createAdminClient } from "../../lib/supabase/admin";
import {
  captureException,
  captureInfo,
  captureWarning,
} from "../../lib/logger";
import { parseEmlBuffer, parseMboxStream } from "../../lib/bulk-email/parser";
import type { ParsedEmail } from "../../lib/bulk-email/types";
import type { ClaimedJob } from "../condensation/claim-loop";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STORAGE_BUCKET = "bulk-email";
const BATCH_SIZE = 100;
const LOG_SOURCE = "email_bulk_parse";

type AdminClient = ReturnType<typeof createAdminClient>;

interface EmailBulkParsePayload {
  bulk_run_id: string;
}

interface BulkRunRow {
  id: string;
  tenant_id: string;
  storage_path: string;
  source_file_name: string;
  status: string;
}

export interface HandleEmailBulkParseDeps {
  adminClient: AdminClient;
  /** Pluggable for tests — defaults to the mailparser-backed mbox iterator. */
  parseMbox?: typeof parseMboxStream;
  /** Pluggable for tests — defaults to the mailparser-backed .eml parser. */
  parseEml?: typeof parseEmlBuffer;
  /** Pluggable for tests — defaults to BATCH_SIZE. */
  batchSize?: number;
}

interface ParseSummary {
  parsedCount: number;
  skippedCount: number;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * Decide whether a path points to a single .eml file. Anything else is
 * treated as mbox (Gmail-Takeout default extension is .mbox, but we also
 * accept legacy stripped paths — the parser then sees one large chunk).
 */
function isEmlPath(path: string): boolean {
  return path.toLowerCase().endsWith(".eml");
}

export async function executeEmailBulkParse(
  job: ClaimedJob,
  deps: HandleEmailBulkParseDeps,
): Promise<void> {
  const { adminClient } = deps;
  const parseMbox = deps.parseMbox ?? parseMboxStream;
  const parseEml = deps.parseEml ?? parseEmlBuffer;
  const batchSize = deps.batchSize ?? BATCH_SIZE;
  const startMs = Date.now();

  const payload = job.payload as unknown as EmailBulkParsePayload;
  if (!payload || !isUuid(payload.bulk_run_id)) {
    throw new Error(
      "email_bulk_parse: payload.bulk_run_id missing or not a UUID",
    );
  }
  const bulkRunId = payload.bulk_run_id;

  // 1. Load bulk_run via service_role (bypass RLS — system path).
  const { data: runRow, error: loadError } = await adminClient
    .from("email_bulk_run")
    .select("id, tenant_id, storage_path, source_file_name, status")
    .eq("id", bulkRunId)
    .single();
  if (loadError || !runRow) {
    throw new Error(
      `email_bulk_parse: email_bulk_run ${bulkRunId} not found: ${
        loadError?.message ?? "no row"
      }`,
    );
  }
  const run = runRow as BulkRunRow;

  // 2. Status-Skip fuer alles ausser 'uploaded' (idempotent, kein Throw).
  if (run.status !== "uploaded") {
    captureWarning(
      `email_bulk_parse: skipping bulk_run ${bulkRunId} with status='${run.status}' (expected 'uploaded')`,
      {
        source: LOG_SOURCE,
        metadata: { jobId: job.id, bulkRunId, status: run.status },
      },
    );
    await adminClient.rpc("rpc_complete_ai_job", { p_job_id: job.id });
    return;
  }

  // 3. Status='parsing'.
  const { error: startError } = await adminClient
    .from("email_bulk_run")
    .update({
      status: "parsing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bulkRunId);
  if (startError) {
    throw new Error(
      `email_bulk_parse: status='parsing' UPDATE failed: ${startError.message}`,
    );
  }

  try {
    // 4. Crash-Recovery: clean previous partial INSERTs from earlier crashed runs.
    //    Pattern per DEC-MT-5-B — confirmed 2026-06-02. Idempotent in effect.
    const { error: cleanError } = await adminClient
      .from("email_message")
      .delete()
      .eq("bulk_run_id", bulkRunId);
    if (cleanError) {
      throw new Error(
        `email_bulk_parse: pre-cleanup DELETE failed: ${cleanError.message}`,
      );
    }

    // 5. Download source file from Storage via service_role.
    const { data: fileBlob, error: downloadError } = await adminClient.storage
      .from(STORAGE_BUCKET)
      .download(run.storage_path);
    if (downloadError || !fileBlob) {
      throw new Error(
        `email_bulk_parse: storage download failed for ${run.storage_path}: ${
          downloadError?.message ?? "no data"
        }`,
      );
    }
    const sourceBuffer = Buffer.from(await fileBlob.arrayBuffer());

    // 6. Parse + persist. .eml = single message, .mbox = iterator.
    const summary = isEmlPath(run.storage_path)
      ? await parseAndPersistEml(
          adminClient,
          run,
          sourceBuffer,
          parseEml,
        )
      : await parseAndPersistMbox(
          adminClient,
          run,
          sourceBuffer,
          parseMbox,
          batchSize,
        );

    // 7. Flip status -> parsed + email_count.
    const { error: finishError } = await adminClient
      .from("email_bulk_run")
      .update({
        status: "parsed",
        email_count: summary.parsedCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bulkRunId);
    if (finishError) {
      throw new Error(
        `email_bulk_parse: status='parsed' UPDATE failed: ${finishError.message}`,
      );
    }

    // 8. Mark ai_job complete.
    const { error: completeError } = await adminClient.rpc(
      "rpc_complete_ai_job",
      { p_job_id: job.id },
    );
    if (completeError) {
      throw new Error(
        `email_bulk_parse: rpc_complete_ai_job failed: ${completeError.message}`,
      );
    }

    captureInfo(
      `email_bulk_parse: bulk_run=${bulkRunId} done in ${
        Date.now() - startMs
      }ms (parsed=${summary.parsedCount}, skipped=${summary.skippedCount}, file=${run.source_file_name})`,
      {
        source: LOG_SOURCE,
        metadata: {
          jobId: job.id,
          bulkRunId,
          parsedCount: summary.parsedCount,
          skippedCount: summary.skippedCount,
        },
      },
    );
  } catch (err) {
    // Best-effort: status='failed' + failure_reason + re-throw so claim-loop
    // fails the ai_job via rpc_fail_ai_job (existing pattern).
    const reason = err instanceof Error ? err.message : String(err);
    try {
      await adminClient
        .from("email_bulk_run")
        .update({
          status: "failed",
          failure_reason: reason.slice(0, 1000),
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
export async function handleEmailBulkParseJob(job: ClaimedJob): Promise<void> {
  await executeEmailBulkParse(job, { adminClient: createAdminClient() });
}

// ──────────────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────────────

async function parseAndPersistMbox(
  admin: AdminClient,
  run: BulkRunRow,
  buffer: Buffer,
  parseMbox: typeof parseMboxStream,
  batchSize: number,
): Promise<ParseSummary> {
  let parsedCount = 0;
  let skippedCount = 0;
  let batch: ParsedEmail[] = [];

  for await (const item of parseMbox(buffer)) {
    if (item.kind === "skipped") {
      skippedCount += 1;
      captureWarning(
        `email_bulk_parse: skipped email chunk ${item.skipped.chunkIndex} (${item.skipped.reason})`,
        {
          source: LOG_SOURCE,
          metadata: {
            bulkRunId: run.id,
            chunkIndex: item.skipped.chunkIndex,
            reason: item.skipped.reason,
            message: item.skipped.message,
          },
        },
      );
      continue;
    }
    batch.push(item.email);
    if (batch.length >= batchSize) {
      await insertBatch(admin, run, batch);
      parsedCount += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await insertBatch(admin, run, batch);
    parsedCount += batch.length;
  }
  return { parsedCount, skippedCount };
}

async function parseAndPersistEml(
  admin: AdminClient,
  run: BulkRunRow,
  buffer: Buffer,
  parseEml: typeof parseEmlBuffer,
): Promise<ParseSummary> {
  const email = await parseEml(buffer);
  await insertBatch(admin, run, [email]);
  return { parsedCount: 1, skippedCount: 0 };
}

async function insertBatch(
  admin: AdminClient,
  run: BulkRunRow,
  emails: ParsedEmail[],
): Promise<void> {
  const rows = emails.map((email) => ({
    tenant_id: run.tenant_id,
    bulk_run_id: run.id,
    message_id: email.messageId,
    in_reply_to: email.inReplyTo,
    references_array: email.referencesArray,
    from_address: email.fromAddress,
    to_addresses: email.toAddresses,
    cc_addresses: email.ccAddresses,
    subject: email.subject,
    date: email.date ? email.date.toISOString() : null,
    body_text: email.bodyText,
    body_html: email.bodyHtml,
    has_attachments: email.hasAttachments,
    attachment_metadata: email.attachmentMetadata,
  }));
  const { error } = await admin.from("email_message").insert(rows);
  if (error) {
    throw new Error(
      `email_bulk_parse: email_message INSERT failed (${rows.length} rows): ${error.message}`,
    );
  }
}
