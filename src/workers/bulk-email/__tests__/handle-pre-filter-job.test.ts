// V9 SLC-166 MT-2 — Vitest fuer executeEmailBulkPreFilter (Worker `email_bulk_pre_filter`).
//
// Strategie: Dependency-Injection-Pattern wie handle-parse-job.test.ts.
// Adapter-Mock via deps.haikuInvoker (kein vi.mock auf bedrock-haiku).
// Logger + admin.ts werden via vi.mock weggespart.
//
// Coverage:
//   1. Payload-Validation: missing bulk_run_id Throws.
//   2. Bulk-Run-Load: not-found Throws.
//   3. Status-Skip: status='pre_filtering' => warn + complete + return.
//   4. Happy Path: 3 Emails, 1 Batch, alle klassifiziert + ai_cost_ledger
//      INSERT + status='pre_filtered' + rpc_complete_ai_job.
//   5. Confidence-Threshold: confidence < 0.6 → label='unclear'.
//   6. Missing message_id im Haiku-Result → 'unclear'-Fallback.
//   7. Batch-Splitting: 7 Emails mit batchSize=3 → 3 Batches (3+3+1).
//   8. Haiku-Throw → status='failed' + failure_reason + re-throw.
//   9. Empty messages-Liste → status='pre_filtered' + 0 Batches.
//  10. ai_cost_ledger INSERT-Fail ist non-fatal (Worker laeuft weiter).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
  captureWarning: vi.fn(),
}));

vi.mock("../../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

import { executeEmailBulkPreFilter, type HaikuInvoker } from "../handle-pre-filter-job";
import type { ClaimedJob } from "../../condensation/claim-loop";
import type { PreFilterBatchResult } from "../../../lib/bulk-email/pre-filter/labels";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const BULK_RUN_ID = "22222222-2222-2222-2222-222222222222";
const JOB_ID = "33333333-3333-3333-3333-333333333333";

function makeJob(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    job_type: "email_bulk_pre_filter",
    payload: { bulk_run_id: BULK_RUN_ID },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

interface BulkRunStub {
  id: string;
  tenant_id: string;
  status: string;
}

interface MessageStub {
  id: string;
  subject: string | null;
  from_address: string | null;
  to_addresses: string[] | null;
  body_text: string | null;
}

interface AdminStubOptions {
  bulkRun?: BulkRunStub | null;
  loadError?: { message: string } | null;
  messages?: MessageStub[];
  messagesError?: { message: string } | null;
  costInsertError?: { message: string } | null;
}

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: { col: string; val: unknown };
}
interface InsertCall {
  table: string;
  row: Record<string, unknown>;
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

  function buildClient() {
    return {
      from(table: string) {
        return {
          select(_cols: string) {
            return {
              eq(col: string, val: unknown) {
                // Chain B: select.eq.is(...) for email_message
                const builder = {
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
                      error: { message: `unexpected SELECT on ${table}` },
                    };
                  },
                  is(_isCol: string, _isVal: unknown) {
                    if (table === "email_message" && col === "bulk_run_id") {
                      if (opts.messagesError) {
                        return Promise.resolve({
                          data: null,
                          error: opts.messagesError,
                        });
                      }
                      return Promise.resolve({
                        data: opts.messages ?? [],
                        error: null,
                      });
                    }
                    return Promise.resolve({
                      data: null,
                      error: { message: `unexpected SELECT on ${table}` },
                    });
                  },
                };
                void val;
                return builder;
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              async eq(col: string, val: unknown) {
                state.updates.push({ table, patch, filter: { col, val } });
                return { error: null };
              },
            };
          },
          async insert(row: Record<string, unknown>) {
            state.inserts.push({ table, row });
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

function makeMessage(seed: string, body = `Body ${seed}`): MessageStub {
  return {
    id: seed,
    subject: `Subject ${seed}`,
    from_address: `from-${seed}@example.test`,
    to_addresses: [`to-${seed}@example.test`],
    body_text: body,
  };
}

function makeHaikuInvoker(
  results: PreFilterBatchResult,
  opts?: { usdCost?: number; tokensIn?: number; tokensOut?: number; throwError?: Error },
): HaikuInvoker {
  return async () => {
    if (opts?.throwError) throw opts.throwError;
    return {
      data: results,
      tokensIn: opts?.tokensIn ?? 100,
      tokensOut: opts?.tokensOut ?? 50,
      usdCost: opts?.usdCost ?? 0.001,
      modelId: "anthropic.claude-3-haiku-20240307-v1:0",
    };
  };
}

describe("executeEmailBulkPreFilter", () => {
  beforeEach(() => {
    delete process.env.V9_PRE_FILTER_CONFIDENCE_THRESHOLD;
  });

  afterEach(() => {
    delete process.env.V9_PRE_FILTER_CONFIDENCE_THRESHOLD;
  });

  describe("Payload-Validation", () => {
    it("throws on missing payload", async () => {
      const job = makeJob({ payload: {} as never });
      const { client } = makeAdminStub({});
      await expect(
        executeEmailBulkPreFilter(job, { adminClient: client as never }),
      ).rejects.toThrow(/payload.bulk_run_id/);
    });

    it("throws on non-UUID bulk_run_id", async () => {
      const job = makeJob({ payload: { bulk_run_id: "not-a-uuid" } });
      const { client } = makeAdminStub({});
      await expect(
        executeEmailBulkPreFilter(job, { adminClient: client as never }),
      ).rejects.toThrow(/not a UUID/);
    });
  });

  describe("Bulk-Run-Load", () => {
    it("throws when bulk_run not found", async () => {
      const job = makeJob();
      const { client } = makeAdminStub({ bulkRun: null });
      await expect(
        executeEmailBulkPreFilter(job, { adminClient: client as never }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("Status-Skip", () => {
    it("skips when status is not 'parsed' and calls rpc_complete_ai_job", async () => {
      const job = makeJob();
      const { client, state } = makeAdminStub({
        bulkRun: { id: BULK_RUN_ID, tenant_id: TENANT_ID, status: "pre_filtered" },
      });
      await executeEmailBulkPreFilter(job, { adminClient: client as never });
      expect(state.updates).toHaveLength(0);
      expect(state.inserts).toHaveLength(0);
      expect(state.rpcs).toEqual([
        { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
      ]);
    });
  });

  describe("Happy Path", () => {
    it("classifies all emails + writes ai_cost_ledger + flips status to 'pre_filtered'", async () => {
      const messages = [makeMessage("aaaa1111"), makeMessage("bbbb2222"), makeMessage("cccc3333")];
      const { client, state } = makeAdminStub({
        bulkRun: { id: BULK_RUN_ID, tenant_id: TENANT_ID, status: "parsed" },
        messages,
      });
      const haikuInvoker = makeHaikuInvoker(
        [
          { message_id: "aaaa1111", label: "content", confidence: 0.92 },
          { message_id: "bbbb2222", label: "newsletter", confidence: 0.99 },
          { message_id: "cccc3333", label: "short_reply", confidence: 0.81 },
        ],
        { usdCost: 0.0025 },
      );

      await executeEmailBulkPreFilter(makeJob(), {
        adminClient: client as never,
        haikuInvoker,
      });

      // 3 email_message UPDATEs + 2 bulk_run UPDATEs (start + finish)
      const messageUpdates = state.updates.filter((u) => u.table === "email_message");
      expect(messageUpdates).toHaveLength(3);
      expect(messageUpdates[0]?.patch.pre_filter_label).toBe("content");
      expect(messageUpdates[1]?.patch.pre_filter_label).toBe("newsletter");
      expect(messageUpdates[2]?.patch.pre_filter_label).toBe("short_reply");

      const runUpdates = state.updates.filter((u) => u.table === "email_bulk_run");
      expect(runUpdates).toHaveLength(2);
      expect(runUpdates[0]?.patch.status).toBe("pre_filtering");
      expect(runUpdates[1]?.patch.status).toBe("pre_filtered");

      // ai_cost_ledger row
      const costInserts = state.inserts.filter((i) => i.table === "ai_cost_ledger");
      expect(costInserts).toHaveLength(1);
      expect(costInserts[0]?.row.role).toBe("email_bulk_pre_filter");
      expect(costInserts[0]?.row.tenant_id).toBe(TENANT_ID);

      // rpc_complete_ai_job
      expect(state.rpcs).toEqual([
        { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
      ]);

      // EUR-Cost = USD * 0.92, gerundet
      expect((runUpdates[1]?.patch.pre_filter_cost_eur as number)).toBeCloseTo(0.0023, 4);
    });

    it("handles empty messages list as no-op success", async () => {
      const { client, state } = makeAdminStub({
        bulkRun: { id: BULK_RUN_ID, tenant_id: TENANT_ID, status: "parsed" },
        messages: [],
      });
      const haikuInvoker = makeHaikuInvoker([]);
      await executeEmailBulkPreFilter(makeJob(), {
        adminClient: client as never,
        haikuInvoker,
      });
      const messageUpdates = state.updates.filter((u) => u.table === "email_message");
      expect(messageUpdates).toHaveLength(0);
      const runUpdates = state.updates.filter((u) => u.table === "email_bulk_run");
      expect(runUpdates).toHaveLength(2);
      expect(runUpdates[1]?.patch.status).toBe("pre_filtered");
      expect(state.inserts).toHaveLength(0);
    });
  });

  describe("Confidence-Threshold", () => {
    it("overrides label='unclear' when confidence < default 0.6", async () => {
      const { client, state } = makeAdminStub({
        bulkRun: { id: BULK_RUN_ID, tenant_id: TENANT_ID, status: "parsed" },
        messages: [makeMessage("lowconf")],
      });
      const haikuInvoker = makeHaikuInvoker([
        { message_id: "lowconf", label: "content", confidence: 0.5 },
      ]);
      await executeEmailBulkPreFilter(makeJob(), { adminClient: client as never, haikuInvoker });
      const messageUpdates = state.updates.filter((u) => u.table === "email_message");
      expect(messageUpdates[0]?.patch.pre_filter_label).toBe("unclear");
      expect(messageUpdates[0]?.patch.pre_filter_confidence).toBe(0.5);
    });

    it("respects ENV V9_PRE_FILTER_CONFIDENCE_THRESHOLD override", async () => {
      process.env.V9_PRE_FILTER_CONFIDENCE_THRESHOLD = "0.3";
      const { client, state } = makeAdminStub({
        bulkRun: { id: BULK_RUN_ID, tenant_id: TENANT_ID, status: "parsed" },
        messages: [makeMessage("midconf")],
      });
      const haikuInvoker = makeHaikuInvoker([
        { message_id: "midconf", label: "content", confidence: 0.5 },
      ]);
      await executeEmailBulkPreFilter(makeJob(), { adminClient: client as never, haikuInvoker });
      const messageUpdates = state.updates.filter((u) => u.table === "email_message");
      // 0.5 >= 0.3 → keep label='content'
      expect(messageUpdates[0]?.patch.pre_filter_label).toBe("content");
    });

    it("deps.confidenceThreshold override beats ENV", async () => {
      process.env.V9_PRE_FILTER_CONFIDENCE_THRESHOLD = "0.3";
      const { client, state } = makeAdminStub({
        bulkRun: { id: BULK_RUN_ID, tenant_id: TENANT_ID, status: "parsed" },
        messages: [makeMessage("midconf")],
      });
      const haikuInvoker = makeHaikuInvoker([
        { message_id: "midconf", label: "content", confidence: 0.5 },
      ]);
      await executeEmailBulkPreFilter(makeJob(), {
        adminClient: client as never,
        haikuInvoker,
        confidenceThreshold: 0.9,
      });
      const messageUpdates = state.updates.filter((u) => u.table === "email_message");
      // 0.5 < 0.9 → 'unclear' override
      expect(messageUpdates[0]?.patch.pre_filter_label).toBe("unclear");
    });
  });

  describe("Haiku-Result-Mapping", () => {
    it("falls back to 'unclear' when message_id missing from Haiku result", async () => {
      const { client, state } = makeAdminStub({
        bulkRun: { id: BULK_RUN_ID, tenant_id: TENANT_ID, status: "parsed" },
        messages: [makeMessage("aaa"), makeMessage("bbb")],
      });
      const haikuInvoker = makeHaikuInvoker([
        { message_id: "aaa", label: "content", confidence: 0.9 },
        // bbb fehlt absichtlich
      ]);
      await executeEmailBulkPreFilter(makeJob(), { adminClient: client as never, haikuInvoker });
      const messageUpdates = state.updates.filter((u) => u.table === "email_message");
      expect(messageUpdates).toHaveLength(2);
      expect(messageUpdates[0]?.patch.pre_filter_label).toBe("content");
      expect(messageUpdates[1]?.patch.pre_filter_label).toBe("unclear");
      expect(messageUpdates[1]?.patch.pre_filter_confidence).toBe(0);
    });
  });

  describe("Batch-Splitting", () => {
    it("splits 7 messages into 3 batches with batchSize=3", async () => {
      const messages = ["a", "b", "c", "d", "e", "f", "g"].map((i) => makeMessage(i));
      let invocationCount = 0;
      const haikuInvoker: HaikuInvoker = async (req) => {
        invocationCount += 1;
        // Parse user prompt's ANZAHL line to know what batch sent — actually just
        // emit all 3 results matching the message_ids in this batch.
        const idMatches = [...req.user.matchAll(/"message_id": "([^"]+)"/g)].map(
          (m) => m[1],
        );
        return {
          data: idMatches.map((id) => ({
            message_id: id!,
            label: "content" as const,
            confidence: 0.9,
          })),
          tokensIn: 50,
          tokensOut: 25,
          usdCost: 0.0005,
          modelId: "anthropic.claude-3-haiku-20240307-v1:0",
        };
      };
      const { client, state } = makeAdminStub({
        bulkRun: { id: BULK_RUN_ID, tenant_id: TENANT_ID, status: "parsed" },
        messages,
      });
      await executeEmailBulkPreFilter(makeJob(), {
        adminClient: client as never,
        haikuInvoker,
        batchSize: 3,
      });
      expect(invocationCount).toBe(3); // ceil(7/3) = 3 batches
      const costInserts = state.inserts.filter((i) => i.table === "ai_cost_ledger");
      expect(costInserts).toHaveLength(3);
      const messageUpdates = state.updates.filter((u) => u.table === "email_message");
      expect(messageUpdates).toHaveLength(7);
    });
  });

  describe("Failure-Handling", () => {
    it("sets status='failed' + failure_reason on Haiku error", async () => {
      const { client, state } = makeAdminStub({
        bulkRun: { id: BULK_RUN_ID, tenant_id: TENANT_ID, status: "parsed" },
        messages: [makeMessage("aaa")],
      });
      const haikuInvoker = makeHaikuInvoker([], {
        throwError: new Error("Bedrock-timeout"),
      });
      await expect(
        executeEmailBulkPreFilter(makeJob(), { adminClient: client as never, haikuInvoker }),
      ).rejects.toThrow(/Bedrock-timeout/);
      const runUpdates = state.updates.filter((u) => u.table === "email_bulk_run");
      const failedUpdate = runUpdates.find((u) => u.patch.status === "failed");
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate?.patch.failure_reason).toMatch(/haiku_pre_filter_error/);
      expect(failedUpdate?.patch.failure_reason).toMatch(/Bedrock-timeout/);
    });

    it("ai_cost_ledger INSERT-Fail is non-fatal", async () => {
      const { client, state } = makeAdminStub({
        bulkRun: { id: BULK_RUN_ID, tenant_id: TENANT_ID, status: "parsed" },
        messages: [makeMessage("aaa")],
        costInsertError: { message: "constraint violation" },
      });
      const haikuInvoker = makeHaikuInvoker([
        { message_id: "aaa", label: "content", confidence: 0.9 },
      ]);
      // Should NOT throw — cost-insert-fail is logged but not fatal.
      await executeEmailBulkPreFilter(makeJob(), { adminClient: client as never, haikuInvoker });
      const runUpdates = state.updates.filter((u) => u.table === "email_bulk_run");
      const finalUpdate = runUpdates[runUpdates.length - 1];
      expect(finalUpdate?.patch.status).toBe("pre_filtered");
    });
  });
});
