// V9 SLC-166 MT-6 — Vitest fuer executeEmailBulkThreadRedact (Worker
// `email_bulk_thread_redact`).
//
// Strategie: Dependency-Injection-Pattern analog handle-pre-filter-job.test.ts.
// chatCaller-DI via deps.chatCaller (kein vi.mock auf llm). Logger + admin
// werden via vi.mock weggespart. Multi-Tabellen-Admin-Stub mit segregiertem
// Chain-Builder pro Tabelle.
//
// Coverage:
//   1. Payload-Validation: missing bulk_run_id Throws.
//   2. Bulk-Run-Load: not-found Throws.
//   3. Status-Skip: status != 'pre_filtered' => warn + complete + return.
//   4. Status-Transition: pre_filtered → thread_redacting → thread_redacted.
//   5. Happy Path 1 Thread / 3 Emails: 1 email_thread INSERT + 1 chatCaller +
//      UPDATE thread_id + UPDATE redacted_body + UPDATE pii_redacted +
//      1 ai_cost_ledger + status='thread_redacted' + thread_count=1.
//   6. Multi-Thread (Forward-Chain): 2 separate Threads → 2 INSERTs +
//      2 chatCaller-Calls + 2 ai_cost_ledgers.
//   7. Idempotency: bestehende email_thread werden geskipped, thread_count =
//      neu + bestehend.
//   8. Empty content+unclear-Liste: 0 INSERTs + status='thread_redacted' +
//      thread_count=0.
//   9. chatCaller throws → status='failed' + failure_reason=thread_redact_error.
//  10. ai_cost_ledger INSERT-Fail non-fatal (Worker beendet success).

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
  executeEmailBulkThreadRedact,
  type ChatCaller,
} from "../handle-thread-redact-job";
import type { ClaimedJob } from "../../condensation/claim-loop";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const BULK_RUN_ID = "22222222-2222-2222-2222-222222222222";
const UPLOADER_ID = "44444444-4444-4444-4444-444444444444";
const JOB_ID = "33333333-3333-3333-3333-333333333333";

function makeJob(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    job_type: "email_bulk_thread_redact",
    payload: { bulk_run_id: BULK_RUN_ID },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

interface BulkRunStub {
  id: string;
  tenant_id: string;
  status: string;
  uploader_user_id: string;
}

interface MessageStub {
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

interface ThreadStub {
  id: string;
  root_message_id: string;
}

interface AdminStubOptions {
  bulkRun?: BulkRunStub | null;
  loadError?: { message: string } | null;
  messages?: MessageStub[];
  messagesError?: { message: string } | null;
  existingThreads?: ThreadStub[];
  existingThreadsError?: { message: string } | null;
  threadInsertId?: () => string; // returns next id, defaults to counter
  costInsertError?: { message: string } | null;
}

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: { col: string; val: unknown; op: "eq" | "in" };
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
  let threadInsertCounter = 0;

  function buildClient() {
    return {
      from(table: string) {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, _val: unknown) {
                // Branch A: bulk_run select.eq.single
                // Branch B: email_message select.eq.in
                // Branch C: email_thread select.eq (returns array directly)
                const builder = {
                  async single() {
                    if (table === "email_bulk_run") {
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
                  in(_inCol: string, _inVal: unknown) {
                    if (table === "email_message") {
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
                      error: { message: `unexpected SELECT.in on ${table}` },
                    });
                  },
                  // email_thread select.eq returns a Promise directly (array).
                  then(
                    resolve: (val: {
                      data: ThreadStub[] | null;
                      error: { message: string } | null;
                    }) => void,
                  ) {
                    if (table === "email_thread") {
                      if (opts.existingThreadsError) {
                        resolve({ data: null, error: opts.existingThreadsError });
                        return;
                      }
                      resolve({
                        data: opts.existingThreads ?? [],
                        error: null,
                      });
                      return;
                    }
                    resolve({
                      data: null,
                      error: {
                        message: `unexpected SELECT.eq-then on ${table}`,
                      },
                    });
                  },
                };
                return builder;
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              async eq(col: string, val: unknown) {
                state.updates.push({
                  table,
                  patch,
                  filter: { col, val, op: "eq" },
                });
                return { error: null };
              },
              async in(col: string, val: unknown) {
                state.updates.push({
                  table,
                  patch,
                  filter: { col, val, op: "in" },
                });
                return { error: null };
              },
            };
          },
          insert(row: Record<string, unknown>) {
            state.inserts.push({ table, row });
            if (table === "email_thread") {
              // INSERT...SELECT id single Pattern
              const idGen =
                opts.threadInsertId ??
                (() => `thread-${++threadInsertCounter}`);
              return {
                select(_cols: string) {
                  return {
                    async single() {
                      return { data: { id: idGen() }, error: null };
                    },
                  };
                },
              };
            }
            if (table === "ai_cost_ledger" && opts.costInsertError) {
              return Promise.resolve({ error: opts.costInsertError });
            }
            return Promise.resolve({ error: null });
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

function makeMessage(
  seed: string,
  opts: Partial<MessageStub> = {},
): MessageStub {
  return {
    id: `db-${seed}`,
    message_id: `<${seed}@example.test>`,
    subject: `Subject ${seed}`,
    date: "2026-06-03T10:00:00.000Z",
    in_reply_to: null,
    references_array: null,
    from_address: `from-${seed}@example.test`,
    to_addresses: [`to-${seed}@example.test`],
    cc_addresses: null,
    body_text: `Body ${seed}`,
    ...opts,
  };
}

function makeChatCaller(
  redactedText: string,
  opts?: { throwError?: Error; callCounter?: { value: number } },
): ChatCaller {
  return (async (_msgs, _opts) => {
    if (opts?.callCounter) opts.callCounter.value += 1;
    if (opts?.throwError) throw opts.throwError;
    return redactedText;
  }) as ChatCaller;
}

const HAPPY_BULK_RUN: BulkRunStub = {
  id: BULK_RUN_ID,
  tenant_id: TENANT_ID,
  status: "pre_filtered",
  uploader_user_id: UPLOADER_ID,
};

describe("executeEmailBulkThreadRedact", () => {
  beforeEach(() => {
    delete process.env.LLM_MODEL;
  });
  afterEach(() => {
    delete process.env.LLM_MODEL;
  });

  describe("Payload-Validation", () => {
    it("throws on missing payload", async () => {
      const job = makeJob({ payload: {} as never });
      const { client } = makeAdminStub({});
      await expect(
        executeEmailBulkThreadRedact(job, { adminClient: client as never }),
      ).rejects.toThrow(/payload.bulk_run_id/);
    });

    it("throws on non-UUID bulk_run_id", async () => {
      const job = makeJob({ payload: { bulk_run_id: "not-a-uuid" } });
      const { client } = makeAdminStub({});
      await expect(
        executeEmailBulkThreadRedact(job, { adminClient: client as never }),
      ).rejects.toThrow(/not a UUID/);
    });
  });

  describe("Bulk-Run-Load", () => {
    it("throws when bulk_run not found", async () => {
      const { client } = makeAdminStub({ bulkRun: null });
      await expect(
        executeEmailBulkThreadRedact(makeJob(), {
          adminClient: client as never,
        }),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("Status-Skip", () => {
    it("skips when status != 'pre_filtered' and calls rpc_complete_ai_job", async () => {
      const { client, state } = makeAdminStub({
        bulkRun: { ...HAPPY_BULK_RUN, status: "thread_redacted" },
      });
      await executeEmailBulkThreadRedact(makeJob(), {
        adminClient: client as never,
      });
      expect(state.updates).toHaveLength(0);
      expect(state.inserts).toHaveLength(0);
      expect(state.rpcs).toEqual([
        { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
      ]);
    });
  });

  describe("Happy Path — 1 Thread", () => {
    it("aggregates + redacts + flips status + writes ai_cost_ledger", async () => {
      // 3 Emails in 1 Konversation (Reply-Kette).
      const msgs = [
        makeMessage("a", { subject: "Sale Inquiry" }),
        makeMessage("b", {
          subject: "Re: Sale Inquiry",
          in_reply_to: "<a@example.test>",
          date: "2026-06-03T10:05:00.000Z",
        }),
        makeMessage("c", {
          subject: "Re: Sale Inquiry",
          in_reply_to: "<b@example.test>",
          date: "2026-06-03T10:10:00.000Z",
        }),
      ];
      const callCounter = { value: 0 };
      const chatCaller = makeChatCaller("Redacted thread body", { callCounter });
      const { client, state } = makeAdminStub({
        bulkRun: HAPPY_BULK_RUN,
        messages: msgs,
      });

      await executeEmailBulkThreadRedact(makeJob(), {
        adminClient: client as never,
        chatCaller,
      });

      expect(callCounter.value).toBe(1);

      // email_thread INSERT (1)
      const threadInserts = state.inserts.filter((i) => i.table === "email_thread");
      expect(threadInserts).toHaveLength(1);
      expect(threadInserts[0]?.row.bulk_run_id).toBe(BULK_RUN_ID);
      expect(threadInserts[0]?.row.tenant_id).toBe(TENANT_ID);
      expect(threadInserts[0]?.row.root_message_id).toBe("<a@example.test>");
      expect(threadInserts[0]?.row.email_count).toBe(3);
      expect(threadInserts[0]?.row.thread_status).toBe("redacting");

      // email_message UPDATE thread_id (IN db-ids) + pii_redacted (IN db-ids)
      const messageUpdates = state.updates.filter(
        (u) => u.table === "email_message",
      );
      expect(messageUpdates).toHaveLength(2);
      expect(messageUpdates[0]?.patch.thread_id).toBe("thread-1");
      expect(messageUpdates[1]?.patch.pii_redacted).toBe(true);

      // email_thread UPDATE (redacted)
      const threadUpdates = state.updates.filter(
        (u) => u.table === "email_thread",
      );
      expect(threadUpdates).toHaveLength(1);
      expect(threadUpdates[0]?.patch.thread_status).toBe("redacted");
      expect(threadUpdates[0]?.patch.redacted_body).toBe("Redacted thread body");
      expect(threadUpdates[0]?.patch.participant_pseudonyms).toBeDefined();

      // email_bulk_run UPDATEs: 'thread_redacting' + 'thread_redacted'
      const runUpdates = state.updates.filter(
        (u) => u.table === "email_bulk_run",
      );
      expect(runUpdates).toHaveLength(2);
      expect(runUpdates[0]?.patch.status).toBe("thread_redacting");
      expect(runUpdates[1]?.patch.status).toBe("thread_redacted");
      expect(runUpdates[1]?.patch.thread_count).toBe(1);

      // ai_cost_ledger (1 pro Thread/Bedrock-Call)
      const costInserts = state.inserts.filter(
        (i) => i.table === "ai_cost_ledger",
      );
      expect(costInserts).toHaveLength(1);
      expect(costInserts[0]?.row.role).toBe("email_bulk_pii_redact");
      expect(costInserts[0]?.row.tenant_id).toBe(TENANT_ID);
      expect(costInserts[0]?.row.job_id).toBe(JOB_ID);

      // rpc_complete_ai_job
      expect(state.rpcs).toEqual([
        { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
      ]);
    });
  });

  describe("Multi-Thread (Forward-Chain)", () => {
    it("creates separate threads + 1 chatCaller call per thread", async () => {
      // 2 Forwards mit gleichem Subject → 2 separate Threads (per MT-4 spec).
      const msgs = [
        makeMessage("orig", { subject: "Strategie 2026" }),
        makeMessage("fwd1", { subject: "Fwd: Strategie 2026" }),
        makeMessage("fwd2", { subject: "Fwd: Strategie 2026" }),
      ];
      const callCounter = { value: 0 };
      const chatCaller = makeChatCaller("OK redacted", { callCounter });
      const { client, state } = makeAdminStub({
        bulkRun: HAPPY_BULK_RUN,
        messages: msgs,
      });

      await executeEmailBulkThreadRedact(makeJob(), {
        adminClient: client as never,
        chatCaller,
      });

      expect(callCounter.value).toBe(3); // 3 separate Threads

      const threadInserts = state.inserts.filter(
        (i) => i.table === "email_thread",
      );
      expect(threadInserts).toHaveLength(3);

      const runUpdates = state.updates.filter(
        (u) => u.table === "email_bulk_run",
      );
      expect(runUpdates[1]?.patch.thread_count).toBe(3);

      const costInserts = state.inserts.filter(
        (i) => i.table === "ai_cost_ledger",
      );
      expect(costInserts).toHaveLength(3);
    });
  });

  describe("Idempotency", () => {
    it("skips existing email_thread rows + counts them in thread_count", async () => {
      const msgs = [
        makeMessage("a"),
        makeMessage("b", {
          in_reply_to: "<a@example.test>",
          date: "2026-06-03T10:05:00.000Z",
        }),
        makeMessage("c", { subject: "Standalone" }), // own thread
      ];
      const callCounter = { value: 0 };
      const chatCaller = makeChatCaller("OK", { callCounter });
      // Existing: <a@example.test> Thread bereits persistiert.
      const { client, state } = makeAdminStub({
        bulkRun: HAPPY_BULK_RUN,
        messages: msgs,
        existingThreads: [
          { id: "thread-existing-1", root_message_id: "<a@example.test>" },
        ],
      });

      await executeEmailBulkThreadRedact(makeJob(), {
        adminClient: client as never,
        chatCaller,
      });

      // Nur 1 neuer Thread (<c@example.test>) wird persistiert.
      expect(callCounter.value).toBe(1);
      const threadInserts = state.inserts.filter(
        (i) => i.table === "email_thread",
      );
      expect(threadInserts).toHaveLength(1);
      expect(threadInserts[0]?.row.root_message_id).toBe("<c@example.test>");

      // thread_count = 1 neu + 1 existing = 2.
      const runUpdates = state.updates.filter(
        (u) => u.table === "email_bulk_run",
      );
      expect(runUpdates[1]?.patch.thread_count).toBe(2);
    });
  });

  describe("Empty Messages", () => {
    it("handles empty content+unclear list as 0-Thread success", async () => {
      const callCounter = { value: 0 };
      const chatCaller = makeChatCaller("never-called", { callCounter });
      const { client, state } = makeAdminStub({
        bulkRun: HAPPY_BULK_RUN,
        messages: [],
      });

      await executeEmailBulkThreadRedact(makeJob(), {
        adminClient: client as never,
        chatCaller,
      });

      expect(callCounter.value).toBe(0);
      expect(
        state.inserts.filter((i) => i.table === "email_thread"),
      ).toHaveLength(0);
      const runUpdates = state.updates.filter(
        (u) => u.table === "email_bulk_run",
      );
      expect(runUpdates[1]?.patch.status).toBe("thread_redacted");
      expect(runUpdates[1]?.patch.thread_count).toBe(0);
    });
  });

  describe("Failure-Handling", () => {
    it("sets status='failed' + failure_reason on chatCaller error", async () => {
      const msgs = [makeMessage("a")];
      const chatCaller = makeChatCaller("OK", {
        throwError: new Error("Bedrock-timeout"),
      });
      const { client, state } = makeAdminStub({
        bulkRun: HAPPY_BULK_RUN,
        messages: msgs,
      });

      await expect(
        executeEmailBulkThreadRedact(makeJob(), {
          adminClient: client as never,
          chatCaller,
        }),
      ).rejects.toThrow(/Bedrock-timeout/);

      const runUpdates = state.updates.filter(
        (u) => u.table === "email_bulk_run",
      );
      const failedUpdate = runUpdates.find((u) => u.patch.status === "failed");
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate?.patch.failure_reason).toMatch(/thread_redact_error/);
      expect(failedUpdate?.patch.failure_reason).toMatch(/Bedrock-timeout/);
    });

    it("ai_cost_ledger INSERT-Fail is non-fatal", async () => {
      const msgs = [makeMessage("a")];
      const chatCaller = makeChatCaller("OK redacted");
      const { client, state } = makeAdminStub({
        bulkRun: HAPPY_BULK_RUN,
        messages: msgs,
        costInsertError: { message: "ai_cost_ledger constraint violation" },
      });

      // Should NOT throw — cost-insert-fail is non-fatal (V8.1-Pattern).
      await executeEmailBulkThreadRedact(makeJob(), {
        adminClient: client as never,
        chatCaller,
      });

      const runUpdates = state.updates.filter(
        (u) => u.table === "email_bulk_run",
      );
      const finalUpdate = runUpdates[runUpdates.length - 1];
      expect(finalUpdate?.patch.status).toBe("thread_redacted");
    });
  });
});
