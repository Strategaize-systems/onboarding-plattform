// V6.3 SLC-105 MT-4 — Vitest fuer runLightPipeline.
//
// Vier Tests, abgeleitet aus dem Slice-Plan und der Handoff-Note:
//   1. Happy-Path — 6 Bloecke laufen durch, RPC + Cost-Ledger + Success-Log gerufen.
//   2. Bedrock-Error — Promise.all-Reject, RPC nie gerufen, error_log mit reason=bedrock_failed.
//   3. RPC-Tx-Fail — RPC wirft, RPC ist letzter Schritt, capture_session.status nicht updated (durch RPC selbst).
//   4. Empty-Answers — computeBlockScores wirft, error_log mit reason=score_compute_failed.
//
// Strategie: vi.mock fuer ../../lib/llm + ../../lib/logger. Adminclient ist Stub mit from/rpc mocks.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/llm", () => ({
  chatWithLLM: vi.fn(),
}));

vi.mock("../../../lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
}));

import {
  runLightPipeline,
  buildLightPipelinePrompt,
  type BedrockCaller,
  type LightPipelineSession,
  type LightPipelineTemplate,
  type TemplateBlock,
} from "../light-pipeline";

// --- Test-Fixtures -----------------------------------------------------------

const TENANT = "11111111-1111-1111-1111-111111111111";
const SESSION = "22222222-2222-2222-2222-222222222222";
const TEMPLATE = "33333333-3333-3333-3333-333333333333";
const OWNER = "44444444-4444-4444-4444-444444444444";
const JOB = "55555555-5555-5555-5555-555555555555";

const blockA: TemplateBlock = {
  key: "ki_reife",
  title: "Strukturelle KI-Reife",
  intro: "Misst Organisations-Reife.",
  order: 1,
  comment_anchors: {
    low: "Strukturelle Defizite sichtbar.",
    mid: "Teil-Reife mit Lucken.",
    high: "Tragbare Strukturreife.",
  },
  questions: [
    {
      key: "ki_reife.q1",
      text: "Wie viele zentrale Systeme?",
      question_type: "multiple_choice",
      scale_direction: "negative",
      score_mapping: [
        { label: "Mehr als 10", score: 0 },
        { label: "6-10", score: 25 },
        { label: "4-5", score: 50 },
        { label: "2-3", score: 75 },
        { label: "1 klares", score: 100 },
      ],
    },
    {
      key: "ki_reife.q2",
      text: "Stammdaten-Qualitaet?",
      question_type: "likert_5",
      scale_direction: "positive",
      score_mapping: [
        { label: "Sehr unzuverlassig", score: 0 },
        { label: "Eher unzuverlassig", score: 25 },
        { label: "Teils-teils", score: 50 },
        { label: "Eher zuverlassig", score: 75 },
        { label: "Sehr zuverlassig", score: 100 },
      ],
    },
  ],
};

const blockB: TemplateBlock = {
  key: "entscheidungs_qualitaet",
  title: "Entscheidungs-Qualitaet",
  intro: "Misst Entscheidungs-Kultur.",
  order: 2,
  comment_anchors: {
    low: "Entscheidungen unstrukturiert.",
    mid: "Teil-strukturiert.",
    high: "Dokumentierte Entscheidungen.",
  },
  questions: [
    {
      key: "entscheidungs_qualitaet.q1",
      text: "Wie werden Entscheidungen festgehalten?",
      question_type: "multiple_choice",
      scale_direction: "positive",
      score_mapping: [
        { label: "Gar nicht", score: 0 },
        { label: "Teilweise", score: 25 },
        { label: "Einzelne", score: 50 },
        { label: "Feste Ablage", score: 75 },
        { label: "Systematisch", score: 100 },
      ],
    },
  ],
};

const sessionFixture: LightPipelineSession = {
  id: SESSION,
  tenant_id: TENANT,
  template_id: TEMPLATE,
  owner_user_id: OWNER,
  answers: {
    "ki_reife.q1": "2-3",
    "ki_reife.q2": "Eher zuverlassig",
    "entscheidungs_qualitaet.q1": "Feste Ablage",
  },
};

const templateFixture: LightPipelineTemplate = {
  id: TEMPLATE,
  version: "v1",
  blocks: [blockA, blockB],
  metadata: { usage_kind: "self_service_partner_diagnostic" },
};

// --- AdminClient-Mock-Helper ------------------------------------------------

interface MockState {
  costInsertCalls: Array<Record<string, unknown>>;
  errorLogInsertCalls: Array<Record<string, unknown>>;
  rpcCalls: Array<{ fn: string; payload: unknown }>;
  rpcResponse: { data: unknown; error: { message: string } | null };
  errorLogInsertError: { message: string } | null;
  costInsertError: { message: string } | null;
}

function buildAdminClient(state: MockState) {
  const fromMock = vi.fn((table: string) => {
    if (table === "ai_cost_ledger") {
      return {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          state.costInsertCalls.push(row);
          return { error: state.costInsertError };
        }),
      };
    }
    if (table === "error_log") {
      return {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          state.errorLogInsertCalls.push(row);
          return { error: state.errorLogInsertError };
        }),
      };
    }
    throw new Error(`unexpected from(${table})`);
  });
  const rpcMock = vi.fn(async (fn: string, payload: unknown) => {
    state.rpcCalls.push({ fn, payload });
    return state.rpcResponse;
  });
  return {
    client: { from: fromMock, rpc: rpcMock } as unknown as Parameters<
      typeof runLightPipeline
    >[0]["adminClient"],
    fromMock,
    rpcMock,
  };
}

function freshState(): MockState {
  return {
    costInsertCalls: [],
    errorLogInsertCalls: [],
    rpcCalls: [],
    rpcResponse: {
      data: {
        block_count: 2,
        knowledge_unit_ids: ["aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
        capture_session_id: SESSION,
      },
      error: null,
    },
    errorLogInsertError: null,
    costInsertError: null,
  };
}

const happyBedrockCaller: BedrockCaller = vi.fn(async ({ user }) => ({
  text: `Kommentar zu Block ${user.slice(0, 20)}...`,
  tokens_in: 100,
  tokens_out: 50,
  usd_cost: 0.001,
  duration_ms: 500,
  model_id: "test-model",
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Tests -------------------------------------------------------------------

describe("runLightPipeline — Happy-Path", () => {
  it("ruft Bedrock pro Block, Cost-Ledger pro Block, RPC einmal, Success-Log einmal", async () => {
    const state = freshState();
    const { client, rpcMock } = buildAdminClient(state);

    const result = await runLightPipeline({
      session: sessionFixture,
      template: templateFixture,
      adminClient: client,
      jobId: JOB,
      bedrockCaller: happyBedrockCaller,
    });

    // Bedrock pro Block
    expect(happyBedrockCaller).toHaveBeenCalledTimes(2);
    // Cost-Ledger pro Block
    expect(state.costInsertCalls).toHaveLength(2);
    expect(state.costInsertCalls[0]).toMatchObject({
      tenant_id: TENANT,
      job_id: JOB,
      role: "light_pipeline_block",
      model_id: "test-model",
      tokens_in: 100,
      tokens_out: 50,
    });
    // RPC einmal mit korrektem Payload
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const rpcCall = state.rpcCalls[0];
    expect(rpcCall.fn).toBe("rpc_finalize_partner_diagnostic");
    const payload = (rpcCall.payload as { p_payload: { blocks: unknown[] } }).p_payload;
    expect(payload).toMatchObject({
      capture_session_id: SESSION,
      tenant_id: TENANT,
      owner_user_id: OWNER,
    });
    expect((payload as { blocks: unknown[] }).blocks).toHaveLength(2);

    // Success-Log einmal (level='info')
    expect(state.errorLogInsertCalls).toHaveLength(1);
    expect(state.errorLogInsertCalls[0]).toMatchObject({
      level: "info",
      source: "partner_diagnostic_finalized",
    });
    const logMetadata = state.errorLogInsertCalls[0].metadata as {
      session_id: string;
      block_count: number;
      total_score_avg: number;
    };
    expect(logMetadata.session_id).toBe(SESSION);
    expect(logMetadata.block_count).toBe(2);

    // Return-Wert
    expect(result.block_count).toBe(2);
    expect(result.capture_session_id).toBe(SESSION);
    expect(result.knowledge_unit_ids).toHaveLength(2);
    expect(typeof result.total_score_avg).toBe("number");
    expect(result.cost_usd).toBeCloseTo(0.002, 4);
  });

  it("legt content_hash deterministisch an", async () => {
    const state = freshState();
    const { client } = buildAdminClient(state);

    await runLightPipeline({
      session: sessionFixture,
      template: templateFixture,
      adminClient: client,
      jobId: JOB,
      bedrockCaller: happyBedrockCaller,
    });

    const payload = (state.rpcCalls[0].payload as {
      p_payload: { blocks: Array<{ block_key: string; content_hash: string; content: Record<string, string> }> };
    }).p_payload;
    expect(payload.blocks[0].content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.blocks[0].content).toEqual({
      "ki_reife.q1": "2-3",
      "ki_reife.q2": "Eher zuverlassig",
    });

    // Re-Run mit gleichen Answers ergibt gleichen Hash
    const state2 = freshState();
    const { client: client2 } = buildAdminClient(state2);
    await runLightPipeline({
      session: sessionFixture,
      template: templateFixture,
      adminClient: client2,
      jobId: JOB,
      bedrockCaller: happyBedrockCaller,
    });
    const payload2 = (state2.rpcCalls[0].payload as {
      p_payload: { blocks: Array<{ content_hash: string }> };
    }).p_payload;
    expect(payload2.blocks[0].content_hash).toBe(payload.blocks[0].content_hash);
  });
});

describe("runLightPipeline — Bedrock-Error", () => {
  it("Promise.all-Reject → RPC NIE gerufen, error_log mit reason=bedrock_failed", async () => {
    const state = freshState();
    const { client, rpcMock } = buildAdminClient(state);

    const failingBedrock: BedrockCaller = vi.fn(async () => {
      throw new Error("Bedrock 503 Service Unavailable");
    });

    await expect(
      runLightPipeline({
        session: sessionFixture,
        template: templateFixture,
        adminClient: client,
        jobId: JOB,
        bedrockCaller: failingBedrock,
      }),
    ).rejects.toThrow(/Bedrock 503/);

    // RPC darf NIE gerufen werden
    expect(rpcMock).not.toHaveBeenCalled();
    // error_log mit reason=bedrock_failed
    expect(state.errorLogInsertCalls).toHaveLength(1);
    expect(state.errorLogInsertCalls[0]).toMatchObject({
      level: "error",
      source: "partner_diagnostic_failed",
    });
    expect(
      (state.errorLogInsertCalls[0].metadata as { reason: string }).reason,
    ).toBe("bedrock_failed");
  });
});

describe("runLightPipeline — RPC-Tx-Fail", () => {
  it("RPC wirft → error_log mit reason=finalize_rpc_failed, Exception re-thrown", async () => {
    const state = freshState();
    state.rpcResponse = {
      data: null,
      error: { message: "duplicate key value violates unique constraint" },
    };
    const { client, rpcMock } = buildAdminClient(state);

    await expect(
      runLightPipeline({
        session: sessionFixture,
        template: templateFixture,
        adminClient: client,
        jobId: JOB,
        bedrockCaller: happyBedrockCaller,
      }),
    ).rejects.toThrow(/rpc_finalize_partner_diagnostic failed/);

    // Bedrock + Cost-Ledger lief noch durch (vor RPC)
    expect(happyBedrockCaller).toHaveBeenCalledTimes(2);
    expect(state.costInsertCalls).toHaveLength(2);
    // RPC einmal gerufen, fehlgeschlagen
    expect(rpcMock).toHaveBeenCalledTimes(1);
    // error_log mit reason=finalize_rpc_failed
    expect(state.errorLogInsertCalls).toHaveLength(1);
    expect(state.errorLogInsertCalls[0]).toMatchObject({
      level: "error",
      source: "partner_diagnostic_failed",
    });
    expect(
      (state.errorLogInsertCalls[0].metadata as { reason: string }).reason,
    ).toBe("finalize_rpc_failed");
  });
});

describe("runLightPipeline — Empty-Answers", () => {
  it("computeBlockScores wirft auf fehlender Antwort → error_log mit reason=score_compute_failed", async () => {
    const state = freshState();
    const { client, rpcMock } = buildAdminClient(state);

    const brokenSession: LightPipelineSession = {
      ...sessionFixture,
      answers: {}, // ALLE Antworten fehlen
    };

    await expect(
      runLightPipeline({
        session: brokenSession,
        template: templateFixture,
        adminClient: client,
        jobId: JOB,
        bedrockCaller: happyBedrockCaller,
      }),
    ).rejects.toThrow(/Missing answer/);

    // Bedrock NIE gerufen
    expect(happyBedrockCaller).not.toHaveBeenCalled();
    // RPC NIE gerufen
    expect(rpcMock).not.toHaveBeenCalled();
    // error_log mit reason=score_compute_failed
    expect(state.errorLogInsertCalls).toHaveLength(1);
    expect(state.errorLogInsertCalls[0]).toMatchObject({
      level: "error",
      source: "partner_diagnostic_failed",
    });
    expect(
      (state.errorLogInsertCalls[0].metadata as { reason: string }).reason,
    ).toBe("score_compute_failed");
  });
});

describe("buildLightPipelinePrompt", () => {
  it("waehlt Stil-Anker low bei Score ≤ 30", () => {
    const prompt = buildLightPipelinePrompt({
      block: blockA,
      answers: sessionFixture.answers,
      score: 25,
    });
    expect(prompt.user).toContain("Stil-Anker fuer Score-Bereich low");
    expect(prompt.user).toContain(blockA.comment_anchors.low);
  });

  it("waehlt Stil-Anker mid bei Score 31-55", () => {
    const prompt = buildLightPipelinePrompt({
      block: blockA,
      answers: sessionFixture.answers,
      score: 50,
    });
    expect(prompt.user).toContain("Stil-Anker fuer Score-Bereich mid");
    expect(prompt.user).toContain(blockA.comment_anchors.mid);
  });

  it("waehlt Stil-Anker high bei Score ≥ 56", () => {
    const prompt = buildLightPipelinePrompt({
      block: blockA,
      answers: sessionFixture.answers,
      score: 80,
    });
    expect(prompt.user).toContain("Stil-Anker fuer Score-Bereich high");
    expect(prompt.user).toContain(blockA.comment_anchors.high);
  });

  it("listet alle Block-Fragen mit Antworten im User-Prompt auf", () => {
    const prompt = buildLightPipelinePrompt({
      block: blockA,
      answers: sessionFixture.answers,
      score: 60,
    });
    expect(prompt.user).toContain("Wie viele zentrale Systeme?");
    expect(prompt.user).toContain("2-3");
    expect(prompt.user).toContain("Stammdaten-Qualitaet?");
    expect(prompt.user).toContain("Eher zuverlassig");
  });
});
