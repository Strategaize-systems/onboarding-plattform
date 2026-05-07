// Vitest unit tests for handleRedactPiiJob (SLC-076 MT-4).
// Mocks supabase admin client, chatWithLLM (Bedrock) and the logger so the handler
// can be exercised without a live worker / live Bedrock call.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ClaimedJob } from "../../condensation/claim-loop";

// ---------------------------------------------------------------------------
// State + Mock-Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const CAPTURE_SESSION_ID = "33333333-3333-3333-3333-333333333333";
const RECORDER_ID = "44444444-4444-4444-4444-444444444444";
const ORIGINAL_KU_ID = "55555555-5555-5555-5555-555555555555";
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
  row: Record<string, unknown>;
}

interface SessionRow {
  id: string;
  tenant_id: string;
  capture_session_id: string;
  recorded_by_user_id: string;
  transcript_knowledge_unit_id: string | null;
  status: string;
}

interface KuRow {
  id: string;
  body: string;
}

interface MockState {
  sessionRow: SessionRow | null;
  sessionLoadError: Error | null;
  kuRow: KuRow | null;
  kuLoadError: Error | null;
  updates: UpdateRecord[];
  inserts: InsertRecord[];
  kuInsertError: Error | null;
  jobInsertError: Error | null;
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
  kuInsertError: null,
  jobInsertError: null,
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
            eq(_col: string, _val: string) {
              return {
                async single() {
                  if (table === "walkthrough_session") {
                    if (state.sessionLoadError) {
                      return { data: null, error: state.sessionLoadError };
                    }
                    return { data: state.sessionRow, error: null };
                  }
                  if (table === "knowledge_unit") {
                    if (state.kuLoadError) {
                      return { data: null, error: state.kuLoadError };
                    }
                    return { data: state.kuRow, error: null };
                  }
                  return { data: null, error: new Error(`unmocked SELECT ${table}`) };
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
        insert(row: Record<string, unknown>) {
          state.inserts.push({ table, row });
          if (table === "knowledge_unit") {
            return {
              select(_cols: string) {
                return {
                  async single() {
                    if (state.kuInsertError) {
                      return { data: null, error: state.kuInsertError };
                    }
                    return { data: { id: REDACTED_KU_ID }, error: null };
                  },
                };
              },
            };
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
          // ai_cost_ledger oder andere Inserts ohne select chain (fire-and-forget)
          return {
            then(onFulfilled: (v: { error: null }) => unknown) {
              return Promise.resolve({ error: null }).then(onFulfilled);
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
const { handleRedactPiiJob } = await import("../handle-redact-pii-job");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(payload: Record<string, unknown> = {}): ClaimedJob {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    job_type: "walkthrough_redact_pii",
    payload: { walkthroughSessionId: SESSION_ID, ...payload },
    created_at: new Date().toISOString(),
  };
}

function defaultSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: SESSION_ID,
    tenant_id: TENANT_ID,
    capture_session_id: CAPTURE_SESSION_ID,
    recorded_by_user_id: RECORDER_ID,
    transcript_knowledge_unit_id: ORIGINAL_KU_ID,
    status: "redacting",
    ...overrides,
  };
}

beforeEach(() => {
  state.sessionRow = defaultSession();
  state.sessionLoadError = null;
  state.kuRow = {
    id: ORIGINAL_KU_ID,
    body:
      "Anna Mueller hat heute angerufen und gefragt, ob die Lieferung an kontakt@firma.de geht. " +
      "Ihre IBAN ist DE89 3704 0044 0532 0130 00.",
  };
  state.kuLoadError = null;
  state.updates = [];
  state.inserts = [];
  state.kuInsertError = null;
  state.jobInsertError = null;
  state.rpcCalls = [];
  state.rpcError = null;
  state.bedrockResult =
    "[KUNDE] hat heute angerufen und gefragt, ob die Lieferung an [EMAIL] geht. Ihre IBAN ist [IBAN].";
  state.bedrockError = null;
  state.bedrockCalls = 0;
  state.capturedExceptions = [];
  state.capturedWarnings = [];
  state.capturedInfos = [];
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("handleRedactPiiJob — happy path", () => {
  it("redacts the original KU, advances pipeline to extracting and completes the job", async () => {
    await handleRedactPiiJob(makeJob());

    // 1. Bedrock wurde genau einmal gerufen
    expect(state.bedrockCalls).toBe(1);

    // 2. Redacted KU INSERT
    const kuInsert = state.inserts.find((i) => i.table === "knowledge_unit");
    expect(kuInsert).toBeDefined();
    expect(kuInsert!.row).toMatchObject({
      tenant_id: TENANT_ID,
      capture_session_id: CAPTURE_SESSION_ID,
      block_checkpoint_id: null,
      block_key: "unassigned",
      source: "walkthrough_transcript_redacted",
      unit_type: "observation",
      confidence: "medium",
      updated_by: RECORDER_ID,
    });
    expect(kuInsert!.row.evidence_refs).toEqual({
      original_knowledge_unit_id: ORIGINAL_KU_ID,
      walkthrough_session_id: SESSION_ID,
      recorded_by_user_id: RECORDER_ID,
    });
    expect(kuInsert!.row.body).toBe(state.bedrockResult);

    // 3. Cost-Ledger geschrieben
    const costInsert = state.inserts.find((i) => i.table === "ai_cost_ledger");
    expect(costInsert).toBeDefined();
    expect(costInsert!.row).toMatchObject({
      tenant_id: TENANT_ID,
      job_id: JOB_ID,
      role: "walkthrough_pii_redactor",
      feature: "walkthrough_pii_redaction",
    });
    expect(costInsert!.row.tokens_in).toBeGreaterThan(0);
    expect(costInsert!.row.tokens_out).toBeGreaterThan(0);

    // 4. Pipeline-Trigger: Status redacting → extracting + ai_jobs INSERT walkthrough_extract_steps
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["extracting"]);
    const aiJobInsert = state.inserts.find((i) => i.table === "ai_jobs");
    expect(aiJobInsert).toBeDefined();
    expect(aiJobInsert!.row).toMatchObject({
      tenant_id: TENANT_ID,
      job_type: "walkthrough_extract_steps",
      status: "pending",
    });
    expect((aiJobInsert!.row.payload as Record<string, unknown>).walkthroughSessionId).toBe(
      SESSION_ID,
    );

    // 5. ai_job complete via RPC
    expect(state.rpcCalls).toEqual([
      { name: "rpc_complete_ai_job", args: { p_job_id: JOB_ID } },
    ]);
  });

  it("truncates very long redacted output to a usable title", async () => {
    state.bedrockResult = "X".repeat(500);

    await handleRedactPiiJob(makeJob());

    const kuInsert = state.inserts.find((i) => i.table === "knowledge_unit");
    expect(kuInsert).toBeDefined();
    expect((kuInsert!.row.title as string).length).toBeLessThanOrEqual(80);
    expect(kuInsert!.row.title as string).toMatch(/\.\.\.$/);
  });
});

// ---------------------------------------------------------------------------
// Skip-Pfad
// ---------------------------------------------------------------------------

describe("handleRedactPiiJob — skip on unexpected status", () => {
  it("skips and completes when status != 'redacting'", async () => {
    state.sessionRow = defaultSession({ status: "approved" });

    await handleRedactPiiJob(makeJob());

    expect(state.bedrockCalls).toBe(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
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

describe("handleRedactPiiJob — failed paths", () => {
  it("rejects payload without UUID without touching the session", async () => {
    const job = { ...makeJob(), payload: { walkthroughSessionId: "not-a-uuid" } };

    await expect(handleRedactPiiJob(job)).rejects.toThrow(/UUID/);

    expect(state.bedrockCalls).toBe(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it("rejects when session has no transcript_knowledge_unit_id", async () => {
    state.sessionRow = defaultSession({ transcript_knowledge_unit_id: null });

    await expect(handleRedactPiiJob(makeJob())).rejects.toThrow(
      /transcript_knowledge_unit_id/,
    );

    expect(state.bedrockCalls).toBe(0);
    // Failed-Path setzt status='failed'
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["failed"]);
    expect(state.capturedExceptions).toHaveLength(1);
  });

  it("Bedrock failure → status='failed' + re-throw + no KU/cost/job INSERT", async () => {
    state.bedrockError = new Error("bedrock unreachable");

    await expect(handleRedactPiiJob(makeJob())).rejects.toThrow(/bedrock/);

    expect(state.inserts.some((i) => i.table === "knowledge_unit")).toBe(false);
    expect(state.inserts.some((i) => i.table === "ai_cost_ledger")).toBe(false);
    expect(state.inserts.some((i) => i.table === "ai_jobs")).toBe(false);
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["failed"]);
    expect(state.capturedExceptions).toHaveLength(1);
    expect(state.rpcCalls.some((c) => c.name === "rpc_complete_ai_job")).toBe(false);
  });

  it("empty Bedrock response → status='failed' + re-throw", async () => {
    state.bedrockResult = "   ";

    await expect(handleRedactPiiJob(makeJob())).rejects.toThrow(/empty/);

    expect(state.inserts.some((i) => i.table === "knowledge_unit")).toBe(false);
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["failed"]);
  });

  it("redacted KU INSERT failure → status='failed' + re-throw", async () => {
    state.kuInsertError = new Error("constraint violation");

    await expect(handleRedactPiiJob(makeJob())).rejects.toThrow(/constraint/);

    expect(state.bedrockCalls).toBe(1);
    // Cost-Ledger nicht geschrieben (passiert NACH KU-INSERT)
    expect(state.inserts.some((i) => i.table === "ai_cost_ledger")).toBe(false);
    expect(state.inserts.some((i) => i.table === "ai_jobs")).toBe(false);
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["failed"]);
  });
});
