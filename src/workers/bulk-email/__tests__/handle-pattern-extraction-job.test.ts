// V9 SLC-167 MT-5 — Vitest fuer executeEmailBulkPatternExtract (Worker `email_bulk_pattern_extract`).
//
// Spec: slices/SLC-167-v9-pattern-curation-cost-cap.md (MT-5 Verification L168-172)
//
// Strategie: Dependency-Injection-Pattern wie handle-pre-filter-job.test.ts.
// Adapter-Mock via deps.patternExtractor (kein vi.mock auf bedrock-sonnet).
// Logger + admin.ts werden via vi.mock weggespart.
// Cost-Store-Mock via deps.costStore (kein DB-Roundtrip im Test).
//
// Coverage:
//   1. Payload-Validation: missing bulk_run_id, non-UUID
//   2. Bulk-Run-Load: not-found
//   3. Status-Skip: status='thread_redacted' (vor MT-4-Action) => skip + complete
//   4. Status-Skip: status='pattern_extracted' (already done) => skip + complete
//   5. Happy Path: 3 Threads × ~2 Patterns => 6 email_pattern + 3 ai_cost_ledger + 3 UPDATE cost
//      + final status='pattern_extracted' + patterns_extracted=6 + rpc_complete
//   6. Idempotenz: 3 Threads, 1 with existing pattern => 2 Sonnet-Calls
//   7. SonnetSchemaError on single thread: skip + continue (AC-SLC-167-14)
//   8. Live-Cap-Exceeded after 2nd call: status='failed' + failure_reason='cost_cap_run_exceeded'
//      + patterns_extracted=2 + rpc_complete
//   9. Empty threads list: status='pattern_extracted' + 0 inserts
//  10. ai_cost_ledger INSERT-Fail ist non-fatal (Worker laeuft weiter)
//  11. Bedrock-Timeout (NON-SonnetSchemaError) → status='failed' + re-throw

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
  captureWarning: vi.fn(),
}));

vi.mock("../../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

import {
  executeEmailBulkPatternExtract,
  type PatternExtractor,
} from "../handle-pattern-extraction-job";
import { SonnetSchemaError } from "../../../lib/ai/bedrock-sonnet/email-pattern";
import type { CostCapStore } from "../../../lib/bulk-email/cost-cap";
import type { ClaimedJob } from "../../condensation/claim-loop";
import type { PatternExtractionResult } from "../../../lib/ai/bedrock-sonnet/email-pattern";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const BULK_RUN_ID = "22222222-2222-2222-2222-222222222222";
const JOB_ID = "33333333-3333-3333-3333-333333333333";

const THREAD_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const THREAD_2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const THREAD_3 = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function makeJob(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    job_type: "email_bulk_pattern_extract",
    payload: { bulk_run_id: BULK_RUN_ID },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

interface BulkRunStub {
  id: string;
  tenant_id: string;
  status: string;
  pattern_extraction_cost_eur: number | string | null;
}

interface ThreadStub {
  id: string;
  root_message_id: string;
  subject: string | null;
  email_count: number | null;
  first_date: string | null;
  redacted_body: string | null;
  thread_status: string;
}

interface AdminStubOptions {
  bulkRun?: BulkRunStub | null;
  loadError?: { message: string } | null;
  threads?: ThreadStub[];
  threadsError?: { message: string } | null;
  existingPatternThreadIds?: string[];
  existingError?: { message: string } | null;
  insertPatternError?: { message: string } | null;
  costInsertError?: { message: string } | null;
  costUpdateError?: { message: string } | null;
  finishUpdateError?: { message: string } | null;
}

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: { col: string; val: unknown };
}
interface InsertCall {
  table: string;
  row: Record<string, unknown> | Record<string, unknown>[];
}
interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

interface AdminStubState {
  updates: UpdateCall[];
  inserts: InsertCall[];
  rpcs: RpcCall[];
}

function makeAdminStub(opts: AdminStubOptions): {
  client: ReturnType<typeof buildClient>;
  state: AdminStubState;
} {
  const state: AdminStubState = { updates: [], inserts: [], rpcs: [] };
  // Track per-table call-counts for sequencing (e.g. UPDATEs auf email_bulk_run
  // mit unterschiedlichen failure_reasons je Phase).
  let finishUpdateSeen = false;

  function buildClient() {
    return {
      from(table: string) {
        return {
          select(_cols: string) {
            return {
              eq(col: string, val: unknown) {
                // SELECT chain — single, eq+eq, eq+eq+maybeSingle
                const handlers = {
                  async single() {
                    if (table === "email_bulk_run" && col === "id") {
                      if (opts.loadError) {
                        return { data: null, error: opts.loadError };
                      }
                      if (!opts.bulkRun) {
                        return { data: null, error: { message: "no row" } };
                      }
                      return { data: opts.bulkRun, error: null };
                    }
                    return {
                      data: null,
                      error: { message: `unexpected SELECT.single on ${table}` },
                    };
                  },
                  eq(_col2: string, _val2: unknown) {
                    // Used by email_thread.select.eq.eq (bulk_run_id + thread_status)
                    return {
                      then(onfulfilled: (v: unknown) => unknown) {
                        if (table === "email_thread") {
                          return Promise.resolve({
                            data: opts.threads ?? [],
                            error: opts.threadsError ?? null,
                          }).then(onfulfilled);
                        }
                        return Promise.resolve({
                          data: null,
                          error: { message: `unexpected SELECT on ${table}` },
                        }).then(onfulfilled);
                      },
                    };
                  },
                  then(onfulfilled: (v: unknown) => unknown) {
                    // Used by email_pattern.select.eq (existing thread_ids)
                    if (table === "email_pattern") {
                      const rows =
                        (opts.existingPatternThreadIds ?? []).map((tid) => ({
                          thread_id: tid,
                        }));
                      return Promise.resolve({
                        data: rows,
                        error: opts.existingError ?? null,
                      }).then(onfulfilled);
                    }
                    return Promise.resolve({
                      data: null,
                      error: { message: `unexpected SELECT on ${table}` },
                    }).then(onfulfilled);
                  },
                };
                void val;
                return handlers;
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              async eq(col: string, val: unknown) {
                state.updates.push({ table, patch, filter: { col, val } });
                // Wenn final-update auf email_bulk_run und finishUpdateError gesetzt
                // → Error werfen damit catch-Block greift.
                if (
                  table === "email_bulk_run" &&
                  (patch.status === "pattern_extracted" ||
                    patch.status === "failed") &&
                  !finishUpdateSeen &&
                  opts.finishUpdateError
                ) {
                  finishUpdateSeen = true;
                  return { error: opts.finishUpdateError };
                }
                // Spezial-Pfad: cost-update vs status-update unterscheiden via patch.pattern_extraction_cost_eur
                if (
                  table === "email_bulk_run" &&
                  patch.pattern_extraction_cost_eur !== undefined &&
                  opts.costUpdateError
                ) {
                  return { error: opts.costUpdateError };
                }
                return { error: null };
              },
            };
          },
          async insert(row: Record<string, unknown> | Record<string, unknown>[]) {
            state.inserts.push({ table, row });
            if (table === "email_pattern" && opts.insertPatternError) {
              return { error: opts.insertPatternError };
            }
            if (table === "ai_cost_ledger" && opts.costInsertError) {
              return { error: opts.costInsertError };
            }
            return { error: null };
          },
        };
      },
      async rpc(name: string, args: Record<string, unknown>) {
        state.rpcs.push({ name, args });
        return { error: null };
      },
    };
  }

  return { client: buildClient(), state };
}

function makeThread(seed: string, threadId: string, body = `Body ${seed}`): ThreadStub {
  return {
    id: threadId,
    root_message_id: `<root-${seed}@example.test>`,
    subject: `Subject ${seed}`,
    email_count: 2,
    first_date: "2026-06-01T00:00:00Z",
    redacted_body: body,
    thread_status: "redacted",
  };
}

function makePatternExtractor(
  resultsByThreadId: Record<
    string,
    PatternExtractionResult | (() => PatternExtractionResult)
  >,
  opts?: {
    usdCost?: number;
    tokensIn?: number;
    tokensOut?: number;
    throwErrorByThreadId?: Record<string, Error>;
    defaultThrowError?: Error;
  },
): PatternExtractor {
  return async (_body, meta) => {
    const throwForThread = opts?.throwErrorByThreadId?.[meta.threadId];
    if (throwForThread) throw throwForThread;
    if (opts?.defaultThrowError) throw opts.defaultThrowError;
    const rawResult = resultsByThreadId[meta.threadId];
    if (!rawResult) {
      throw new Error(`test bug: no fixture for thread ${meta.threadId}`);
    }
    const data = typeof rawResult === "function" ? rawResult() : rawResult;
    return {
      data,
      tokensIn: opts?.tokensIn ?? 100,
      tokensOut: opts?.tokensOut ?? 50,
      costUsd: opts?.usdCost ?? 0.01,
      latencyMs: 250,
      modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      region: "eu-central-1",
    };
  };
}

function makeCostStore(
  initialRunEur = 0,
  patternEurByCall: number[] = [],
): CostCapStore {
  let callCount = 0;
  return {
    async getTenantMonthCostEur() {
      return 0; // Tenant-Monatscap nicht im Worker-Test
    },
    async getRunPatternExtractionCostEur() {
      const nextValue = patternEurByCall[callCount];
      callCount += 1;
      return nextValue !== undefined ? nextValue : initialRunEur;
    },
  };
}

function patternResult(
  threadId: string,
  patternCount: number,
  confidence = 0.85,
): PatternExtractionResult {
  return {
    thread_id: threadId,
    themes: ["theme-a", "theme-b"],
    patterns: Array.from({ length: patternCount }, (_, i) => ({
      title: `Pattern ${i + 1}`,
      description: `Beschreibung Pattern ${i + 1}`,
      evidence_snippets: [`Snippet ${i + 1}`],
      confidence,
      suggested_section: "vertrieb/einwand",
    })),
    decisions: [],
    open_questions: [],
  };
}

beforeEach(() => {
  delete process.env.V9_BULK_EMAIL_RUN_CAP_EUR;
});

afterEach(() => {
  delete process.env.V9_BULK_EMAIL_RUN_CAP_EUR;
});

// ──────────────────────────────────────────────────────────────────────────────

describe("executeEmailBulkPatternExtract — Payload-Validation", () => {
  it("throws on missing payload", async () => {
    const job = makeJob({ payload: {} as never });
    const { client } = makeAdminStub({});
    await expect(
      executeEmailBulkPatternExtract(job, { adminClient: client as never }),
    ).rejects.toThrow(/payload.bulk_run_id/);
  });

  it("throws on non-UUID bulk_run_id", async () => {
    const job = makeJob({ payload: { bulk_run_id: "not-a-uuid" } });
    const { client } = makeAdminStub({});
    await expect(
      executeEmailBulkPatternExtract(job, { adminClient: client as never }),
    ).rejects.toThrow(/not a UUID/);
  });
});

describe("executeEmailBulkPatternExtract — Bulk-Run-Load", () => {
  it("throws when bulk_run not found", async () => {
    const job = makeJob();
    const { client } = makeAdminStub({ bulkRun: null });
    await expect(
      executeEmailBulkPatternExtract(job, { adminClient: client as never }),
    ).rejects.toThrow(/not found/);
  });
});

describe("executeEmailBulkPatternExtract — Status-Skip", () => {
  it("skips when status='thread_redacted' (vor MT-4-Action) and calls rpc_complete", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: {
        id: BULK_RUN_ID,
        tenant_id: TENANT_ID,
        status: "thread_redacted",
        pattern_extraction_cost_eur: 0,
      },
    });
    await executeEmailBulkPatternExtract(makeJob(), {
      adminClient: client as never,
    });
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.rpcs).toEqual([
      { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
    ]);
  });

  it("skips when status='pattern_extracted' (already done)", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: {
        id: BULK_RUN_ID,
        tenant_id: TENANT_ID,
        status: "pattern_extracted",
        pattern_extraction_cost_eur: 5,
      },
    });
    await executeEmailBulkPatternExtract(makeJob(), {
      adminClient: client as never,
    });
    expect(state.updates).toHaveLength(0);
    expect(state.rpcs).toHaveLength(1);
  });
});

describe("executeEmailBulkPatternExtract — Happy Path", () => {
  it("processes 3 threads, inserts 6 patterns (2 per thread), 3 ai_cost_ledger, flips status", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: {
        id: BULK_RUN_ID,
        tenant_id: TENANT_ID,
        status: "pattern_extracting",
        pattern_extraction_cost_eur: 0,
      },
      threads: [
        makeThread("a", THREAD_1),
        makeThread("b", THREAD_2),
        makeThread("c", THREAD_3),
      ],
      existingPatternThreadIds: [],
    });
    const extractor = makePatternExtractor(
      {
        [THREAD_1]: patternResult(THREAD_1, 2),
        [THREAD_2]: patternResult(THREAD_2, 2),
        [THREAD_3]: patternResult(THREAD_3, 2),
      },
      { usdCost: 0.05 },
    );
    const costStore = makeCostStore(0, [0.046, 0.092, 0.138]);

    await executeEmailBulkPatternExtract(makeJob(), {
      adminClient: client as never,
      patternExtractor: extractor,
      costStore,
    });

    // email_pattern INSERT — 3 Batches, jeweils 2 Rows
    const patternInserts = state.inserts.filter((i) => i.table === "email_pattern");
    expect(patternInserts).toHaveLength(3);
    expect(Array.isArray(patternInserts[0]?.row)).toBe(true);
    const firstBatch = patternInserts[0]?.row as Record<string, unknown>[];
    expect(firstBatch).toHaveLength(2);
    expect(firstBatch[0]).toMatchObject({
      tenant_id: TENANT_ID,
      bulk_run_id: BULK_RUN_ID,
      thread_id: THREAD_1,
      title: "Pattern 1",
      confidence: 0.85,
      suggested_section: "vertrieb/einwand",
    });
    expect(firstBatch[0]?.themes).toEqual(["theme-a", "theme-b"]);

    // ai_cost_ledger — 3 Entries
    const costInserts = state.inserts.filter((i) => i.table === "ai_cost_ledger");
    expect(costInserts).toHaveLength(3);
    expect(costInserts[0]?.row).toMatchObject({
      tenant_id: TENANT_ID,
      job_id: JOB_ID,
      role: "email_bulk_pattern_extraction",
      model_id: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      iteration: 1,
    });

    // email_bulk_run UPDATEs — 3 cost-updates + 1 final status-update
    const runUpdates = state.updates.filter((u) => u.table === "email_bulk_run");
    const costUpdates = runUpdates.filter(
      (u) => u.patch.pattern_extraction_cost_eur !== undefined,
    );
    const statusUpdates = runUpdates.filter((u) => u.patch.status !== undefined);
    expect(costUpdates).toHaveLength(3);
    expect(statusUpdates).toHaveLength(1);
    expect(statusUpdates[0]?.patch.status).toBe("pattern_extracted");
    expect(statusUpdates[0]?.patch.patterns_extracted).toBe(6);

    // rpc_complete_ai_job
    expect(state.rpcs).toEqual([
      { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
    ]);
  });

  it("empty thread list → status='pattern_extracted' + 0 patterns", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: {
        id: BULK_RUN_ID,
        tenant_id: TENANT_ID,
        status: "pattern_extracting",
        pattern_extraction_cost_eur: 0,
      },
      threads: [],
    });
    await executeEmailBulkPatternExtract(makeJob(), {
      adminClient: client as never,
      patternExtractor: makePatternExtractor({}),
      costStore: makeCostStore(),
    });

    const inserts = state.inserts.filter((i) => i.table === "email_pattern");
    expect(inserts).toHaveLength(0);
    const statusUpdate = state.updates.find(
      (u) => u.table === "email_bulk_run" && u.patch.status === "pattern_extracted",
    );
    expect(statusUpdate?.patch.patterns_extracted).toBe(0);
  });
});

describe("executeEmailBulkPatternExtract — Idempotency", () => {
  it("skips threads that already have email_pattern rows", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: {
        id: BULK_RUN_ID,
        tenant_id: TENANT_ID,
        status: "pattern_extracting",
        pattern_extraction_cost_eur: 0,
      },
      threads: [
        makeThread("a", THREAD_1),
        makeThread("b", THREAD_2),
        makeThread("c", THREAD_3),
      ],
      existingPatternThreadIds: [THREAD_2], // T_2 already done
    });
    let extractorCalls = 0;
    const extractor: PatternExtractor = async (_body, meta) => {
      extractorCalls += 1;
      return {
        data: patternResult(meta.threadId, 1),
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.01,
        latencyMs: 100,
        modelId: "sonnet-test",
        region: "eu-central-1",
      };
    };

    await executeEmailBulkPatternExtract(makeJob(), {
      adminClient: client as never,
      patternExtractor: extractor,
      costStore: makeCostStore(),
    });

    expect(extractorCalls).toBe(2); // T_1 + T_3
    const patternInserts = state.inserts.filter((i) => i.table === "email_pattern");
    expect(patternInserts).toHaveLength(2);
  });
});

describe("executeEmailBulkPatternExtract — Bedrock-Schema-Drift Handling (AC-167-14)", () => {
  it("SonnetSchemaError on single thread: skip + continue with other threads", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: {
        id: BULK_RUN_ID,
        tenant_id: TENANT_ID,
        status: "pattern_extracting",
        pattern_extraction_cost_eur: 0,
      },
      threads: [
        makeThread("a", THREAD_1),
        makeThread("b", THREAD_2),
        makeThread("c", THREAD_3),
      ],
    });
    const extractor = makePatternExtractor(
      {
        [THREAD_1]: patternResult(THREAD_1, 1),
        [THREAD_3]: patternResult(THREAD_3, 1),
      },
      {
        throwErrorByThreadId: {
          [THREAD_2]: new SonnetSchemaError(
            "bad json",
            "{ not valid json",
            null,
          ),
        },
      },
    );

    await executeEmailBulkPatternExtract(makeJob(), {
      adminClient: client as never,
      patternExtractor: extractor,
      costStore: makeCostStore(),
    });

    const patternInserts = state.inserts.filter((i) => i.table === "email_pattern");
    expect(patternInserts).toHaveLength(2); // T_1 + T_3 (T_2 skipped)
    const statusUpdate = state.updates.find(
      (u) => u.table === "email_bulk_run" && u.patch.status === "pattern_extracted",
    );
    expect(statusUpdate).toBeDefined(); // Run still succeeds
    expect(statusUpdate?.patch.patterns_extracted).toBe(2);
  });
});

describe("executeEmailBulkPatternExtract — Live-Cap (AC-167-13)", () => {
  it("status='failed' + failure_reason='cost_cap_run_exceeded' when live-cap exceeded after 2nd call", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: {
        id: BULK_RUN_ID,
        tenant_id: TENANT_ID,
        status: "pattern_extracting",
        pattern_extraction_cost_eur: 0,
      },
      threads: [
        makeThread("a", THREAD_1),
        makeThread("b", THREAD_2),
        makeThread("c", THREAD_3),
      ],
    });
    const extractor = makePatternExtractor({
      [THREAD_1]: patternResult(THREAD_1, 1),
      [THREAD_2]: patternResult(THREAD_2, 1),
      [THREAD_3]: patternResult(THREAD_3, 1),
    });
    // Cap = 1 EUR. checkLiveCapInWorker liest: 0.5 (nach T_1, OK), 1.5 (nach T_2, EXCEED, break).
    const costStore = makeCostStore(0, [0.5, 1.5]);

    await executeEmailBulkPatternExtract(makeJob(), {
      adminClient: client as never,
      patternExtractor: extractor,
      costStore,
      runCapEur: 1.0,
    });

    const patternInserts = state.inserts.filter((i) => i.table === "email_pattern");
    expect(patternInserts).toHaveLength(2); // T_1 + T_2 (T_3 skipped via break)

    const failUpdate = state.updates.find(
      (u) => u.table === "email_bulk_run" && u.patch.status === "failed",
    );
    expect(failUpdate).toBeDefined();
    expect(failUpdate?.patch.failure_reason).toMatch(/cost_cap_run_exceeded/);
    expect(failUpdate?.patch.patterns_extracted).toBe(2);

    expect(state.rpcs).toEqual([
      { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
    ]);
  });
});

describe("executeEmailBulkPatternExtract — Failure-Handling", () => {
  it("Bedrock-Timeout (non-SchemaError) → status='failed' + re-throw", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: {
        id: BULK_RUN_ID,
        tenant_id: TENANT_ID,
        status: "pattern_extracting",
        pattern_extraction_cost_eur: 0,
      },
      threads: [makeThread("a", THREAD_1)],
    });
    const extractor = makePatternExtractor(
      {},
      { defaultThrowError: new Error("Bedrock-timeout") },
    );

    await expect(
      executeEmailBulkPatternExtract(makeJob(), {
        adminClient: client as never,
        patternExtractor: extractor,
        costStore: makeCostStore(),
      }),
    ).rejects.toThrow(/Bedrock-timeout/);

    const failedUpdate = state.updates.find(
      (u) => u.table === "email_bulk_run" && u.patch.status === "failed",
    );
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate?.patch.failure_reason).toMatch(/pattern_extract_error/);
    expect(failedUpdate?.patch.failure_reason).toMatch(/Bedrock-timeout/);
  });

  it("ai_cost_ledger INSERT-Fail is non-fatal — Worker continues", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: {
        id: BULK_RUN_ID,
        tenant_id: TENANT_ID,
        status: "pattern_extracting",
        pattern_extraction_cost_eur: 0,
      },
      threads: [makeThread("a", THREAD_1)],
      costInsertError: { message: "constraint violation" },
    });
    const extractor = makePatternExtractor({
      [THREAD_1]: patternResult(THREAD_1, 1),
    });

    await executeEmailBulkPatternExtract(makeJob(), {
      adminClient: client as never,
      patternExtractor: extractor,
      costStore: makeCostStore(),
    });

    // Patterns wurden insertet, status flipped trotzdem
    const patternInserts = state.inserts.filter((i) => i.table === "email_pattern");
    expect(patternInserts).toHaveLength(1);
    const statusUpdate = state.updates.find(
      (u) => u.table === "email_bulk_run" && u.patch.status === "pattern_extracted",
    );
    expect(statusUpdate).toBeDefined();
  });

  it("Skips thread with empty redacted_body + continues with valid threads", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: {
        id: BULK_RUN_ID,
        tenant_id: TENANT_ID,
        status: "pattern_extracting",
        pattern_extraction_cost_eur: 0,
      },
      threads: [
        { ...makeThread("a", THREAD_1), redacted_body: "" },
        makeThread("b", THREAD_2),
      ],
    });
    const extractor = makePatternExtractor({
      [THREAD_2]: patternResult(THREAD_2, 1),
    });

    await executeEmailBulkPatternExtract(makeJob(), {
      adminClient: client as never,
      patternExtractor: extractor,
      costStore: makeCostStore(),
    });

    const patternInserts = state.inserts.filter((i) => i.table === "email_pattern");
    expect(patternInserts).toHaveLength(1); // Only T_2
  });
});

describe("executeEmailBulkPatternExtract — Cost-Accumulation Continuity", () => {
  it("preserves pre-existing pattern_extraction_cost_eur on worker restart", async () => {
    // Run hat schon 5.0 EUR (z.B. nach Crash + Restart) — Worker addiert weiter
    const { client, state } = makeAdminStub({
      bulkRun: {
        id: BULK_RUN_ID,
        tenant_id: TENANT_ID,
        status: "pattern_extracting",
        pattern_extraction_cost_eur: 5.0,
      },
      threads: [makeThread("a", THREAD_1)],
      existingPatternThreadIds: [], // empty - assume worker crashed before any INSERT
    });
    const extractor = makePatternExtractor(
      { [THREAD_1]: patternResult(THREAD_1, 1) },
      { usdCost: 1.0 }, // 1 USD * 0.92 = 0.92 EUR
    );
    const costStore = makeCostStore(0, [5.92]); // 5.0 + 0.92

    await executeEmailBulkPatternExtract(makeJob(), {
      adminClient: client as never,
      patternExtractor: extractor,
      costStore,
    });

    const costUpdate = state.updates.find(
      (u) =>
        u.table === "email_bulk_run" &&
        u.patch.pattern_extraction_cost_eur !== undefined,
    );
    // 5.0 (initial) + 0.92 (new call) = 5.92
    const costValue = costUpdate?.patch.pattern_extraction_cost_eur as number;
    expect(costValue).toBeCloseTo(5.92, 4);
  });
});
