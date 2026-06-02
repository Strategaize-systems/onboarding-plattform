// V9 SLC-165 MT-5 — Vitest fuer executeEmailBulkParse (Worker `email_bulk_parse`).
//
// Strategie: Dependency-Injection-Pattern wie lead-push/handle-job.test.ts
// (V6 SLC-106 MT-6 RPT-281). Wir bauen eine Trace-Recording-AdminClient-Stub
// und injizieren Mock-Parser-Funktionen. Keine vi.mock-Module-Level-Tricks —
// Logger wird per vi.mock weggespart, weil er Supabase-Client beim Import
// instanziiert.
//
// Coverage:
//   1. Payload-Validation: missing/invalid bulk_run_id Throws.
//   2. Bulk-Run-Load: not-found Throws.
//   3. Status-Skip: status='parsing' => warn + complete + return (no INSERTs).
//   4. Happy Path .mbox: 150 emails -> 2 batches (100 + 50), status flips,
//      rpc_complete_ai_job called, email_count = 150.
//   5. Happy Path .eml: single email -> 1 INSERT, email_count = 1.
//   6. Skipped emails: parser yields kind='skipped' -> kein INSERT, skippedCount
//      im Log, aber Worker completes normal.
//   7. Crash-Recovery: pre-cleanup DELETE FROM email_message gets called.
//   8. Storage-Download-Fail: status='failed' + failure_reason + re-throw.
//   9. INSERT-Fail: status='failed' + failure_reason + re-throw.
//  10. Cross-Tenant-Isolation: INSERT-Rows tragen tenant_id der bulk_run, nicht
//      des Job-Payloads (Defense-in-depth gegen tenant_id-Injection im payload).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Logger first — it imports @supabase/supabase-js at module top.
vi.mock("../../../lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
  captureWarning: vi.fn(),
}));

// admin.ts pulls @supabase/supabase-js too — stub the factory so the worker
// module can be imported. The actual client used in tests is injected via deps.
vi.mock("../../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

import { executeEmailBulkParse } from "../handle-parse-job";
import type { ClaimedJob } from "../../condensation/claim-loop";
import type { MboxIteratorItem, ParsedEmail } from "../../../lib/bulk-email/types";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const BULK_RUN_ID = "22222222-2222-2222-2222-222222222222";
const JOB_ID = "33333333-3333-3333-3333-333333333333";

function makeJob(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    job_type: "email_bulk_parse",
    payload: { bulk_run_id: BULK_RUN_ID },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeParsedEmail(seed: number): ParsedEmail {
  return {
    messageId: `<msg-${seed}@example.test>`,
    messageIdSynthesized: false,
    inReplyTo: null,
    referencesArray: [],
    fromAddress: `from-${seed}@example.test`,
    toAddresses: [`to-${seed}@example.test`],
    ccAddresses: [],
    subject: `Subject ${seed}`,
    date: new Date(2024, 0, 1, seed % 24),
    bodyText: `Body ${seed}`,
    bodyHtml: null,
    hasAttachments: false,
    attachmentMetadata: [],
  };
}

interface BulkRunStub {
  id: string;
  tenant_id: string;
  storage_path: string;
  source_file_name: string;
  status: string;
}

interface AdminStubOptions {
  bulkRun?: BulkRunStub | null;
  loadError?: { message: string } | null;
  cleanError?: { message: string } | null;
  downloadError?: { message: string } | null;
  downloadBlob?: Blob | null;
  insertError?: { message: string } | null;
  startUpdateError?: { message: string } | null;
  finishUpdateError?: { message: string } | null;
  failedUpdateError?: { message: string } | null;
  rpcCompleteError?: { message: string } | null;
}

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: { col: string; val: unknown };
}

interface InsertCall {
  table: string;
  rows: Array<Record<string, unknown>>;
}

interface DeleteCall {
  table: string;
  filter: { col: string; val: unknown };
}

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

interface StorageCall {
  bucket: string;
  path: string;
}

interface AdminStubState {
  updates: UpdateCall[];
  inserts: InsertCall[];
  deletes: DeleteCall[];
  rpcs: RpcCall[];
  storageDownloads: StorageCall[];
}

function makeAdminStub(opts: AdminStubOptions): {
  client: ReturnType<typeof buildClient>;
  state: AdminStubState;
} {
  const state: AdminStubState = {
    updates: [],
    inserts: [],
    deletes: [],
    rpcs: [],
    storageDownloads: [],
  };

  let updateCounter = 0;

  function buildClient() {
    return {
      from(table: string) {
        return {
          select(_cols: string) {
            return {
              eq(col: string, val: string) {
                return {
                  async single() {
                    if (table === "email_bulk_run" && col === "id") {
                      if (opts.loadError) {
                        return { data: null, error: opts.loadError };
                      }
                      if (!opts.bulkRun) {
                        return {
                          data: null,
                          error: { message: "row not found" },
                        };
                      }
                      return { data: opts.bulkRun, error: null };
                    }
                    return {
                      data: null,
                      error: { message: `unexpected SELECT on ${table}` },
                    };
                  },
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              async eq(col: string, val: unknown) {
                state.updates.push({ table, patch, filter: { col, val } });
                updateCounter += 1;
                // Distinguish update phases by call order:
                //   1 = status='parsing'  (start)
                //   2 = status='parsed' OR status='failed' (finish/abort)
                //   3+ = follow-up status='failed' chained after error
                if (
                  table === "email_bulk_run" &&
                  patch.status === "parsing" &&
                  opts.startUpdateError
                ) {
                  return { error: opts.startUpdateError };
                }
                if (
                  table === "email_bulk_run" &&
                  patch.status === "parsed" &&
                  opts.finishUpdateError
                ) {
                  return { error: opts.finishUpdateError };
                }
                if (
                  table === "email_bulk_run" &&
                  patch.status === "failed" &&
                  opts.failedUpdateError
                ) {
                  return { error: opts.failedUpdateError };
                }
                return { error: null };
              },
            };
          },
          delete() {
            return {
              async eq(col: string, val: unknown) {
                state.deletes.push({ table, filter: { col, val } });
                if (
                  table === "email_message" &&
                  opts.cleanError
                ) {
                  return { error: opts.cleanError };
                }
                return { error: null };
              },
            };
          },
          async insert(rows: Array<Record<string, unknown>>) {
            state.inserts.push({ table, rows });
            if (table === "email_message" && opts.insertError) {
              return { error: opts.insertError };
            }
            return { error: null };
          },
        };
      },
      storage: {
        from(bucket: string) {
          return {
            async download(path: string) {
              state.storageDownloads.push({ bucket, path });
              if (opts.downloadError) {
                return { data: null, error: opts.downloadError };
              }
              if (opts.downloadBlob === null) {
                return { data: null, error: { message: "no data" } };
              }
              const blob =
                opts.downloadBlob ??
                new Blob(["fake-mbox-bytes"], { type: "text/plain" });
              return { data: blob, error: null };
            },
          };
        },
      },
      async rpc(name: string, args: Record<string, unknown>) {
        state.rpcs.push({ name, args });
        if (name === "rpc_complete_ai_job" && opts.rpcCompleteError) {
          return { error: opts.rpcCompleteError };
        }
        return { error: null };
      },
    };
  }

  // Suppress unused-variable lint for updateCounter (kept for future use).
  void updateCounter;

  return { client: buildClient(), state };
}

const RUN_OK: BulkRunStub = {
  id: BULK_RUN_ID,
  tenant_id: TENANT_ID,
  storage_path: `${TENANT_ID}/abc/test.mbox`,
  source_file_name: "test.mbox",
  status: "uploaded",
};

async function* mboxIteratorOf(
  emails: ParsedEmail[],
  skipped: number = 0,
): AsyncIterableIterator<MboxIteratorItem> {
  for (const e of emails) {
    yield { kind: "email", email: e };
  }
  for (let i = 0; i < skipped; i++) {
    yield {
      kind: "skipped",
      skipped: {
        chunkIndex: emails.length + i,
        reason: "test",
        message: `skipped ${i}`,
      },
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("executeEmailBulkParse — payload validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when bulk_run_id is missing", async () => {
    const { client } = makeAdminStub({ bulkRun: RUN_OK });
    await expect(
      executeEmailBulkParse(makeJob({ payload: {} }), {
        adminClient: client as never,
      }),
    ).rejects.toThrow(/bulk_run_id missing or not a UUID/);
  });

  it("throws when bulk_run_id is not a UUID", async () => {
    const { client } = makeAdminStub({ bulkRun: RUN_OK });
    await expect(
      executeEmailBulkParse(
        makeJob({ payload: { bulk_run_id: "not-a-uuid" } }),
        { adminClient: client as never },
      ),
    ).rejects.toThrow(/not a UUID/);
  });
});

describe("executeEmailBulkParse — bulk_run load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when bulk_run row not found", async () => {
    const { client } = makeAdminStub({
      bulkRun: null,
      loadError: { message: "no row" },
    });
    await expect(
      executeEmailBulkParse(makeJob(), { adminClient: client as never }),
    ).rejects.toThrow(/email_bulk_run .* not found/);
  });
});

describe("executeEmailBulkParse — status skip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips with warning + completes job when status != 'uploaded'", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: { ...RUN_OK, status: "parsing" },
    });
    await executeEmailBulkParse(makeJob(), {
      adminClient: client as never,
    });

    // No INSERTs, no DELETEs, no storage downloads — just rpc_complete_ai_job.
    expect(state.inserts).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
    expect(state.storageDownloads).toHaveLength(0);
    expect(state.rpcs).toEqual([
      { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
    ]);
  });

  it("throws when rpc_complete_ai_job fails on status-skip path (ISSUE-088)", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: { ...RUN_OK, status: "parsing" },
      rpcCompleteError: { message: "rpc unavailable" },
    });
    await expect(
      executeEmailBulkParse(makeJob(), { adminClient: client as never }),
    ).rejects.toThrow(/rpc_complete_ai_job failed on status-skip path/);
    expect(state.rpcs).toEqual([
      { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
    ]);
    expect(state.inserts).toHaveLength(0);
    expect(state.storageDownloads).toHaveLength(0);
  });
});

describe("executeEmailBulkParse — defense-in-depth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when storage_path lacks the tenant_id prefix (ISSUE-089)", async () => {
    const evilRun: BulkRunStub = {
      ...RUN_OK,
      storage_path: "44444444-4444-4444-4444-444444444444/secret/foo.mbox",
    };
    const { client, state } = makeAdminStub({ bulkRun: evilRun });
    await expect(
      executeEmailBulkParse(makeJob(), { adminClient: client as never }),
    ).rejects.toThrow(/storage_path tenant prefix mismatch/);

    // Defense fires before any state change: no storage download, no status
    // updates, no rpc_complete.
    expect(state.storageDownloads).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
    expect(state.rpcs).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
  });
});

describe("executeEmailBulkParse — happy path (.mbox)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses 150 emails into 2 batches (100 + 50)", async () => {
    const { client, state } = makeAdminStub({ bulkRun: RUN_OK });
    const emails = Array.from({ length: 150 }, (_, i) => makeParsedEmail(i));

    await executeEmailBulkParse(makeJob(), {
      adminClient: client as never,
      parseMbox: (() => mboxIteratorOf(emails)) as never,
    });

    // 2 INSERT batches.
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[0].rows).toHaveLength(100);
    expect(state.inserts[1].rows).toHaveLength(50);

    // Pre-cleanup DELETE happened.
    expect(state.deletes).toHaveLength(1);
    expect(state.deletes[0]).toEqual({
      table: "email_message",
      filter: { col: "bulk_run_id", val: BULK_RUN_ID },
    });

    // Storage download for the storage_path.
    expect(state.storageDownloads).toEqual([
      { bucket: "bulk-email", path: RUN_OK.storage_path },
    ]);

    // Two updates: parsing -> parsed. (No failed update.)
    const statusPatches = state.updates
      .filter((u) => u.table === "email_bulk_run")
      .map((u) => u.patch.status);
    expect(statusPatches).toEqual(["parsing", "parsed"]);

    const finishUpdate = state.updates.find(
      (u) => u.table === "email_bulk_run" && u.patch.status === "parsed",
    );
    expect(finishUpdate?.patch.email_count).toBe(150);

    // Job completed.
    expect(state.rpcs).toEqual([
      { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
    ]);
  });

  it("uses bulk_run.tenant_id for inserted rows (defense vs payload tenant_id)", async () => {
    const { client, state } = makeAdminStub({ bulkRun: RUN_OK });
    const emails = [makeParsedEmail(1)];

    // Even if the job payload contained a different tenant_id, the worker must
    // use bulk_run.tenant_id from the loaded row.
    await executeEmailBulkParse(
      makeJob({
        payload: { bulk_run_id: BULK_RUN_ID, tenant_id: "evil-tenant" },
        tenant_id: "evil-tenant",
      } as never),
      {
        adminClient: client as never,
        parseMbox: (() => mboxIteratorOf(emails)) as never,
      },
    );

    expect(state.inserts[0].rows[0].tenant_id).toBe(TENANT_ID);
  });

  it("logs skipped emails but does not insert them", async () => {
    const { client, state } = makeAdminStub({ bulkRun: RUN_OK });
    const emails = [makeParsedEmail(1), makeParsedEmail(2)];

    await executeEmailBulkParse(makeJob(), {
      adminClient: client as never,
      parseMbox: (() => mboxIteratorOf(emails, 3)) as never, // 3 skipped
    });

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].rows).toHaveLength(2);

    const finishUpdate = state.updates.find(
      (u) => u.table === "email_bulk_run" && u.patch.status === "parsed",
    );
    expect(finishUpdate?.patch.email_count).toBe(2);
  });
});

describe("executeEmailBulkParse — happy path (.eml)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses a single .eml into one INSERT", async () => {
    const emlRun: BulkRunStub = {
      ...RUN_OK,
      storage_path: `${TENANT_ID}/abc/single.eml`,
      source_file_name: "single.eml",
    };
    const { client, state } = makeAdminStub({ bulkRun: emlRun });
    const email = makeParsedEmail(42);

    await executeEmailBulkParse(makeJob(), {
      adminClient: client as never,
      parseEml: (async () => email) as never,
    });

    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].rows).toHaveLength(1);
    expect(state.inserts[0].rows[0].message_id).toBe(email.messageId);

    const finishUpdate = state.updates.find(
      (u) => u.table === "email_bulk_run" && u.patch.status === "parsed",
    );
    expect(finishUpdate?.patch.email_count).toBe(1);
  });
});

describe("executeEmailBulkParse — failure paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("flips status to 'failed' on storage download error and re-throws", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: RUN_OK,
      downloadError: { message: "404 not found" },
    });

    await expect(
      executeEmailBulkParse(makeJob(), {
        adminClient: client as never,
        parseMbox: (() => mboxIteratorOf([])) as never,
      }),
    ).rejects.toThrow(/storage download failed/);

    const statusPatches = state.updates
      .filter((u) => u.table === "email_bulk_run")
      .map((u) => u.patch.status);
    // parsing (start) then failed (error path).
    expect(statusPatches).toEqual(["parsing", "failed"]);
    const failed = state.updates.find(
      (u) => u.table === "email_bulk_run" && u.patch.status === "failed",
    );
    expect(failed?.patch.failure_reason).toMatch(/storage download failed/);
  });

  it("flips status to 'failed' on INSERT error and re-throws", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: RUN_OK,
      insertError: { message: "constraint violation" },
    });

    await expect(
      executeEmailBulkParse(makeJob(), {
        adminClient: client as never,
        parseMbox: (() => mboxIteratorOf([makeParsedEmail(1)])) as never,
      }),
    ).rejects.toThrow(/email_message INSERT failed/);

    const failed = state.updates.find(
      (u) => u.table === "email_bulk_run" && u.patch.status === "failed",
    );
    expect(failed?.patch.failure_reason).toMatch(/email_message INSERT failed/);
  });

  it("flips status to 'failed' on pre-cleanup DELETE error", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: RUN_OK,
      cleanError: { message: "permission denied" },
    });

    await expect(
      executeEmailBulkParse(makeJob(), {
        adminClient: client as never,
        parseMbox: (() => mboxIteratorOf([makeParsedEmail(1)])) as never,
      }),
    ).rejects.toThrow(/pre-cleanup DELETE failed/);

    const failed = state.updates.find(
      (u) => u.table === "email_bulk_run" && u.patch.status === "failed",
    );
    expect(failed?.patch.failure_reason).toMatch(/pre-cleanup DELETE failed/);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
