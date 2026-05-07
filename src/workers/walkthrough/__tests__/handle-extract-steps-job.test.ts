// Vitest unit tests for handleExtractStepsJob (SLC-077 MT-4 / MT-5).
// Mocks supabase admin client, chatWithLLM (Bedrock) and the logger so the handler
// can be exercised without a live worker / live Bedrock call.
//
// Coverage: happy path mit 5 Fixtures (MT-4), N=0 Edge-Case (MT-5), Skip-Pfad,
// 6 Failed-Pfade, Idempotency (DELETE before INSERT), Cost-Ledger Silent-Failure
// (IMP-371), JSON-Parse-Failure, Zod-Validation-Failure.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ClaimedJob } from "../../condensation/claim-loop";
import {
  ALL_STRUCTURED_FIXTURES,
  FIXTURE_AUFTRAGSANNAHME,
  FIXTURE_UNSTRUKTURIERT,
} from "./fixtures/walkthrough-extracts";

// ---------------------------------------------------------------------------
// State + Mock-Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const RECORDER_ID = "44444444-4444-4444-4444-444444444444";
const REDACTED_KU_ID = "66666666-6666-6666-6666-666666666666";
const ENQUEUED_JOB_ID = "77777777-7777-7777-7777-777777777777";
const JOB_ID = "88888888-8888-8888-8888-888888888888";

interface UpdateRecord {
  table: string;
  patch: Record<string, unknown>;
  matchId?: string;
}

interface InsertRecord {
  table: string;
  rows: Record<string, unknown>[];
}

interface SessionRow {
  id: string;
  tenant_id: string;
  recorded_by_user_id: string;
  status: string;
}

interface KuRow {
  id: string;
  body: string;
}

interface DeleteRecord {
  table: string;
  matchCol: string;
  matchVal: string;
}

interface MockState {
  sessionRow: SessionRow | null;
  sessionLoadError: Error | null;
  kuRow: KuRow | null;
  kuLoadError: Error | null;
  updates: UpdateRecord[];
  inserts: InsertRecord[];
  deletes: DeleteRecord[];
  stepInsertError: Error | null;
  stepInsertCount: number | null;
  jobInsertError: Error | null;
  costInsertError: { message: string; code?: string } | null;
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  rpcError: Error | null;
  bedrockResult: string;
  bedrockError: Error | null;
  bedrockCalls: number;
  capturedExceptions: { error: unknown; metadata: unknown }[];
  capturedWarnings: { message: string; metadata: unknown }[];
  capturedInfos: { message: string; metadata: unknown }[];
}

const state: MockState = {
  sessionRow: null,
  sessionLoadError: null,
  kuRow: null,
  kuLoadError: null,
  updates: [],
  inserts: [],
  deletes: [],
  stepInsertError: null,
  stepInsertCount: null,
  jobInsertError: null,
  costInsertError: null,
  rpcCalls: [],
  rpcError: null,
  bedrockResult: "",
  bedrockError: null,
  bedrockCalls: 0,
  capturedExceptions: [],
  capturedWarnings: [],
  capturedInfos: [],
};

function makeAdminClient() {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            // walkthrough_session.select(...).eq(...).single()
            eq(_col: string, _val: string) {
              return {
                async single() {
                  if (table === "walkthrough_session") {
                    if (state.sessionLoadError) {
                      return { data: null, error: state.sessionLoadError };
                    }
                    return { data: state.sessionRow, error: null };
                  }
                  return { data: null, error: new Error(`unmocked SELECT.eq.single ${table}`) };
                },
                // knowledge_unit.select(...).eq(...).eq(...).order(...).limit(...).maybeSingle()
                eq(_col2: string, _val2: string) {
                  return {
                    order(_col3: string, _opts: unknown) {
                      return {
                        limit(_n: number) {
                          return {
                            async maybeSingle() {
                              if (table === "knowledge_unit") {
                                if (state.kuLoadError) {
                                  return { data: null, error: state.kuLoadError };
                                }
                                return { data: state.kuRow, error: null };
                              }
                              return {
                                data: null,
                                error: new Error(`unmocked SELECT.maybeSingle ${table}`),
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(_col: string, val: string) {
              state.updates.push({ table, patch, matchId: val });
              return { error: null };
            },
          };
        },
        delete() {
          return {
            async eq(col: string, val: string) {
              state.deletes.push({ table, matchCol: col, matchVal: val });
              return { error: null };
            },
          };
        },
        insert(rowOrRows: Record<string, unknown> | Record<string, unknown>[], opts?: { count?: string }) {
          const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
          state.inserts.push({ table, rows });

          if (table === "walkthrough_step") {
            // Bulk-INSERT mit { count: 'exact' } — gibt direkt Promise zurueck (kein .select chain).
            if (opts?.count === "exact") {
              return {
                then(
                  onFulfilled: (v: { error: Error | null; count: number | null }) => unknown,
                ) {
                  if (state.stepInsertError) {
                    return Promise.resolve({ error: state.stepInsertError, count: null }).then(
                      onFulfilled,
                    );
                  }
                  return Promise.resolve({
                    error: null,
                    count: state.stepInsertCount ?? rows.length,
                  }).then(onFulfilled);
                },
              };
            }
          }

          if (table === "ai_jobs") {
            return {
              select(_cols: string) {
                return {
                  async single() {
                    if (state.jobInsertError) {
                      return { data: null, error: state.jobInsertError };
                    }
                    return { data: { id: ENQUEUED_JOB_ID }, error: null };
                  },
                };
              },
            };
          }

          // ai_cost_ledger: Promise<{ error: ... }> ohne .select chain
          return {
            then(
              onFulfilled: (v: { error: { message: string; code?: string } | null }) => unknown,
            ) {
              return Promise.resolve({ error: state.costInsertError }).then(onFulfilled);
            },
          };
        },
      };
    },
    async rpc(name: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ name, args });
      if (state.rpcError) return { error: state.rpcError };
      return { error: null };
    },
  };
}

vi.mock("../../../lib/supabase/admin", () => ({
  createAdminClient: () => makeAdminClient(),
}));

vi.mock("../../../lib/llm", () => ({
  chatWithLLM: async () => {
    state.bedrockCalls++;
    if (state.bedrockError) throw state.bedrockError;
    return state.bedrockResult;
  },
}));

vi.mock("../../../lib/logger", () => ({
  captureException: (error: unknown, ctx?: { metadata?: unknown }) => {
    state.capturedExceptions.push({ error, metadata: ctx?.metadata });
  },
  captureWarning: (message: string, ctx?: { metadata?: unknown }) => {
    state.capturedWarnings.push({ message, metadata: ctx?.metadata });
  },
  captureInfo: (message: string, ctx?: { metadata?: unknown }) => {
    state.capturedInfos.push({ message, metadata: ctx?.metadata });
  },
}));

// Import AFTER mocks so the handler picks the mocked modules up.
const { handleExtractStepsJob } = await import("../handle-extract-steps-job");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(payload: Record<string, unknown> = {}): ClaimedJob {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    job_type: "walkthrough_extract_steps",
    payload: { walkthroughSessionId: SESSION_ID, ...payload },
    created_at: new Date().toISOString(),
  };
}

function defaultSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: SESSION_ID,
    tenant_id: TENANT_ID,
    recorded_by_user_id: RECORDER_ID,
    status: "extracting",
    ...overrides,
  };
}

beforeEach(() => {
  state.sessionRow = defaultSession();
  state.sessionLoadError = null;
  state.kuRow = {
    id: REDACTED_KU_ID,
    body: FIXTURE_AUFTRAGSANNAHME.body,
  };
  state.kuLoadError = null;
  state.updates = [];
  state.inserts = [];
  state.deletes = [];
  state.stepInsertError = null;
  state.stepInsertCount = null;
  state.jobInsertError = null;
  state.costInsertError = null;
  state.rpcCalls = [];
  state.rpcError = null;
  state.bedrockResult = FIXTURE_AUFTRAGSANNAHME.mockBedrockOutput;
  state.bedrockError = null;
  state.bedrockCalls = 0;
  state.capturedExceptions = [];
  state.capturedWarnings = [];
  state.capturedInfos = [];
});

// ---------------------------------------------------------------------------
// Happy path — alle 5 strukturierten Fixtures
// ---------------------------------------------------------------------------

describe("handleExtractStepsJob — happy path with structured fixtures", () => {
  for (const fixture of ALL_STRUCTURED_FIXTURES) {
    it(`extracts steps from fixture '${fixture.id}' and advances pipeline`, async () => {
      state.kuRow = { id: REDACTED_KU_ID, body: fixture.body };
      state.bedrockResult = fixture.mockBedrockOutput;

      await handleExtractStepsJob(makeJob());

      // 1. Bedrock genau einmal gerufen
      expect(state.bedrockCalls).toBe(1);

      // 2. Idempotency: DELETE vor INSERT
      expect(state.deletes).toHaveLength(1);
      expect(state.deletes[0]).toEqual({
        table: "walkthrough_step",
        matchCol: "walkthrough_session_id",
        matchVal: SESSION_ID,
      });

      // 3. Bulk-INSERT in walkthrough_step mit erwarteter Schritt-Anzahl
      const stepInsert = state.inserts.find((i) => i.table === "walkthrough_step");
      expect(stepInsert).toBeDefined();
      const expectedSteps = JSON.parse(fixture.mockBedrockOutput) as unknown[];
      expect(stepInsert!.rows).toHaveLength(expectedSteps.length);

      // 4. step_number 1..N sequenziell, vom Worker erzwungen
      stepInsert!.rows.forEach((row, idx) => {
        expect(row.step_number).toBe(idx + 1);
        expect(row.tenant_id).toBe(TENANT_ID);
        expect(row.walkthrough_session_id).toBe(SESSION_ID);
        expect(row.action).toBeTypeOf("string");
        expect((row.action as string).length).toBeGreaterThan(0);
      });

      // 5. transcript_offset_start/_end via indexOf berechnet (deterministisch)
      stepInsert!.rows.forEach((row) => {
        const snippet = row.transcript_snippet as string;
        if (fixture.body.includes(snippet)) {
          expect(row.transcript_offset_start).toBe(fixture.body.indexOf(snippet));
          expect(row.transcript_offset_end).toBe(
            fixture.body.indexOf(snippet) + snippet.length,
          );
        }
      });

      // 6. Pipeline-Trigger: status extracting → mapping
      const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
      expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["mapping"]);

      // 7. Folge-Job ai_jobs walkthrough_map_subtopics enqueued
      const aiJobInsert = state.inserts.find((i) => i.table === "ai_jobs");
      expect(aiJobInsert).toBeDefined();
      expect(aiJobInsert!.rows[0]).toMatchObject({
        tenant_id: TENANT_ID,
        job_type: "walkthrough_map_subtopics",
        status: "pending",
      });

      // 8. Cost-Ledger geschrieben mit role='walkthrough_step_extractor'
      const costInsert = state.inserts.find((i) => i.table === "ai_cost_ledger");
      expect(costInsert).toBeDefined();
      expect(costInsert!.rows[0]).toMatchObject({
        tenant_id: TENANT_ID,
        job_id: JOB_ID,
        role: "walkthrough_step_extractor",
        feature: "walkthrough_step_extraction",
      });

      // 9. ai_job complete via RPC
      expect(state.rpcCalls).toEqual([
        { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
      ]);
    });
  }
});

// ---------------------------------------------------------------------------
// Edge-Case N=0
// ---------------------------------------------------------------------------

describe("handleExtractStepsJob — N=0 edge case (MT-5)", () => {
  it("advances pipeline without INSERT when Bedrock returns empty array", async () => {
    state.kuRow = { id: REDACTED_KU_ID, body: FIXTURE_UNSTRUKTURIERT.body };
    state.bedrockResult = FIXTURE_UNSTRUKTURIERT.mockBedrockOutput; // "[]"

    await handleExtractStepsJob(makeJob());

    // Bedrock gerufen
    expect(state.bedrockCalls).toBe(1);

    // DELETE lief (idempotent), aber KEIN walkthrough_step-INSERT
    expect(state.deletes).toHaveLength(1);
    const stepInsert = state.inserts.find((i) => i.table === "walkthrough_step");
    expect(stepInsert).toBeUndefined();

    // Pipeline-Trigger feuerte trotzdem
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["mapping"]);

    // Folge-Job enqueued
    const aiJobInsert = state.inserts.find((i) => i.table === "ai_jobs");
    expect(aiJobInsert).toBeDefined();
    expect(aiJobInsert!.rows[0]).toMatchObject({ job_type: "walkthrough_map_subtopics" });

    // Cost-Ledger trotzdem geschrieben
    const costInsert = state.inserts.find((i) => i.table === "ai_cost_ledger");
    expect(costInsert).toBeDefined();

    // Job complete
    expect(state.rpcCalls).toEqual([
      { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
    ]);
  });

  it("strips ```json codeblock fence if Bedrock wraps the output", async () => {
    state.bedrockResult = "```json\n[]\n```";

    await handleExtractStepsJob(makeJob());

    // Trotz Codeblock parst der Worker das leere Array sauber
    expect(state.deletes).toHaveLength(1);
    const stepInsert = state.inserts.find((i) => i.table === "walkthrough_step");
    expect(stepInsert).toBeUndefined();
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["mapping"]);
  });
});

// ---------------------------------------------------------------------------
// Cost-Ledger silent-failure (IMP-371)
// ---------------------------------------------------------------------------

describe("handleExtractStepsJob — ai_cost_ledger non-fatal", () => {
  it("captures a warning but completes successfully when ai_cost_ledger INSERT fails", async () => {
    state.costInsertError = { message: "violates check constraint", code: "23514" };

    await handleExtractStepsJob(makeJob());

    expect(state.capturedWarnings.some((w) => w.message.includes("ai_cost_ledger"))).toBe(true);
    // walkthrough_step + ai_jobs INSERTs liefen trotzdem durch
    expect(state.inserts.some((i) => i.table === "walkthrough_step")).toBe(true);
    expect(state.inserts.some((i) => i.table === "ai_jobs")).toBe(true);
    // Pipeline-Trigger feuerte
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["mapping"]);
    // Job complete
    expect(state.rpcCalls).toEqual([
      { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Skip-Pfad
// ---------------------------------------------------------------------------

describe("handleExtractStepsJob — skip on unexpected status", () => {
  it("skips and completes when status != 'extracting'", async () => {
    state.sessionRow = defaultSession({ status: "approved" });

    await handleExtractStepsJob(makeJob());

    expect(state.bedrockCalls).toBe(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
    expect(state.capturedWarnings).toHaveLength(1);
    expect(state.capturedWarnings[0].message).toContain("status='approved'");
    expect(state.rpcCalls).toEqual([
      { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Failed paths
// ---------------------------------------------------------------------------

describe("handleExtractStepsJob — failed paths", () => {
  it("rejects payload without UUID without touching the session", async () => {
    const job = { ...makeJob(), payload: { walkthroughSessionId: "not-a-uuid" } };

    await expect(handleExtractStepsJob(job)).rejects.toThrow(/UUID/);

    expect(state.bedrockCalls).toBe(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("rejects when no redacted KU exists for the session", async () => {
    state.kuRow = null;

    await expect(handleExtractStepsJob(makeJob())).rejects.toThrow(/redacted KU/);

    expect(state.bedrockCalls).toBe(0);
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["failed"]);
    expect(state.capturedExceptions).toHaveLength(1);
  });

  it("Bedrock failure → status='failed' + re-throw + no INSERT", async () => {
    state.bedrockError = new Error("bedrock unreachable");

    await expect(handleExtractStepsJob(makeJob())).rejects.toThrow(/bedrock/);

    expect(state.inserts.some((i) => i.table === "walkthrough_step")).toBe(false);
    expect(state.inserts.some((i) => i.table === "ai_cost_ledger")).toBe(false);
    expect(state.inserts.some((i) => i.table === "ai_jobs")).toBe(false);
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["failed"]);
    expect(state.capturedExceptions).toHaveLength(1);
    expect(state.rpcCalls.some((c) => c.name === "rpc_complete_ai_job")).toBe(false);
  });

  it("empty Bedrock response → status='failed' + re-throw", async () => {
    state.bedrockResult = "   ";

    await expect(handleExtractStepsJob(makeJob())).rejects.toThrow(/empty/);

    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["failed"]);
  });

  it("invalid JSON → status='failed' + re-throw", async () => {
    state.bedrockResult = "this is not json";

    await expect(handleExtractStepsJob(makeJob())).rejects.toThrow(/JSON\.parse/);

    expect(state.inserts.some((i) => i.table === "walkthrough_step")).toBe(false);
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["failed"]);
  });

  it("Zod-validation failure (missing required action) → status='failed'", async () => {
    state.bedrockResult = JSON.stringify([
      { step_number: 1, transcript_snippet: "fragment ohne action" },
    ]);

    await expect(handleExtractStepsJob(makeJob())).rejects.toThrow(/Zod/);

    expect(state.inserts.some((i) => i.table === "walkthrough_step")).toBe(false);
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["failed"]);
  });

  it("walkthrough_step bulk-INSERT failure → status='failed' + re-throw", async () => {
    state.stepInsertError = new Error("constraint violation");

    await expect(handleExtractStepsJob(makeJob())).rejects.toThrow(/constraint/);

    expect(state.bedrockCalls).toBe(1);
    expect(state.deletes).toHaveLength(1);
    // Cost-Ledger nicht geschrieben (passiert NACH walkthrough_step-INSERT)
    expect(state.inserts.some((i) => i.table === "ai_cost_ledger")).toBe(false);
    expect(state.inserts.some((i) => i.table === "ai_jobs")).toBe(false);
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["failed"]);
  });
});
