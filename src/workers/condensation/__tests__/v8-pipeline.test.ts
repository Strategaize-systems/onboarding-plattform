// V8 SLC-148 MT-6 — Vitest fuer runV8MandantenReportPipeline.
//
// Mock-based Unit-Tests fuer den deterministischen V8-Worker-Branch. Validiert:
//   - Happy-Path: Snapshot wird gerechnet, metadata.v8_report_snapshot
//     additiv gemerged geschrieben, block_checkpoint INSERT, success error_log
//   - Existing-Metadata-Preserve: andere Keys in metadata werden nicht
//     ueberschrieben (fetch-merge-write Pattern)
//   - Score-Compute-Fail: leeres template-blocks-Array -> stuffenLookup fehlt
//     -> selectThreeHebel-Failure (oder Score-0 + leerer Empfehlung) — wir
//     testen den expliziten Compute-Throw via answers ohne passende blocks
//   - Update-Fail: snapshot ist gerechnet, capture_session UPDATE wirft,
//     Pipeline-Throw + failure error_log
//
// Live-DB-Verifikation (Snapshot trifft Coolify-DB, RLS-Gate korrekt) findet
// in MT-7 als Live-Smoke statt — der Mock-Test hier deckt die Pipeline-Logik.
//
// Pattern-Reuse: handle-job-branch.test.ts (V6.3 SLC-105 MT-5) — selbe
// vi.mock + fromMock/insertMock Konvention.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
}));

import { runV8MandantenReportPipeline } from "../v8-pipeline";
import type {
  V8PipelineSession,
  V8PipelineTemplate,
} from "../v8-pipeline";

// --- Fixtures ---------------------------------------------------------------

const TENANT = "11111111-1111-1111-1111-111111111111";
const SESSION = "22222222-2222-2222-2222-222222222222";
const TEMPLATE = "33333333-3333-3333-3333-333333333333";
const OWNER = "44444444-4444-4444-4444-444444444444";
const JOB = "55555555-5555-5555-5555-555555555555";

/** Minimal V8-Template-Fixture: M0 (hygiene), M1 (reife), M9 (reife doppelt
 * gewichtet), M10 (reflexion). selectThreeHebel braucht stufen_lookup fuer
 * alle 9 Module — wir geben nur s1 fuer m1/m9 und Default-leer fuer m2..m8
 * (computeModuleScores liefert 0, mapModuleScoreToStufe(0)=1).
 */
function buildV8Template(): V8PipelineTemplate {
  const stufenLookupEntry = {
    s1: { was_es_bedeutet: "Stufe 1 Bedeutung", unsere_empfehlung: "Stufe 1 Empfehlung" },
    s2: { was_es_bedeutet: "S2 B", unsere_empfehlung: "S2 E" },
    s3: { was_es_bedeutet: "S3 B", unsere_empfehlung: "S3 E" },
    s4: { was_es_bedeutet: "S4 B", unsere_empfehlung: "S4 E" },
    s5: { was_es_bedeutet: "S5 B", unsere_empfehlung: "S5 E" },
  };
  const moduleNames: Record<string, string> = {
    M1: "Geschaeftsmodell",
    M2: "Prozesse",
    M3: "Vertrieb",
    M4: "Finanzen",
    M5: "Team",
    M6: "Daten",
    M7: "IT",
    M8: "Recht",
    M9: "Strategie",
  };
  const reifeBlocks = ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9"].map(
    (id) => ({
      modul_id: id,
      name: moduleNames[id],
      answer_schema_kind: "reife_skala_5",
      score_mapping: { "1": 0, "2": 2, "3": 5, "4": 8, "5": 10 },
      questions: [
        { frage_id: `${id.toLowerCase()}_q1`, text: `${id} Frage 1?` },
        { frage_id: `${id.toLowerCase()}_q2`, text: `${id} Frage 2?` },
      ],
    }),
  );

  return {
    id: TEMPLATE,
    version: "1",
    blocks: [
      {
        modul_id: "M0",
        name: "Hygiene",
        answer_schema_kind: "hygiene_yes_partial_no",
        questions: [
          { frage_id: "m0_q1", text: "Hygiene Frage 1?" },
          { frage_id: "m0_q2", text: "Hygiene Frage 2?" },
        ],
      },
      ...reifeBlocks,
      {
        modul_id: "M10",
        name: "Reflexion",
        answer_schema_kind: "reflexion_freitext",
        questions: [
          { frage_id: "m10_q1", text: "Reflexion Frage 1?" },
          { frage_id: "m10_q2", text: "Reflexion Frage 2?" },
        ],
      },
    ],
    metadata: {
      usage_kind: "mandanten_report_teaser_v1",
      scoring_kind: "sui_weighted",
      report_renderer: "mandanten_report_v2",
      gewichtung: { m1: 10, m2: 10, m3: 10, m4: 10, m5: 10, m6: 10, m7: 10, m8: 10, m9: 20 },
      stufen_lookup: {
        m1: stufenLookupEntry,
        m2: stufenLookupEntry,
        m3: stufenLookupEntry,
        m4: stufenLookupEntry,
        m5: stufenLookupEntry,
        m6: stufenLookupEntry,
        m7: stufenLookupEntry,
        m8: stufenLookupEntry,
        m9: stufenLookupEntry,
      },
    },
  };
}

function buildSession(answers: Record<string, string>): V8PipelineSession {
  return {
    id: SESSION,
    tenant_id: TENANT,
    template_id: TEMPLATE,
    owner_user_id: OWNER,
    answers,
  };
}

interface MockAdminBuilder {
  existingMetadata?: Record<string, unknown> | null;
  fetchError?: boolean;
  updateError?: boolean;
  checkpointError?: boolean;
}

function buildMockAdminClient(opts: MockAdminBuilder = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const checkpoints: Array<Record<string, unknown>> = [];
  const errorLogs: Array<Record<string, unknown>> = [];

  const fromMock = vi.fn((table: string) => {
    if (table === "capture_session") {
      return {
        select: () => ({
          eq: () => ({
            single: async () =>
              opts.fetchError
                ? { data: null, error: { message: "synthetic-fetch-error" } }
                : { data: { metadata: opts.existingMetadata ?? {} }, error: null },
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(payload);
            return opts.updateError
              ? { error: { message: "synthetic-update-error" } }
              : { error: null };
          },
        }),
      };
    }
    if (table === "block_checkpoint") {
      return {
        insert: async (payload: Record<string, unknown>) => {
          checkpoints.push(payload);
          return opts.checkpointError
            ? { error: { message: "synthetic-checkpoint-error" } }
            : { error: null };
        },
      };
    }
    if (table === "error_log") {
      return {
        insert: async (payload: Record<string, unknown>) => {
          errorLogs.push(payload);
          return { error: null };
        },
      };
    }
    throw new Error(`unexpected from(${table})`);
  });

  return {
    client: { from: fromMock } as unknown as Parameters<
      typeof runV8MandantenReportPipeline
    >[0]["adminClient"],
    updates,
    checkpoints,
    errorLogs,
    fromMock,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Tests ------------------------------------------------------------------

describe("runV8MandantenReportPipeline — V8 SLC-148 MT-6", () => {
  it("Happy-Path: rechnet Snapshot, schreibt metadata + checkpoint + success-log", async () => {
    // Answers: alle m1..m9 = "3" -> Score 5 jeweils
    //   sui = 5*8 + 5*2 = 50, classification = teil_reife
    const answers: Record<string, string> = {
      m0_q1: "ja",
      m0_q2: "nein",
      m1_q1: "3", m1_q2: "3",
      m2_q1: "3", m2_q2: "3",
      m3_q1: "3", m3_q2: "3",
      m4_q1: "3", m4_q2: "3",
      m5_q1: "3", m5_q2: "3",
      m6_q1: "3", m6_q2: "3",
      m7_q1: "3", m7_q2: "3",
      m8_q1: "3", m8_q2: "3",
      m9_q1: "3", m9_q2: "3",
      m10_q1: "Erste Reflexion",
      m10_q2: "  ",
    };
    const mock = buildMockAdminClient();

    const result = await runV8MandantenReportPipeline({
      session: buildSession(answers),
      template: buildV8Template(),
      adminClient: mock.client,
      jobId: JOB,
    });

    // Snapshot-Felder pruefen
    expect(result.snapshot.schemaVersion).toBe(1);
    expect(result.snapshot.sui).toBe(50);
    expect(result.snapshot.classification.kind).toBe("teil_reife");
    expect(result.snapshot.moduleScores.m1).toBe(5);
    expect(result.snapshot.moduleScores.m9).toBe(5);
    expect(result.snapshot.stufenMapping.m1).toBe(3);
    expect(result.snapshot.hausaufgaben).toHaveLength(1); // m0_q2 = "nein"
    expect(result.snapshot.hausaufgaben[0].frage_id).toBe("m0_q2");
    expect(result.snapshot.reflexionen).toHaveLength(1); // m10_q1 non-empty
    expect(result.snapshot.reflexionen[0].frage_id).toBe("m10_q1");
    expect(result.snapshot.hebel).toHaveLength(3); // Tie-Break: m1, m2, m3 (alle 5)
    expect(result.snapshot.hebel[0].modul_id).toBe("m1");
    expect(result.snapshot.hebel[0].modul_name).toBe("Geschaeftsmodell");
    expect(result.snapshot.finalizedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // DB-Writes pruefen
    expect(mock.updates).toHaveLength(1);
    const update = mock.updates[0] as {
      metadata: { v8_report_snapshot: unknown };
      updated_at: string;
    };
    expect(update.metadata.v8_report_snapshot).toBeDefined();
    expect(mock.checkpoints).toHaveLength(1);
    const checkpoint = mock.checkpoints[0] as {
      tenant_id: string;
      capture_session_id: string;
      block_key: string;
      checkpoint_type: string;
      content: { snapshot: { sui: number } };
      content_hash: string;
      created_by: string;
    };
    expect(checkpoint.tenant_id).toBe(TENANT);
    expect(checkpoint.capture_session_id).toBe(SESSION);
    expect(checkpoint.block_key).toBe("v8_mandanten_report");
    expect(checkpoint.checkpoint_type).toBe("auto_final");
    expect(checkpoint.content.snapshot.sui).toBe(50);
    expect(checkpoint.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(checkpoint.created_by).toBe(OWNER);

    // Success-Log
    expect(mock.errorLogs).toHaveLength(1);
    const log = mock.errorLogs[0] as {
      level: string;
      source: string;
      message: string;
    };
    expect(log.level).toBe("info");
    expect(log.source).toBe("v8_mandanten_report_finalized");
    expect(log.message).toContain("sui=50.0");
  });

  it("Fetch-merge-write: bewahrt existierende metadata-Keys", async () => {
    const mock = buildMockAdminClient({
      existingMetadata: { someOtherKey: "preserve-me", nested: { k: 1 } },
    });

    await runV8MandantenReportPipeline({
      session: buildSession({
        m1_q1: "5", m1_q2: "5",
        m9_q1: "5", m9_q2: "5",
      }),
      template: buildV8Template(),
      adminClient: mock.client,
      jobId: JOB,
    });

    const update = mock.updates[0] as {
      metadata: Record<string, unknown>;
    };
    expect(update.metadata.someOtherKey).toBe("preserve-me");
    expect(update.metadata.nested).toEqual({ k: 1 });
    expect(update.metadata.v8_report_snapshot).toBeDefined();
  });

  it("Update-Fail: wirft + schreibt failure error_log", async () => {
    const mock = buildMockAdminClient({ updateError: true });

    await expect(
      runV8MandantenReportPipeline({
        session: buildSession({ m1_q1: "3" }),
        template: buildV8Template(),
        adminClient: mock.client,
        jobId: JOB,
      }),
    ).rejects.toThrow(/V8 snapshot UPDATE failed/);

    const failureLog = mock.errorLogs.find(
      (l) => (l as { level: string }).level === "error",
    ) as { source: string; message: string } | undefined;
    expect(failureLog).toBeDefined();
    expect(failureLog!.source).toBe("v8_mandanten_report_failed");
    expect(failureLog!.message).toContain("v8_snapshot_write_failed");
  });

  it("Fetch-Fail: wirft + schreibt failure error_log, kein UPDATE", async () => {
    const mock = buildMockAdminClient({ fetchError: true });

    await expect(
      runV8MandantenReportPipeline({
        session: buildSession({ m1_q1: "3" }),
        template: buildV8Template(),
        adminClient: mock.client,
        jobId: JOB,
      }),
    ).rejects.toThrow(/V8 metadata fetch failed/);

    expect(mock.updates).toHaveLength(0);
    const failureLog = mock.errorLogs.find(
      (l) => (l as { level: string }).level === "error",
    );
    expect(failureLog).toBeDefined();
  });

  it("Checkpoint-Fail ist nicht-fatal: Snapshot trotzdem returned, kein Throw", async () => {
    const mock = buildMockAdminClient({ checkpointError: true });

    const result = await runV8MandantenReportPipeline({
      session: buildSession({
        m1_q1: "3", m1_q2: "3",
        m9_q1: "3", m9_q2: "3",
      }),
      template: buildV8Template(),
      adminClient: mock.client,
      jobId: JOB,
    });

    expect(result.snapshot.schemaVersion).toBe(1);
    expect(mock.updates).toHaveLength(1); // UPDATE durchgefuehrt
    // Success-error_log wird trotzdem geschrieben
    const successLog = mock.errorLogs.find(
      (l) => (l as { source: string }).source === "v8_mandanten_report_finalized",
    );
    expect(successLog).toBeDefined();
  });

  it("SUI-Boundary: alle Module 10 -> sui=100, tragbar", async () => {
    const answers: Record<string, string> = {};
    for (const m of ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"]) {
      answers[`${m}_q1`] = "5";
      answers[`${m}_q2`] = "5";
    }
    const mock = buildMockAdminClient();

    const result = await runV8MandantenReportPipeline({
      session: buildSession(answers),
      template: buildV8Template(),
      adminClient: mock.client,
      jobId: JOB,
    });

    expect(result.snapshot.sui).toBe(100);
    expect(result.snapshot.classification.kind).toBe("tragbar");
  });

  it("Asymmetrie m9-Gewichtung: m1..m8=10, m9=0 -> sui=80", async () => {
    const answers: Record<string, string> = {};
    for (const m of ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"]) {
      answers[`${m}_q1`] = "5";
      answers[`${m}_q2`] = "5";
    }
    answers.m9_q1 = "1";
    answers.m9_q2 = "1";
    const mock = buildMockAdminClient();

    const result = await runV8MandantenReportPipeline({
      session: buildSession(answers),
      template: buildV8Template(),
      adminClient: mock.client,
      jobId: JOB,
    });

    expect(result.snapshot.sui).toBe(80);
    expect(result.snapshot.moduleScores.m9).toBe(0);
    // m9 hat niedrigsten Score -> Hebel-Top-1
    expect(result.snapshot.hebel[0].modul_id).toBe("m9");
  });

  it("Job-ID optional: ohne jobId laeuft die Pipeline", async () => {
    const mock = buildMockAdminClient();

    const result = await runV8MandantenReportPipeline({
      session: buildSession({
        m1_q1: "3", m1_q2: "3",
        m9_q1: "3", m9_q2: "3",
      }),
      template: buildV8Template(),
      adminClient: mock.client,
    });

    expect(result.snapshot.schemaVersion).toBe(1);
    const successLog = mock.errorLogs[0] as {
      metadata: { job_id: string | null };
    };
    expect(successLog.metadata.job_id).toBeNull();
  });
});
