// Vitest unit tests for handleWalkthroughTranscribeJob (SLC-072 MT-2 + MT-3).
// Mocks supabase admin client, Whisper provider and ffmpeg/audio-extract so the
// handler can be exercised without a live worker container.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ClaimedJob } from "../../condensation/claim-loop";

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const sessionRowFixture = () => ({
  id: "11111111-1111-1111-1111-111111111111",
  tenant_id: "22222222-2222-2222-2222-222222222222",
  capture_session_id: "33333333-3333-3333-3333-333333333333",
  recorded_by_user_id: "44444444-4444-4444-4444-444444444444",
  storage_path:
    "22222222-2222-2222-2222-222222222222/11111111-1111-1111-1111-111111111111/recording.webm",
  storage_bucket: "walkthroughs",
  status: "uploaded",
});

interface UpdateRecord {
  table: string;
  patch: Record<string, unknown>;
  matchId?: string;
}

interface InsertRecord {
  table: string;
  row: Record<string, unknown>;
  result: Record<string, unknown> | null;
}

interface MockState {
  sessionRow: ReturnType<typeof sessionRowFixture> | null;
  loadError: Error | null;
  updates: UpdateRecord[];
  inserts: InsertRecord[];
  storageDownloadError: Error | null;
  storageBlob: Blob | null;
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  rpcError: Error | null;
  kuInsertResult: { id: string } | null;
  kuInsertError: Error | null;
  whisperResult: { text: string; duration_ms?: number };
  whisperError: Error | null;
  audioExtractResult: { wavBuffer: Buffer; durationSeconds: number };
  audioExtractError: Error | null;
  whisperCalls: number;
  audioExtractCalls: number;
  capturedExceptions: { error: unknown; metadata: unknown }[];
  capturedWarnings: { message: string; metadata: unknown }[];
  capturedInfos: { message: string; metadata: unknown }[];
}

const state: MockState = {
  sessionRow: null,
  loadError: null,
  updates: [],
  inserts: [],
  storageDownloadError: null,
  storageBlob: null,
  rpcCalls: [],
  rpcError: null,
  kuInsertResult: null,
  kuInsertError: null,
  whisperResult: { text: "" },
  whisperError: null,
  audioExtractResult: { wavBuffer: Buffer.alloc(0), durationSeconds: 0 },
  audioExtractError: null,
  whisperCalls: 0,
  audioExtractCalls: 0,
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
                  if (state.loadError) {
                    return { data: null, error: state.loadError };
                  }
                  return { data: state.sessionRow, error: null };
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
          return {
            select(_cols: string) {
              return {
                async single() {
                  state.inserts.push({
                    table,
                    row,
                    result: state.kuInsertResult,
                  });
                  if (state.kuInsertError) {
                    return { data: null, error: state.kuInsertError };
                  }
                  return { data: state.kuInsertResult, error: null };
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from(_bucket: string) {
        return {
          async download(_path: string) {
            if (state.storageDownloadError) {
              return { data: null, error: state.storageDownloadError };
            }
            return { data: state.storageBlob, error: null };
          },
        };
      },
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

vi.mock("../../../lib/ai/whisper/factory", () => ({
  getWhisperProvider: () => ({
    async transcribe() {
      state.whisperCalls++;
      if (state.whisperError) throw state.whisperError;
      return state.whisperResult;
    },
    async isAvailable() {
      return true;
    },
    providerId() {
      return "mock-whisper";
    },
  }),
}));

vi.mock("../../dialogue/audio-extract", () => ({
  async extractAudioBuffer() {
    state.audioExtractCalls++;
    if (state.audioExtractError) throw state.audioExtractError;
    return state.audioExtractResult;
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
const { handleWalkthroughTranscribeJob } = await import(
  "../handle-transcribe-job"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(payload: Record<string, unknown> = {}): ClaimedJob {
  return {
    id: "55555555-5555-5555-5555-555555555555",
    tenant_id: "22222222-2222-2222-2222-222222222222",
    job_type: "walkthrough_transcribe",
    payload: {
      walkthroughSessionId: "11111111-1111-1111-1111-111111111111",
      ...payload,
    },
    created_at: new Date().toISOString(),
  };
}

function makeBlob(bytes: number): Blob {
  const arr = new Uint8Array(bytes);
  return new Blob([arr]);
}

beforeEach(() => {
  state.sessionRow = sessionRowFixture();
  state.loadError = null;
  state.updates = [];
  state.inserts = [];
  state.storageDownloadError = null;
  state.storageBlob = makeBlob(2048);
  state.rpcCalls = [];
  state.rpcError = null;
  state.kuInsertResult = { id: "66666666-6666-6666-6666-666666666666" };
  state.kuInsertError = null;
  state.whisperResult = {
    text: "Heute zeige ich euch wie wir Reklamationen bearbeiten.",
  };
  state.whisperError = null;
  state.audioExtractResult = {
    wavBuffer: Buffer.alloc(32_000),
    durationSeconds: 1,
  };
  state.audioExtractError = null;
  state.whisperCalls = 0;
  state.audioExtractCalls = 0;
  state.capturedExceptions = [];
  state.capturedWarnings = [];
  state.capturedInfos = [];
});

// ---------------------------------------------------------------------------
// MT-2 — Happy Path + Status-Flip
// ---------------------------------------------------------------------------

describe("handleWalkthroughTranscribeJob — happy path", () => {
  it("flips status uploaded → transcribing → pending_review and inserts a knowledge_unit", async () => {
    await handleWalkthroughTranscribeJob(makeJob());

    const sessionUpdates = state.updates.filter(
      (u) => u.table === "walkthrough_session"
    );
    expect(sessionUpdates).toHaveLength(2);
    expect(sessionUpdates[0].patch.status).toBe("transcribing");
    expect(sessionUpdates[0].patch).toHaveProperty("transcript_started_at");
    expect(sessionUpdates[1].patch.status).toBe("pending_review");
    expect(sessionUpdates[1].patch.transcript_model).toBe("whisper-medium");
    expect(sessionUpdates[1].patch.transcript_knowledge_unit_id).toBe(
      "66666666-6666-6666-6666-666666666666"
    );
    expect(sessionUpdates[1].patch).toHaveProperty("transcript_completed_at");

    expect(state.audioExtractCalls).toBe(1);
    expect(state.whisperCalls).toBe(1);

    const kuInsert = state.inserts.find((i) => i.table === "knowledge_unit");
    expect(kuInsert).toBeDefined();
    expect(state.rpcCalls).toEqual([
      {
        name: "rpc_complete_ai_job",
        args: { p_job_id: "55555555-5555-5555-5555-555555555555" },
      },
    ]);
  });

  it("writes knowledge_unit with the agreed source/type/confidence and tenant from session", async () => {
    await handleWalkthroughTranscribeJob(makeJob());

    const ku = state.inserts.find((i) => i.table === "knowledge_unit");
    expect(ku).toBeDefined();
    expect(ku!.row).toMatchObject({
      tenant_id: "22222222-2222-2222-2222-222222222222",
      capture_session_id: "33333333-3333-3333-3333-333333333333",
      block_checkpoint_id: null,
      block_key: "unassigned",
      source: "walkthrough_transcript",
      unit_type: "observation",
      confidence: "medium",
      updated_by: "44444444-4444-4444-4444-444444444444",
    });
    expect(ku!.row.evidence_refs).toEqual({
      walkthrough_session_id: "11111111-1111-1111-1111-111111111111",
      recorded_by_user_id: "44444444-4444-4444-4444-444444444444",
    });
    expect(ku!.row.body).toBe(
      "Heute zeige ich euch wie wir Reklamationen bearbeiten."
    );
    expect(ku!.row.title).toBe(
      "Heute zeige ich euch wie wir Reklamationen bearbeiten."
    );
  });

  it("truncates long transcripts to a usable title", async () => {
    state.whisperResult = {
      text: "A".repeat(120) + " tail",
    };

    await handleWalkthroughTranscribeJob(makeJob());

    const ku = state.inserts.find((i) => i.table === "knowledge_unit");
    expect(ku!.row.title).toMatch(/\.\.\.$/);
    expect((ku!.row.title as string).length).toBeLessThanOrEqual(80);
  });

  it("skips and completes without throwing when status != 'uploaded'", async () => {
    state.sessionRow = { ...sessionRowFixture(), status: "approved" };

    await handleWalkthroughTranscribeJob(makeJob());

    expect(
      state.updates.filter((u) => u.table === "walkthrough_session")
    ).toHaveLength(0);
    expect(state.whisperCalls).toBe(0);
    expect(state.audioExtractCalls).toBe(0);
    expect(state.capturedWarnings).toHaveLength(1);
    expect(state.capturedWarnings[0].message).toContain("status='approved'");
    expect(state.rpcCalls).toEqual([
      {
        name: "rpc_complete_ai_job",
        args: { p_job_id: "55555555-5555-5555-5555-555555555555" },
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// MT-3 — Failed-Path + Error-Logging
// ---------------------------------------------------------------------------

describe("handleWalkthroughTranscribeJob — failed paths", () => {
  it("ffmpeg failure → status='failed' + error_log + re-throw", async () => {
    state.audioExtractError = new Error("ffmpeg crashed");

    await expect(handleWalkthroughTranscribeJob(makeJob())).rejects.toThrow(
      /ffmpeg/
    );

    const sessionUpdates = state.updates.filter(
      (u) => u.table === "walkthrough_session"
    );
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual([
      "transcribing",
      "failed",
    ]);
    expect(state.capturedExceptions).toHaveLength(1);
    expect(state.whisperCalls).toBe(0);
    // No completion call on the failure path — claim-loop will fail the job.
    expect(
      state.rpcCalls.some((c) => c.name === "rpc_complete_ai_job")
    ).toBe(false);
  });

  it("whisper failure → status='failed' + error_log + re-throw", async () => {
    state.whisperError = new Error("whisper unreachable");

    await expect(handleWalkthroughTranscribeJob(makeJob())).rejects.toThrow(
      /whisper/
    );

    const sessionUpdates = state.updates.filter(
      (u) => u.table === "walkthrough_session"
    );
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual([
      "transcribing",
      "failed",
    ]);
    expect(state.capturedExceptions).toHaveLength(1);
    expect(
      state.inserts.some((i) => i.table === "knowledge_unit")
    ).toBe(false);
  });

  it("rejects payload without a UUID without touching the session", async () => {
    const job = {
      ...makeJob(),
      payload: { walkthroughSessionId: "not-a-uuid" },
    };

    await expect(handleWalkthroughTranscribeJob(job)).rejects.toThrow(/UUID/);

    expect(state.updates).toHaveLength(0);
    expect(state.whisperCalls).toBe(0);
    expect(state.audioExtractCalls).toBe(0);
  });
});
