// V6.3 SLC-105 MT-5 — Vitest fuer Worker-Branch in handle-job.ts.
//
// Zwei Tests aus dem Slice-Plan und der Handoff-Note:
//   1. usage_kind === 'self_service_partner_diagnostic' → runLightPipeline gerufen,
//      runIterationLoop NICHT gerufen.
//   2. usage_kind === undefined (Standard-Templates wie exit_readiness) → runIterationLoop
//      gerufen, runLightPipeline NICHT gerufen.

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Module-Mocks ------------------------------------------------------------

const runLightPipelineMock = vi.fn();
const runIterationLoopMock = vi.fn();
const embedKnowledgeUnitsMock = vi.fn();
const runOrchestratorAssessmentMock = vi.fn();
const createAdminClientMock = vi.fn();

vi.mock("../light-pipeline", () => ({
  runLightPipeline: (...args: unknown[]) => runLightPipelineMock(...args),
}));

vi.mock("../iteration-loop", () => ({
  runIterationLoop: (...args: unknown[]) => runIterationLoopMock(...args),
}));

vi.mock("../embed-knowledge-units", () => ({
  embedKnowledgeUnits: (...args: unknown[]) => embedKnowledgeUnitsMock(...args),
}));

vi.mock("../orchestrator", () => ({
  runOrchestratorAssessment: (...args: unknown[]) =>
    runOrchestratorAssessmentMock(...args),
}));

vi.mock("../../../lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

vi.mock("../../../lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
}));

import { handleCondensationJob } from "../handle-job";
import type { ClaimedJob } from "../claim-loop";

// --- Fixtures ---------------------------------------------------------------

const TENANT = "11111111-1111-1111-1111-111111111111";
const SESSION = "22222222-2222-2222-2222-222222222222";
const TEMPLATE = "33333333-3333-3333-3333-333333333333";
const OWNER = "44444444-4444-4444-4444-444444444444";
const CHECKPOINT = "55555555-5555-5555-5555-555555555555";
const JOB_ID = "66666666-6666-6666-6666-666666666666";

const partnerDiagnosticTemplate = {
  id: TEMPLATE,
  version: "v1",
  blocks: [
    {
      key: "ki_reife",
      title: "KI-Reife",
      intro: "Intro",
      order: 1,
      comment_anchors: { low: "Low", mid: "Mid", high: "High" },
      questions: [
        {
          key: "ki_reife.q1",
          text: "Frage 1?",
          question_type: "multiple_choice",
          scale_direction: "positive",
          score_mapping: [
            { label: "A", score: 0 },
            { label: "B", score: 100 },
          ],
        },
      ],
    },
  ],
  metadata: { usage_kind: "self_service_partner_diagnostic" },
};

const exitReadinessTemplate = {
  id: TEMPLATE,
  version: "v2",
  blocks: [{ key: "A", title: "Geschaeftsmodell", questions: [{ id: "q1", text: "Frage?" }] }],
  metadata: {}, // KEIN usage_kind
};

const sessionRow = {
  id: SESSION,
  tenant_id: TENANT,
  template_id: TEMPLATE,
  template_version: "v1",
  owner_user_id: OWNER,
  capture_mode: "questionnaire",
  answers: { "ki_reife.q1": "B" },
};

/** Build admin-client mock that returns the given session+template + supports rpc + checkpoint flow. */
function buildAdminClient(opts: {
  session?: unknown;
  template?: unknown;
  checkpointRow?: unknown;
}) {
  const fromMock = vi.fn((table: string) => {
    if (table === "capture_session") {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: opts.session, error: null }) }),
        }),
      };
    }
    if (table === "template") {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: opts.template, error: null }) }),
        }),
      };
    }
    if (table === "block_checkpoint") {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: opts.checkpointRow, error: null }) }),
        }),
      };
    }
    if (table === "ai_iterations_log" || table === "ai_cost_ledger") {
      return { insert: vi.fn(async () => ({ error: null })) };
    }
    throw new Error(`unexpected from(${table})`);
  });
  const rpcMock = vi.fn(async (fn: string) => {
    if (fn === "rpc_complete_ai_job") return { data: null, error: null };
    if (fn === "rpc_bulk_import_knowledge_units") {
      return { data: { inserted_count: 0, ids: [] }, error: null };
    }
    return { data: null, error: null };
  });
  return { from: fromMock, rpc: rpcMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  runLightPipelineMock.mockResolvedValue({
    block_count: 1,
    knowledge_unit_ids: ["aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    capture_session_id: SESSION,
    total_score_avg: 50,
    cost_usd: 0.001,
    duration_ms: 100,
  });
  runIterationLoopMock.mockResolvedValue({
    block_key: "A",
    total_iterations: 2,
    final_verdict: "ACCEPTED",
    debrief_items: [],
    ko_assessment: [],
    sop_gaps: [],
    cross_block_observations: [],
    iteration_log: [],
    total_cost: {
      model_id: "test",
      tokens_in: 0,
      tokens_out: 0,
      usd_cost: 0,
      duration_ms: 0,
    },
  });
});

// --- Tests -------------------------------------------------------------------

describe("handleCondensationJob — V6.3 Worker-Branch Dispatch", () => {
  it("ruft runLightPipeline bei usage_kind=self_service_partner_diagnostic, NICHT runIterationLoop", async () => {
    const adminClient = buildAdminClient({
      session: sessionRow,
      template: partnerDiagnosticTemplate,
    });
    createAdminClientMock.mockReturnValue(adminClient);

    const job: ClaimedJob = {
      id: JOB_ID,
      tenant_id: TENANT,
      job_type: "knowledge_unit_condensation",
      payload: { capture_session_id: SESSION, source_kind: "diagnose" },
      created_at: "2026-05-16T00:00:00Z",
    };

    await handleCondensationJob(job);

    expect(runLightPipelineMock).toHaveBeenCalledTimes(1);
    expect(runIterationLoopMock).not.toHaveBeenCalled();

    // Verifiziert dass Light-Pipeline mit der echten session/template gerufen wurde
    const callArgs = runLightPipelineMock.mock.calls[0][0];
    expect(callArgs.session.id).toBe(SESSION);
    expect(callArgs.template.metadata.usage_kind).toBe(
      "self_service_partner_diagnostic",
    );
    expect(callArgs.jobId).toBe(JOB_ID);
    // rpc_complete_ai_job muss am Ende gerufen worden sein
    expect(adminClient.rpc).toHaveBeenCalledWith("rpc_complete_ai_job", {
      p_job_id: JOB_ID,
    });
  });

  it("faellt auf Standard-Pipeline (block_checkpoint) zurueck wenn usage_kind fehlt", async () => {
    const checkpointRow = {
      id: CHECKPOINT,
      tenant_id: TENANT,
      capture_session_id: SESSION,
      block_key: "A",
      content: { answers: [] },
      checkpoint_type: "questionnaire_submit",
    };
    const adminClient = buildAdminClient({
      session: sessionRow,
      template: exitReadinessTemplate,
      checkpointRow,
    });
    createAdminClientMock.mockReturnValue(adminClient);

    runOrchestratorAssessmentMock.mockResolvedValue({
      quality_report: {
        overall_score: 75,
        coverage: { coverage_ratio: "1/1" },
        gap_questions: [],
        recommendation: "accept",
      },
    });
    embedKnowledgeUnitsMock.mockResolvedValue(undefined);

    // Standard-Job ohne capture_session_id in payload
    const job: ClaimedJob = {
      id: JOB_ID,
      tenant_id: TENANT,
      job_type: "knowledge_unit_condensation",
      payload: { block_checkpoint_id: CHECKPOINT },
      created_at: "2026-05-16T00:00:00Z",
    };

    await handleCondensationJob(job);

    expect(runLightPipelineMock).not.toHaveBeenCalled();
    expect(runIterationLoopMock).toHaveBeenCalledTimes(1);
  });

  it("faellt auf Standard-Pipeline zurueck wenn capture_session_id im Payload, aber Template hat kein usage_kind", async () => {
    const checkpointRow = {
      id: CHECKPOINT,
      tenant_id: TENANT,
      capture_session_id: SESSION,
      block_key: "A",
      content: { answers: [] },
      checkpoint_type: "questionnaire_submit",
    };
    const adminClient = buildAdminClient({
      session: sessionRow,
      template: exitReadinessTemplate, // ohne usage_kind
      checkpointRow,
    });
    createAdminClientMock.mockReturnValue(adminClient);

    runOrchestratorAssessmentMock.mockResolvedValue({
      quality_report: {
        overall_score: 75,
        coverage: { coverage_ratio: "1/1" },
        gap_questions: [],
        recommendation: "accept",
      },
    });
    embedKnowledgeUnitsMock.mockResolvedValue(undefined);

    const job: ClaimedJob = {
      id: JOB_ID,
      tenant_id: TENANT,
      job_type: "knowledge_unit_condensation",
      payload: {
        capture_session_id: SESSION,
        block_checkpoint_id: CHECKPOINT,
      },
      created_at: "2026-05-16T00:00:00Z",
    };

    await handleCondensationJob(job);

    expect(runLightPipelineMock).not.toHaveBeenCalled();
    expect(runIterationLoopMock).toHaveBeenCalledTimes(1);
  });
});
