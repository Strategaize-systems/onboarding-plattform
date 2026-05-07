// Vitest unit tests fuer handleMapSubtopicsJob (SLC-078 MT-4).
// Mocks supabase admin client, chatWithLLM (Bedrock) und Logger.
//
// Coverage:
//   - 3 Happy-Path-Fixtures (Coverage-Pflicht-Gate SC-V5-7 ≥70% pro Fixture)
//   - Cross-Tenant-Isolation: subtopic_id liegt im Template-Set, sonst NULL
//   - Confidence-Threshold (Default 0.7): wenn LLM-confidence < threshold → subtopic_id=NULL
//   - mapping_reasoning nicht leer
//   - N=0 Edge-Case (keine Steps → direkt advance to pending_review)
//   - Skip-Pfad (status != 'mapping')
//   - Failed-Pfade: invalid UUID, no-session, Bedrock-Error, invalid-JSON, Zod-Validation
//   - Cost-Ledger Silent-Failure (IMP-371)
//   - Idempotency: DELETE existing mappings before INSERT
//   - LLM erfindet Subtopic-String → wird auf NULL gekippt
//   - buildSubtopicTree-Helper (sop_trigger-Filter + Fallback)

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ClaimedJob } from "../../condensation/claim-loop";
import {
  ALL_MAPPING_FIXTURES,
  FIXTURE_AUFTRAGSANNAHME,
  FIXTURE_ONBOARDING,
  FIXTURE_REKLAMATION,
  TEST_TEMPLATE_BLOCKS,
  TEST_TEMPLATE_ID,
  TEST_TEMPLATE_VERSION,
  TEST_VALID_SUBTOPICS,
  type MappingFixture,
} from "./fixtures/walkthrough-mappings";

// ---------------------------------------------------------------------------
// Constants + Mock-State
// ---------------------------------------------------------------------------

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const CAPTURE_SESSION_ID = "33333333-3333-3333-3333-333333333333";
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

interface DeleteRecord {
  table: string;
  matchCol: string;
  matchVal: unknown;
}

interface SessionRow {
  id: string;
  tenant_id: string;
  capture_session_id: string;
  status: string;
}

interface MockState {
  sessionRow: SessionRow | null;
  sessionLoadError: Error | null;
  stepsRows: Record<string, unknown>[];
  stepsLoadError: Error | null;
  captureRow: { id: string; template_id: string } | null;
  captureLoadError: Error | null;
  templateRow: { id: string; version: string; blocks: unknown } | null;
  templateLoadError: Error | null;
  mappingInsertError: Error | null;
  mappingInsertCount: number | null;
  costInsertError: { message: string; code?: string } | null;
  bedrockResult: string;
  bedrockError: Error | null;
  bedrockCalls: number;
  updates: UpdateRecord[];
  inserts: InsertRecord[];
  deletes: DeleteRecord[];
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  rpcError: Error | null;
  capturedExceptions: { error: unknown; metadata: unknown }[];
  capturedWarnings: { message: string; metadata: unknown }[];
  capturedInfos: { message: string; metadata: unknown }[];
}

const state: MockState = {
  sessionRow: null,
  sessionLoadError: null,
  stepsRows: [],
  stepsLoadError: null,
  captureRow: null,
  captureLoadError: null,
  templateRow: null,
  templateLoadError: null,
  mappingInsertError: null,
  mappingInsertCount: null,
  costInsertError: null,
  bedrockResult: "",
  bedrockError: null,
  bedrockCalls: 0,
  updates: [],
  inserts: [],
  deletes: [],
  rpcCalls: [],
  rpcError: null,
  capturedExceptions: [],
  capturedWarnings: [],
  capturedInfos: [],
};

// ---------------------------------------------------------------------------
// Mock-AdminClient
// ---------------------------------------------------------------------------

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
                    if (state.sessionLoadError) return { data: null, error: state.sessionLoadError };
                    return { data: state.sessionRow, error: null };
                  }
                  if (table === "capture_session") {
                    if (state.captureLoadError) return { data: null, error: state.captureLoadError };
                    return { data: state.captureRow, error: null };
                  }
                  if (table === "template") {
                    if (state.templateLoadError) return { data: null, error: state.templateLoadError };
                    return { data: state.templateRow, error: null };
                  }
                  return { data: null, error: new Error(`unmocked SELECT.eq.single ${table}`) };
                },
                is(_col2: string, _val2: unknown) {
                  return {
                    order(_col3: string, _opts: unknown) {
                      // walkthrough_step.select(...).eq(...).is(deleted_at, null).order(step_number, ...)
                      // returns Promise — collect via thenable
                      return {
                        then(
                          onFulfilled: (v: { data: unknown[]; error: Error | null }) => unknown,
                        ) {
                          if (table === "walkthrough_step") {
                            if (state.stepsLoadError) {
                              return Promise.resolve({ data: [], error: state.stepsLoadError }).then(onFulfilled);
                            }
                            return Promise.resolve({ data: state.stepsRows, error: null }).then(onFulfilled);
                          }
                          return Promise.resolve({ data: [], error: new Error(`unmocked SELECT.is.order ${table}`) }).then(onFulfilled);
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
            in(col: string, vals: unknown[]) {
              state.deletes.push({ table, matchCol: col, matchVal: vals });
              return Promise.resolve({ error: null });
            },
            async eq(col: string, val: string) {
              state.deletes.push({ table, matchCol: col, matchVal: val });
              return { error: null };
            },
          };
        },
        insert(rowOrRows: Record<string, unknown> | Record<string, unknown>[], opts?: { count?: string }) {
          const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
          state.inserts.push({ table, rows });

          if (table === "walkthrough_review_mapping" && opts?.count === "exact") {
            return {
              then(onFulfilled: (v: { error: Error | null; count: number | null }) => unknown) {
                if (state.mappingInsertError) {
                  return Promise.resolve({ error: state.mappingInsertError, count: null }).then(onFulfilled);
                }
                return Promise.resolve({ error: null, count: state.mappingInsertCount ?? rows.length }).then(onFulfilled);
              },
            };
          }

          if (table === "ai_jobs") {
            // Pipeline-Trigger setzt mapping → pending_review (kein Folge-Job),
            // also wird ai_jobs hier eigentlich nie geschrieben — defensiv aber unterstuetzen.
            return {
              select(_cols: string) {
                return { async single() { return { data: { id: "n/a" }, error: null }; } };
              },
            };
          }

          // ai_cost_ledger: Promise<{ error: ... }>
          return {
            then(onFulfilled: (v: { error: { message: string; code?: string } | null }) => unknown) {
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

// pipeline-trigger nutzt direkt das gleiche admin-mock + ai_jobs/walkthrough_session — wir lassen
// den echten Code laufen, weil er gegen das mock von supabase/admin geht.

// Import nach Mocks
const { handleMapSubtopicsJob, buildSubtopicTree } = await import("../handle-map-subtopics-job");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(payload: Record<string, unknown> = {}): ClaimedJob {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    job_type: "walkthrough_map_subtopics",
    payload: { walkthroughSessionId: SESSION_ID, ...payload },
    created_at: new Date().toISOString(),
  };
}

function defaultSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: SESSION_ID,
    tenant_id: TENANT_ID,
    capture_session_id: CAPTURE_SESSION_ID,
    status: "mapping",
    ...overrides,
  };
}

function applyFixture(fixture: MappingFixture): void {
  state.stepsRows = fixture.steps.map((s) => ({
    id: s.id,
    step_number: s.step_number,
    action: s.action,
    responsible: s.responsible,
    timeframe: s.timeframe,
  }));
  state.bedrockResult = fixture.mockBedrockOutput;
}

beforeEach(() => {
  state.sessionRow = defaultSession();
  state.sessionLoadError = null;
  state.stepsRows = [];
  state.stepsLoadError = null;
  state.captureRow = { id: CAPTURE_SESSION_ID, template_id: TEST_TEMPLATE_ID };
  state.captureLoadError = null;
  state.templateRow = { id: TEST_TEMPLATE_ID, version: TEST_TEMPLATE_VERSION, blocks: TEST_TEMPLATE_BLOCKS };
  state.templateLoadError = null;
  state.mappingInsertError = null;
  state.mappingInsertCount = null;
  state.costInsertError = null;
  state.bedrockResult = "";
  state.bedrockError = null;
  state.bedrockCalls = 0;
  state.updates = [];
  state.inserts = [];
  state.deletes = [];
  state.rpcCalls = [];
  state.rpcError = null;
  state.capturedExceptions = [];
  state.capturedWarnings = [];
  state.capturedInfos = [];
});

// ---------------------------------------------------------------------------
// Helper: Coverage-Berechnung pro Fixture
// ---------------------------------------------------------------------------

function computeCoverageQuote(rows: Record<string, unknown>[]): number {
  const total = rows.length;
  if (total === 0) return 0;
  let mappedHighConfidence = 0;
  for (const row of rows) {
    const subtopicId = row.subtopic_id;
    const score = row.confidence_score as number | null;
    if (subtopicId !== null && typeof score === "number" && score >= 0.7) {
      mappedHighConfidence += 1;
    }
  }
  return mappedHighConfidence / total;
}

// ---------------------------------------------------------------------------
// Happy path — 3 Fixtures, Pflicht-Gate SC-V5-7 ≥70% pro Fixture
// ---------------------------------------------------------------------------

describe("handleMapSubtopicsJob — happy path with 3 fixtures (SC-V5-7)", () => {
  for (const fixture of ALL_MAPPING_FIXTURES) {
    it(`maps fixture '${fixture.id}' with coverage >= 70% per-fixture`, async () => {
      applyFixture(fixture);

      await handleMapSubtopicsJob(makeJob());

      // 1. Bedrock genau einmal gerufen
      expect(state.bedrockCalls).toBe(1);

      // 2. Idempotency: DELETE vor INSERT
      const deleteCall = state.deletes.find((d) => d.table === "walkthrough_review_mapping");
      expect(deleteCall).toBeDefined();
      expect(deleteCall!.matchCol).toBe("walkthrough_step_id");

      // 3. Bulk-INSERT in walkthrough_review_mapping mit erwarteter Anzahl
      const insert = state.inserts.find((i) => i.table === "walkthrough_review_mapping");
      expect(insert).toBeDefined();
      expect(insert!.rows).toHaveLength(fixture.steps.length);

      // 4. Coverage-Pflicht-Gate SC-V5-7: ≥70% pro Fixture
      const coverage = computeCoverageQuote(insert!.rows);
      expect(coverage).toBeGreaterThanOrEqual(0.7);

      // 5. Cross-Tenant-Isolation: subtopic_id muss aus Test-Template-Set kommen oder NULL
      for (const row of insert!.rows) {
        const sid = row.subtopic_id;
        if (sid !== null) {
          expect(TEST_VALID_SUBTOPICS.has(sid as string)).toBe(true);
        }
      }

      // 6. mapping_reasoning nicht leer
      for (const row of insert!.rows) {
        expect(row.mapping_reasoning).toBeTypeOf("string");
        expect((row.mapping_reasoning as string).length).toBeGreaterThan(0);
      }

      // 7. mapping_model gesetzt
      for (const row of insert!.rows) {
        expect(row.mapping_model).toBeTypeOf("string");
        expect((row.mapping_model as string).length).toBeGreaterThan(0);
      }

      // 8. Pipeline-Trigger: status mapping → pending_review (kein Folge-Job)
      const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
      expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["pending_review"]);

      // 9. Cost-Ledger geschrieben mit role='walkthrough_subtopic_mapper'
      const costInsert = state.inserts.find((i) => i.table === "ai_cost_ledger");
      expect(costInsert).toBeDefined();
      expect(costInsert!.rows[0]).toMatchObject({
        tenant_id: TENANT_ID,
        job_id: JOB_ID,
        role: "walkthrough_subtopic_mapper",
        feature: "walkthrough_subtopic_mapping",
      });

      // 10. ai_job complete via RPC
      const rpcCompletes = state.rpcCalls.filter((c) => c.name === "rpc_complete_ai_job");
      expect(rpcCompletes).toHaveLength(1);
    });
  }
});

// ---------------------------------------------------------------------------
// Globale Coverage als Diagnose-Info ueber alle 3 Fixtures
// ---------------------------------------------------------------------------

describe("handleMapSubtopicsJob — globale Coverage ueber alle Fixtures", () => {
  it("aggregierte Coverage ueber alle 3 Fixtures liefert >=70%", async () => {
    let totalSteps = 0;
    let totalHighConfidence = 0;
    for (const fixture of ALL_MAPPING_FIXTURES) {
      // Reset state pro Fixture (beforeEach laeuft nicht zwischen for-Schleifen-Iterationen)
      state.sessionRow = defaultSession();
      state.captureRow = { id: CAPTURE_SESSION_ID, template_id: TEST_TEMPLATE_ID };
      state.templateRow = { id: TEST_TEMPLATE_ID, version: TEST_TEMPLATE_VERSION, blocks: TEST_TEMPLATE_BLOCKS };
      state.updates = [];
      state.inserts = [];
      state.deletes = [];
      state.rpcCalls = [];
      state.bedrockCalls = 0;
      applyFixture(fixture);

      await handleMapSubtopicsJob(makeJob());
      const insert = state.inserts.find((i) => i.table === "walkthrough_review_mapping");
      expect(insert).toBeDefined();
      totalSteps += insert!.rows.length;
      for (const row of insert!.rows) {
        const score = row.confidence_score as number | null;
        if (row.subtopic_id !== null && typeof score === "number" && score >= 0.7) {
          totalHighConfidence += 1;
        }
      }
    }
    const globalQuote = totalHighConfidence / totalSteps;
    expect(globalQuote).toBeGreaterThanOrEqual(0.7);
    // Diagnose-Info als Test-Output
    console.log(`[SC-V5-7 globale Coverage] ${totalHighConfidence}/${totalSteps} = ${(globalQuote * 100).toFixed(1)}%`);
  });
});

// ---------------------------------------------------------------------------
// Confidence-Threshold + Subtopic-Validation
// ---------------------------------------------------------------------------

describe("handleMapSubtopicsJob — confidence threshold + subtopic validation", () => {
  it("setzt subtopic_id auf NULL wenn LLM-confidence < 0.7 (Default-Threshold)", async () => {
    // Fixture mit hartem Below-Threshold-Mapping
    state.stepsRows = [
      { id: "aaaaaaaa-aaaa-aaaa-aaaa-000000000001", step_number: 1, action: "step1", responsible: null, timeframe: null },
    ];
    state.bedrockResult = `[
      { "step_id": "aaaaaaaa-aaaa-aaaa-aaaa-000000000001", "subtopic_id": "Block C / C1 Kernabläufe", "confidence_score": 0.6, "reasoning": "schwach" }
    ]`;

    await handleMapSubtopicsJob(makeJob());

    const insert = state.inserts.find((i) => i.table === "walkthrough_review_mapping");
    expect(insert!.rows[0].subtopic_id).toBeNull();
    // Score wird trotzdem persistiert, sodass GENERATED-Column 'red' ergibt
    expect(insert!.rows[0].confidence_score).toBe(0.6);
  });

  it("setzt subtopic_id auf NULL wenn LLM einen Subtopic erfindet (nicht im Tree)", async () => {
    state.stepsRows = [
      { id: "aaaaaaaa-aaaa-aaaa-aaaa-000000000002", step_number: 1, action: "step1", responsible: null, timeframe: null },
    ];
    state.bedrockResult = `[
      { "step_id": "aaaaaaaa-aaaa-aaaa-aaaa-000000000002", "subtopic_id": "Block X / X9 Erfunden", "confidence_score": 0.95, "reasoning": "halluziniert" }
    ]`;

    await handleMapSubtopicsJob(makeJob());

    const insert = state.inserts.find((i) => i.table === "walkthrough_review_mapping");
    expect(insert!.rows[0].subtopic_id).toBeNull();
  });

  it("ENV WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD ueberschreibt Default 0.7", async () => {
    const original = process.env.WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD;
    process.env.WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD = "0.5";
    try {
      state.stepsRows = [
        { id: "aaaaaaaa-aaaa-aaaa-aaaa-000000000003", step_number: 1, action: "step1", responsible: null, timeframe: null },
      ];
      state.bedrockResult = `[
        { "step_id": "aaaaaaaa-aaaa-aaaa-aaaa-000000000003", "subtopic_id": "Block C / C1 Kernabläufe", "confidence_score": 0.55, "reasoning": "ok" }
      ]`;

      await handleMapSubtopicsJob(makeJob());

      const insert = state.inserts.find((i) => i.table === "walkthrough_review_mapping");
      // 0.55 >= 0.5 (custom threshold) → subtopic_id bleibt gesetzt
      expect(insert!.rows[0].subtopic_id).toBe("Block C / C1 Kernabläufe");
    } finally {
      if (original === undefined) delete process.env.WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD;
      else process.env.WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD = original;
    }
  });

  it("Default-Fallback bei kaputtem ENV (NaN, ausserhalb 0..1)", async () => {
    const original = process.env.WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD;
    process.env.WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD = "abc";
    try {
      state.stepsRows = [
        { id: "aaaaaaaa-aaaa-aaaa-aaaa-000000000004", step_number: 1, action: "step1", responsible: null, timeframe: null },
      ];
      state.bedrockResult = `[
        { "step_id": "aaaaaaaa-aaaa-aaaa-aaaa-000000000004", "subtopic_id": "Block C / C1 Kernabläufe", "confidence_score": 0.65, "reasoning": "below default" }
      ]`;

      await handleMapSubtopicsJob(makeJob());

      const insert = state.inserts.find((i) => i.table === "walkthrough_review_mapping");
      // 0.65 < 0.7 (Default fallback) → subtopic_id auf NULL
      expect(insert!.rows[0].subtopic_id).toBeNull();
    } finally {
      if (original === undefined) delete process.env.WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD;
      else process.env.WALKTHROUGH_MAPPING_CONFIDENCE_THRESHOLD = original;
    }
  });
});

// ---------------------------------------------------------------------------
// N=0 Edge-Case
// ---------------------------------------------------------------------------

describe("handleMapSubtopicsJob — N=0 edge case", () => {
  it("kein Bedrock-Call bei 0 Schritten, advanced direkt zu pending_review", async () => {
    state.stepsRows = [];
    state.bedrockResult = "[]";

    await handleMapSubtopicsJob(makeJob());

    expect(state.bedrockCalls).toBe(0);
    const mappingInsert = state.inserts.find((i) => i.table === "walkthrough_review_mapping");
    expect(mappingInsert).toBeUndefined();
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toEqual(["pending_review"]);
  });
});

// ---------------------------------------------------------------------------
// Skip + Failed paths
// ---------------------------------------------------------------------------

describe("handleMapSubtopicsJob — skip + failed paths", () => {
  it("skippt wenn status != 'mapping'", async () => {
    state.sessionRow = defaultSession({ status: "extracting" });
    await handleMapSubtopicsJob(makeJob());
    expect(state.bedrockCalls).toBe(0);
    expect(state.capturedWarnings.length).toBe(1);
    const rpcCompletes = state.rpcCalls.filter((c) => c.name === "rpc_complete_ai_job");
    expect(rpcCompletes).toHaveLength(1);
  });

  it("wirft bei nicht-UUID payload", async () => {
    await expect(
      handleMapSubtopicsJob(makeJob({ walkthroughSessionId: "not-a-uuid" })),
    ).rejects.toThrow(/UUID/i);
  });

  it("wirft wenn walkthrough_session nicht gefunden", async () => {
    state.sessionRow = null;
    state.sessionLoadError = new Error("not found");
    await expect(handleMapSubtopicsJob(makeJob())).rejects.toThrow();
    // Status auf 'failed' gesetzt? Bei sessionLoadError ist die session nicht ladbar — wir laufen direkt in den
    // throw, der catch-Block wirft trotzdem ein Best-Effort-Update an die session ID, aber Mock akzeptiert es.
  });

  it("wirft bei Bedrock-Error und setzt status=failed", async () => {
    applyFixture(FIXTURE_AUFTRAGSANNAHME);
    state.bedrockError = new Error("Bedrock down");

    await expect(handleMapSubtopicsJob(makeJob())).rejects.toThrow(/Bedrock down/);
    const failedUpdate = state.updates.find(
      (u) => u.table === "walkthrough_session" && u.patch.status === "failed",
    );
    expect(failedUpdate).toBeDefined();
  });

  it("wirft bei invalid JSON von Bedrock", async () => {
    applyFixture(FIXTURE_REKLAMATION);
    state.bedrockResult = "not valid json {";
    await expect(handleMapSubtopicsJob(makeJob())).rejects.toThrow(/JSON\.parse/);
  });

  it("wirft bei Zod-Validation-Fail (fehlende Felder)", async () => {
    applyFixture(FIXTURE_AUFTRAGSANNAHME);
    state.bedrockResult = `[{ "step_id": "x", "confidence_score": 0.9 }]`;
    await expect(handleMapSubtopicsJob(makeJob())).rejects.toThrow(/Zod validation/);
  });

  it("wirft bei walkthrough_review_mapping INSERT-Fehler", async () => {
    applyFixture(FIXTURE_ONBOARDING);
    state.mappingInsertError = new Error("constraint violation");
    await expect(handleMapSubtopicsJob(makeJob())).rejects.toThrow(/constraint violation/);
  });

  it("wirft bei capture_session not found", async () => {
    applyFixture(FIXTURE_AUFTRAGSANNAHME);
    state.captureRow = null;
    state.captureLoadError = new Error("capture missing");
    await expect(handleMapSubtopicsJob(makeJob())).rejects.toThrow(/capture/i);
  });

  it("wirft bei template not found", async () => {
    applyFixture(FIXTURE_AUFTRAGSANNAHME);
    state.templateRow = null;
    state.templateLoadError = new Error("template missing");
    await expect(handleMapSubtopicsJob(makeJob())).rejects.toThrow(/template/i);
  });

  it("wirft bei leerem Subtopic-Tree", async () => {
    applyFixture(FIXTURE_AUFTRAGSANNAHME);
    state.templateRow = { id: TEST_TEMPLATE_ID, version: TEST_TEMPLATE_VERSION, blocks: [] };
    await expect(handleMapSubtopicsJob(makeJob())).rejects.toThrow(/leeren Subtopic-Tree/);
  });
});

// ---------------------------------------------------------------------------
// Cost-Ledger Silent-Failure (IMP-371)
// ---------------------------------------------------------------------------

describe("handleMapSubtopicsJob — cost ledger non-fatal", () => {
  it("loggt Warning aber bricht nicht ab wenn ai_cost_ledger INSERT failt", async () => {
    applyFixture(FIXTURE_AUFTRAGSANNAHME);
    state.costInsertError = { message: "CHECK violation", code: "23514" };

    await handleMapSubtopicsJob(makeJob());

    expect(state.capturedWarnings.length).toBeGreaterThan(0);
    const warnedCost = state.capturedWarnings.find((w) => w.message.includes("ai_cost_ledger"));
    expect(warnedCost).toBeDefined();
    // Pipeline trotzdem durchgelaufen
    const sessionUpdates = state.updates.filter((u) => u.table === "walkthrough_session");
    expect(sessionUpdates.map((u) => u.patch.status)).toContain("pending_review");
  });
});

// ---------------------------------------------------------------------------
// buildSubtopicTree Helper — sop_trigger-Filter + Fallback
// ---------------------------------------------------------------------------

describe("buildSubtopicTree", () => {
  it("filtert auf sop_trigger=true wenn vorhanden", () => {
    const tree = buildSubtopicTree([
      {
        key: "A",
        title: { de: "A" },
        questions: [
          { unterbereich: "A1 Trigger", sop_trigger: true },
          { unterbereich: "A2 Kein Trigger", sop_trigger: false },
        ],
      },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].subtopic_ids).toEqual(["A1 Trigger"]);
  });

  it("Fallback auf alle unterbereich wenn kein sop_trigger=true", () => {
    const tree = buildSubtopicTree([
      {
        key: "A",
        title: "Block A",
        questions: [
          { unterbereich: "A1", sop_trigger: false },
          { unterbereich: "A2", sop_trigger: false },
        ],
      },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].subtopic_ids.sort()).toEqual(["A1", "A2"]);
  });

  it("ignoriert leere/null unterbereich", () => {
    const tree = buildSubtopicTree([
      {
        key: "A",
        title: { de: "A" },
        questions: [
          { unterbereich: "", sop_trigger: true },
          { unterbereich: "A1", sop_trigger: true },
          { unterbereich: undefined, sop_trigger: true },
        ],
      },
    ]);
    expect(tree[0].subtopic_ids).toEqual(["A1"]);
  });

  it("dedupliziert unterbereich innerhalb eines Blocks", () => {
    const tree = buildSubtopicTree([
      {
        key: "A",
        title: { de: "A" },
        questions: [
          { unterbereich: "A1", sop_trigger: true },
          { unterbereich: "A1", sop_trigger: true },
          { unterbereich: "A2", sop_trigger: true },
        ],
      },
    ]);
    expect(tree[0].subtopic_ids.sort()).toEqual(["A1", "A2"]);
  });

  it("liefert leeres Array wenn blocks keine Liste ist", () => {
    expect(buildSubtopicTree(null)).toEqual([]);
    expect(buildSubtopicTree({})).toEqual([]);
    expect(buildSubtopicTree("not array")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// LLM-Output verschluckt einen Step → Default Unmapped + Reasoning-Hint
// ---------------------------------------------------------------------------

describe("handleMapSubtopicsJob — LLM laesst Step weg", () => {
  it("erzeugt Default-Unmapped-Row wenn LLM den Step nicht im Output hat", async () => {
    state.stepsRows = [
      { id: "aaaaaaaa-aaaa-aaaa-aaaa-000000000010", step_number: 1, action: "Step 1", responsible: null, timeframe: null },
      { id: "aaaaaaaa-aaaa-aaaa-aaaa-000000000011", step_number: 2, action: "Step 2", responsible: null, timeframe: null },
    ];
    state.bedrockResult = `[
      { "step_id": "aaaaaaaa-aaaa-aaaa-aaaa-000000000010", "subtopic_id": "Block C / C1 Kernabläufe", "confidence_score": 0.85, "reasoning": "ok" }
    ]`;

    await handleMapSubtopicsJob(makeJob());

    const insert = state.inserts.find((i) => i.table === "walkthrough_review_mapping");
    expect(insert!.rows).toHaveLength(2);
    expect(insert!.rows[0].subtopic_id).toBe("Block C / C1 Kernabläufe");
    expect(insert!.rows[1].subtopic_id).toBeNull();
    expect(insert!.rows[1].mapping_reasoning).toContain("kein");
  });
});
