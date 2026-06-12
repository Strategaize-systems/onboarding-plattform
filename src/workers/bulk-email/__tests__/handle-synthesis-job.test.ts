// V9.5 SLC-V9.5-B MT-4 — Vitest fuer executeEmailBulkSynthesis (Worker `email_bulk_synthesis`).
//
// Spec: slices/SLC-V9.5-B-synthesis-stage-backend.md (MT-4 Verification)
//
// Strategie: Dependency-Injection wie handle-pattern-extraction-job.test.ts.
//   - deps.synthesizer ersetzt den Bedrock-Call
//   - deps.costStore mockt total_cost_eur
//   - admin.ts + logger via vi.mock weggespart
//
// Coverage:
//   1. Payload missing bulk_run_id / non-UUID → throw
//   2. Bulk-Run not-found → throw
//   3. Status-Skip (status != 'pattern_extracted') → skip + complete, kein synthesizing
//   4. Idempotenz (existing units) → skip + complete, kein synthesizing
//   5. Happy Path: 3 Patterns/1 Section → 1 Call → 1 Unit (evidence=3) + 3 _source + synthesized
//   6. evidence<2 Filter: Unit mit 1 validem source → verworfen, 0 Units, synthesized
//   7. Partition: 2 Sections → 2 Synthese-Calls
//   8. Provenance-Rekonziliation: halluzinierte source_pattern_id wird gefiltert
//   9. Cost-Cap-Exceeded → status='failed', kein Persist, complete
//  10. Keine Patterns → synthesized, 0 Inserts
//  11. ai_cost_ledger INSERT-Fail ist non-fatal
//  12. SonnetSchemaError auf einer Section → skip Section, andere laufen weiter

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
  executeEmailBulkSynthesis,
  selectSurvivingUnits,
  type SectionSynthesizer,
  type UnitCritic,
} from "../handle-synthesis-job";
import { SonnetSchemaError } from "../../../lib/ai/bedrock-sonnet/email-synthesis";
import type {
  CriticInputUnit,
  CriticVerdicts,
  SynthesisResult,
} from "../../../lib/ai/bedrock-sonnet";
import type { CostCapStore } from "../../../lib/bulk-email/cost-cap";
import type { ClaimedJob } from "../../condensation/claim-loop";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const BULK_RUN_ID = "22222222-2222-2222-2222-222222222222";
const JOB_ID = "33333333-3333-3333-3333-333333333333";
const P1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const P3 = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function makeJob(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    job_type: "email_bulk_synthesis",
    payload: { bulk_run_id: BULK_RUN_ID },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

interface PatternStub {
  id: string;
  title: string;
  description: string;
  evidence_snippets: string[] | null;
  themes: string[] | null;
  confidence: number;
  suggested_section: string | null;
  thread_id: string;
}

function pat(id: string, section: string | null, thread: string): PatternStub {
  return {
    id,
    title: `T-${id.slice(0, 4)}`,
    description: `D-${id.slice(0, 4)}`,
    evidence_snippets: [`snip-${id.slice(0, 4)}`],
    themes: ["theme"],
    confidence: 0.8,
    suggested_section: section,
    thread_id: thread,
  };
}

interface AdminStubOptions {
  bulkRun?: { id: string; tenant_id: string; status: string; synthesis_cost_eur: number | null } | null;
  loadError?: { message: string } | null;
  existingUnitCount?: number;
  patterns?: PatternStub[];
  patternsError?: { message: string } | null;
  unitInsertError?: { message: string } | null;
  sourceInsertError?: { message: string } | null;
  ledgerError?: { message: string } | null;
}

interface InsertCall {
  table: string;
  rows: Record<string, unknown> | Record<string, unknown>[];
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
}
interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}
interface AdminState {
  inserts: InsertCall[];
  updates: UpdateCall[];
  rpcs: RpcCall[];
}

function makeAdminStub(opts: AdminStubOptions): {
  client: unknown;
  state: AdminState;
} {
  const state: AdminState = { inserts: [], updates: [], rpcs: [] };
  let unitSeq = 0;

  const client = {
    from(table: string) {
      return {
        select(_cols: string, selOpts?: { head?: boolean; count?: string }) {
          return {
            eq(_col: string, _val: unknown) {
              // (a) email_bulk_run.select.eq.single() → bulkRun row
              // (b) email_synthesized_unit count (head:true) → { count }
              // (c) email_pattern.select.eq → thenable { data: patterns }
              const isHeadCount = selOpts?.head === true;
              return {
                async single() {
                  if (table === "email_bulk_run") {
                    if (opts.loadError) return { data: null, error: opts.loadError };
                    if (!opts.bulkRun) return { data: null, error: { message: "no row" } };
                    return { data: opts.bulkRun, error: null };
                  }
                  return { data: null, error: { message: `unexpected single on ${table}` } };
                },
                then(onfulfilled: (v: unknown) => unknown) {
                  if (table === "email_synthesized_unit" && isHeadCount) {
                    return Promise.resolve({
                      count: opts.existingUnitCount ?? 0,
                      error: null,
                    }).then(onfulfilled);
                  }
                  if (table === "email_pattern") {
                    return Promise.resolve({
                      data: opts.patterns ?? [],
                      error: opts.patternsError ?? null,
                    }).then(onfulfilled);
                  }
                  return Promise.resolve({
                    data: null,
                    error: { message: `unexpected select.eq on ${table}` },
                  }).then(onfulfilled);
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(_col: string, _val: unknown) {
              state.updates.push({ table, patch });
              return { error: null };
            },
          };
        },
        insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
          state.inserts.push({ table, rows });
          // email_synthesized_unit.insert(...).select("id").single()
          return {
            select(_c: string) {
              return {
                async single() {
                  if (opts.unitInsertError) {
                    return { data: null, error: opts.unitInsertError };
                  }
                  unitSeq += 1;
                  return { data: { id: `unit-${unitSeq}` }, error: null };
                },
              };
            },
            then(onfulfilled: (v: unknown) => unknown) {
              if (table === "ai_cost_ledger") {
                return Promise.resolve({ error: opts.ledgerError ?? null }).then(onfulfilled);
              }
              if (table === "email_synthesized_unit_source") {
                return Promise.resolve({ error: opts.sourceInsertError ?? null }).then(onfulfilled);
              }
              return Promise.resolve({ error: null }).then(onfulfilled);
            },
          };
        },
      };
    },
    async rpc(name: string, args: Record<string, unknown>) {
      state.rpcs.push({ name, args });
      return { error: null };
    },
  };

  return { client, state };
}

function makeSynthesizer(
  resultsBySection: Record<string, SynthesisResult | (() => SynthesisResult) | Error>,
  costUsd = 0.01,
): SectionSynthesizer {
  return async (section, _patterns) => {
    const r = resultsBySection[section];
    if (r instanceof Error) throw r;
    if (r === undefined) throw new Error(`test bug: no fixture for section ${section}`);
    const data = typeof r === "function" ? r() : r;
    return {
      data,
      tokensIn: 100,
      tokensOut: 50,
      costUsd,
      latencyMs: 120,
      modelId: "eu.anthropic.claude-sonnet-4-20250514-v1:0",
      region: "eu-central-1",
    };
  };
}

// ─── Critic-Stubs (SLC-V9.5-C MT-2) ──────────────────────────────────────────

interface CriticStub {
  critic: UnitCritic;
  calls: CriticInputUnit[][];
}

/** Critic-Stub mit festen Verdicts (oder Error). Trackt Calls (Bounded-Assertion). */
function makeCritic(
  verdictsOrFn:
    | CriticVerdicts["verdicts"]
    | ((units: CriticInputUnit[]) => CriticVerdicts["verdicts"])
    | Error,
  costUsd = 0.005,
): CriticStub {
  const calls: CriticInputUnit[][] = [];
  const critic: UnitCritic = async (units) => {
    calls.push(units);
    if (verdictsOrFn instanceof Error) throw verdictsOrFn;
    const verdicts =
      typeof verdictsOrFn === "function" ? verdictsOrFn(units) : verdictsOrFn;
    return {
      data: { verdicts },
      tokensIn: 80,
      tokensOut: 20,
      costUsd,
      latencyMs: 15,
      modelId: "eu.anthropic.claude-sonnet-4-20250514-v1:0",
      region: "eu-central-1",
    };
  };
  return { critic, calls };
}

/** KEEP-alles-Critic fuer Tests, deren Fokus nicht der Critic ist. */
function keepAllCritic(): CriticStub {
  return makeCritic((units) =>
    units.map((_, idx) => ({
      unit_ref: idx,
      verdict: "KEEP" as const,
      reason: "ok",
    })),
  );
}

function makeCostStore(totalEurSeq: number[] | number = 0): CostCapStore {
  let i = 0;
  return {
    async getTenantMonthCostEur() {
      return 0;
    },
    async getRunPatternExtractionCostEur() {
      return 0;
    },
    async getRunTotalCostEur() {
      if (Array.isArray(totalEurSeq)) {
        const v = totalEurSeq[Math.min(i, totalEurSeq.length - 1)];
        i += 1;
        return v;
      }
      return totalEurSeq;
    },
  };
}

function runningBulkRun(status = "pattern_extracted") {
  return { id: BULK_RUN_ID, tenant_id: TENANT_ID, status, synthesis_cost_eur: 0 };
}

function oneUnitResult(section: string, sourceIds: string[], snippetCount = 2): SynthesisResult {
  return {
    units: [
      {
        title: "Konsolidierte Unit",
        description: "Thread-agnostische Beschreibung.",
        themes: ["t"],
        suggested_section: section,
        source_pattern_ids: sourceIds,
        evidence_count: sourceIds.length,
        evidence_snippets: sourceIds.slice(0, snippetCount).map((id) => ({
          text: `snippet ${id.slice(0, 4)}`,
          source_pattern_id: id,
        })),
        aggregated_confidence: 0.85,
      },
    ],
  };
}

describe("executeEmailBulkSynthesis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(1) throws on missing / non-UUID bulk_run_id", async () => {
    const { client } = makeAdminStub({});
    await expect(
      executeEmailBulkSynthesis(makeJob({ payload: {} }), {
        adminClient: client as never,
        synthesizer: makeSynthesizer({}),
        critic: keepAllCritic().critic,
      costStore: makeCostStore(),
      }),
    ).rejects.toThrow(/bulk_run_id missing or not a UUID/);

    await expect(
      executeEmailBulkSynthesis(makeJob({ payload: { bulk_run_id: "not-a-uuid" } }), {
        adminClient: client as never,
        synthesizer: makeSynthesizer({}),
        critic: keepAllCritic().critic,
      costStore: makeCostStore(),
      }),
    ).rejects.toThrow(/not a UUID/);
  });

  it("(2) throws when bulk_run not found", async () => {
    const { client } = makeAdminStub({ bulkRun: null });
    await expect(
      executeEmailBulkSynthesis(makeJob(), {
        adminClient: client as never,
        synthesizer: makeSynthesizer({}),
        critic: keepAllCritic().critic,
      costStore: makeCostStore(),
      }),
    ).rejects.toThrow(/not found/);
  });

  it("(3) status-skip when status != pattern_extracted (no synthesizing, completes job)", async () => {
    const { client, state } = makeAdminStub({ bulkRun: runningBulkRun("curating") });
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({}),
      critic: keepAllCritic().critic,
      costStore: makeCostStore(),
    });
    expect(state.updates.find((u) => u.patch.status === "synthesizing")).toBeUndefined();
    expect(state.rpcs.map((r) => r.name)).toContain("rpc_complete_ai_job");
    expect(state.inserts).toHaveLength(0);
  });

  it("(4) idempotent skip when units already exist", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: runningBulkRun(),
      existingUnitCount: 5,
    });
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({}),
      critic: keepAllCritic().critic,
      costStore: makeCostStore(),
    });
    expect(state.updates.find((u) => u.patch.status === "synthesizing")).toBeUndefined();
    expect(state.rpcs.map((r) => r.name)).toContain("rpc_complete_ai_job");
    expect(state.inserts.filter((i) => i.table === "email_synthesized_unit")).toHaveLength(0);
  });

  it("(5) happy path: 3 patterns/1 section → 1 unit (evidence=3) + 3 source rows + synthesized", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: runningBulkRun(),
      patterns: [
        pat(P1, "lieferung/zeiten", "t-a"),
        pat(P2, "lieferung/zeiten", "t-b"),
        pat(P3, "lieferung/zeiten", "t-c"),
      ],
    });
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({
        "lieferung/zeiten": oneUnitResult("lieferung/zeiten", [P1, P2, P3]),
      }),
      critic: keepAllCritic().critic,
      costStore: makeCostStore(0),
    });

    const unitInserts = state.inserts.filter((i) => i.table === "email_synthesized_unit");
    expect(unitInserts).toHaveLength(1);
    const unitRow = unitInserts[0].rows as Record<string, unknown>;
    expect(unitRow.evidence_count).toBe(3);
    expect((unitRow.source_pattern_ids as string[]).sort()).toEqual([P1, P2, P3].sort());

    const sourceInserts = state.inserts.filter((i) => i.table === "email_synthesized_unit_source");
    expect(sourceInserts).toHaveLength(1);
    expect((sourceInserts[0].rows as unknown[]).length).toBe(3);

    expect(state.updates.find((u) => u.patch.status === "synthesizing")).toBeDefined();
    expect(state.updates.find((u) => u.patch.status === "synthesized")).toBeDefined();
    // 2 Ledger-Rows: 1x Synthese (email_bulk_synthesis) + 1x Critic (email_bulk_critic).
    const ledgerInserts = state.inserts.filter((i) => i.table === "ai_cost_ledger");
    expect(ledgerInserts).toHaveLength(2);
    expect(
      ledgerInserts.map((i) => (i.rows as Record<string, unknown>).role).sort(),
    ).toEqual(["email_bulk_critic", "email_bulk_synthesis"]);
    expect(state.rpcs.map((r) => r.name)).toContain("rpc_complete_ai_job");
  });

  it("(6) evidence<2 filter: unit with single valid source is dropped (0 units), still synthesized", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: runningBulkRun(),
      patterns: [pat(P1, "sec/a", "t-a"), pat(P2, "sec/a", "t-b")],
    });
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({
        "sec/a": oneUnitResult("sec/a", [P1]), // only 1 source → evidence 1
      }),
      critic: keepAllCritic().critic,
      costStore: makeCostStore(0),
    });
    expect(state.inserts.filter((i) => i.table === "email_synthesized_unit")).toHaveLength(0);
    expect(state.updates.find((u) => u.patch.status === "synthesized")).toBeDefined();
  });

  it("(7) partition: patterns in 2 sections → 2 synthesizer calls", async () => {
    const calledSections: string[] = [];
    const synthesizer: SectionSynthesizer = async (section) => {
      calledSections.push(section);
      return {
        data: oneUnitResult(section, [P1, P2]),
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.001,
        latencyMs: 10,
        modelId: "m",
        region: "eu-central-1",
      };
    };
    const { client } = makeAdminStub({
      bulkRun: runningBulkRun(),
      patterns: [
        pat(P1, "sec/a", "t-a"),
        pat(P2, "sec/a", "t-b"),
        pat(P3, "sec/b", "t-c"),
      ],
    });
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer,
      critic: keepAllCritic().critic,
      costStore: makeCostStore(0),
    });
    expect(calledSections.sort()).toEqual(["sec/a", "sec/b"]);
  });

  it("(8) provenance reconciliation: hallucinated source id is filtered out", async () => {
    const HALLUCINATED = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const { client, state } = makeAdminStub({
      bulkRun: runningBulkRun(),
      patterns: [pat(P1, "sec/a", "t-a"), pat(P2, "sec/a", "t-b")],
    });
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({
        "sec/a": oneUnitResult("sec/a", [P1, P2, HALLUCINATED]),
      }),
      critic: keepAllCritic().critic,
      costStore: makeCostStore(0),
    });
    const unitRow = state.inserts.find((i) => i.table === "email_synthesized_unit")!
      .rows as Record<string, unknown>;
    expect(unitRow.evidence_count).toBe(2); // hallucinated dropped
    expect((unitRow.source_pattern_ids as string[]).sort()).toEqual([P1, P2].sort());
  });

  it("(9) cost-cap exceeded → status=failed, no unit persist, completes", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: runningBulkRun(),
      patterns: [pat(P1, "sec/a", "t-a"), pat(P2, "sec/a", "t-b")],
    });
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({ "sec/a": oneUnitResult("sec/a", [P1, P2]) }),
      critic: keepAllCritic().critic,
      costStore: makeCostStore(999), // total cost over cap
      runCapEur: 20,
    });
    expect(state.updates.find((u) => u.patch.status === "failed")).toBeDefined();
    expect(state.inserts.filter((i) => i.table === "email_synthesized_unit")).toHaveLength(0);
    expect(state.rpcs.map((r) => r.name)).toContain("rpc_complete_ai_job");
  });

  it("(10) no patterns → synthesized, 0 inserts", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: runningBulkRun(),
      patterns: [],
    });
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({}),
      critic: keepAllCritic().critic,
      costStore: makeCostStore(0),
    });
    expect(state.updates.find((u) => u.patch.status === "synthesized")).toBeDefined();
    expect(state.inserts).toHaveLength(0);
    expect(state.rpcs.map((r) => r.name)).toContain("rpc_complete_ai_job");
  });

  it("(11) ai_cost_ledger insert failure is non-fatal", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: runningBulkRun(),
      patterns: [pat(P1, "sec/a", "t-a"), pat(P2, "sec/a", "t-b")],
      ledgerError: { message: "ledger down" },
    });
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({ "sec/a": oneUnitResult("sec/a", [P1, P2]) }),
      critic: keepAllCritic().critic,
      costStore: makeCostStore(0),
    });
    // still synthesized + unit inserted
    expect(state.updates.find((u) => u.patch.status === "synthesized")).toBeDefined();
    expect(state.inserts.filter((i) => i.table === "email_synthesized_unit")).toHaveLength(1);
  });

  it("(12) SonnetSchemaError on one section skips it; other section still synthesizes", async () => {
    const { client, state } = makeAdminStub({
      bulkRun: runningBulkRun(),
      patterns: [
        pat(P1, "sec/good", "t-a"),
        pat(P2, "sec/good", "t-b"),
        pat(P3, "sec/bad", "t-c"),
      ],
    });
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({
        "sec/good": oneUnitResult("sec/good", [P1, P2]),
        "sec/bad": new SonnetSchemaError("drift", "raw", null),
      }),
      critic: keepAllCritic().critic,
      costStore: makeCostStore(0),
    });
    expect(state.updates.find((u) => u.patch.status === "synthesized")).toBeDefined();
    expect(state.inserts.filter((i) => i.table === "email_synthesized_unit")).toHaveLength(1);
  });
});

describe("selectSurvivingUnits (filter-hook, DEC-216 / AC-C-2)", () => {
  const mk = (evidenceCount: number) => ({
    unit: {} as never,
    evidenceCount,
    sourceRows: [],
  });

  it("without verdicts: keeps units with evidence_count >= 2", () => {
    const result = selectSurvivingUnits([mk(1), mk(2), mk(3)]);
    expect(result.map((r) => r.evidenceCount)).toEqual([2, 3]);
  });

  it("Critic verdict REJECT removes a unit even with sufficient evidence", () => {
    const verdicts = new Map<number, "KEEP" | "REJECT">([
      [0, "KEEP"],
      [1, "REJECT"],
      [2, "KEEP"],
    ]);
    const result = selectSurvivingUnits([mk(2), mk(3), mk(4)], verdicts);
    expect(result.map((r) => r.evidenceCount)).toEqual([2, 4]); // idx 1 (evidence 3) rejected
  });

  it("survives gdw KEEP && evidence>=2: KEEP+evidence<2 and missing verdict both drop", () => {
    const verdicts = new Map<number, "KEEP" | "REJECT">([
      [0, "KEEP"], // evidence 1 → drop (evidence filter)
      [1, "KEEP"], // evidence 2 → survive
      // idx 2: kein Verdict (Modell hat Unit ausgelassen) → drop (strict, AC-C-2)
    ]);
    const result = selectSurvivingUnits([mk(1), mk(2), mk(5)], verdicts);
    expect(result.map((r) => r.evidenceCount)).toEqual([2]);
  });
});

// ─── SLC-V9.5-C MT-2 — Critic-Gate im Worker (AC-C-1..4) ─────────────────────

/** SynthesisResult mit n Units (eine pro source-id-Liste) in einer Section. */
function multiUnitResult(section: string, sourceIdLists: string[][]): SynthesisResult {
  return {
    units: sourceIdLists.map((ids, i) => ({
      title: `Unit ${i}`,
      description: `Beschreibung ${i}.`,
      themes: ["t"],
      suggested_section: section,
      source_pattern_ids: ids,
      evidence_count: ids.length,
      evidence_snippets: ids.slice(0, 2).map((id) => ({
        text: `snippet ${id.slice(0, 4)}`,
        source_pattern_id: id,
      })),
      aggregated_confidence: 0.8,
    })),
  };
}

describe("executeEmailBulkSynthesis — critic gate (SLC-V9.5-C MT-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function threePatternStub() {
    return makeAdminStub({
      bulkRun: runningBulkRun(),
      patterns: [
        pat(P1, "sec/a", "t-a"),
        pat(P2, "sec/a", "t-b"),
        pat(P3, "sec/a", "t-c"),
      ],
    });
  }

  it("(C1 / AC-C-1+2) fixture: 4 drafts, critic REJECTs 1, 1 has evidence<2 → 2 survive", async () => {
    const { client, state } = threePatternStub();
    // Drafts: ev [2, 3, 2, 1]
    const result = multiUnitResult("sec/a", [
      [P1, P2],
      [P1, P2, P3],
      [P2, P3],
      [P1],
    ]);
    const criticStub = makeCritic([
      { unit_ref: 0, verdict: "KEEP", reason: "belegt" },
      { unit_ref: 1, verdict: "REJECT", reason: "redundant zu unit_ref 0" },
      { unit_ref: 2, verdict: "KEEP", reason: "belegt" },
      { unit_ref: 3, verdict: "KEEP", reason: "ok, aber nur 1 Beleg" },
    ]);
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({ "sec/a": result }),
      critic: criticStub.critic,
      costStore: makeCostStore(0),
    });

    // Reduktions-Quote: 4 Drafts → 2 Survivors (1 Critic-REJECT, 1 evidence<2).
    const unitInserts = state.inserts.filter((i) => i.table === "email_synthesized_unit");
    expect(unitInserts).toHaveLength(2);
    const titles = unitInserts.map((i) => (i.rows as Record<string, unknown>).title);
    expect(titles.sort()).toEqual(["Unit 0", "Unit 2"]);
    expect(state.updates.find((u) => u.patch.status === "synthesized")).toBeDefined();
    // Critic sah alle 4 Drafts mit rekonziliierter evidence_count.
    expect(criticStub.calls).toHaveLength(1);
    expect(criticStub.calls[0]).toHaveLength(4);
    expect(criticStub.calls[0].map((u) => u.evidence_count)).toEqual([2, 3, 2, 1]);
  });

  it("(C2 / AC-C-4) bounded: 2 sections → 2 synthesizer calls but exactly 1 critic call", async () => {
    const { client } = makeAdminStub({
      bulkRun: runningBulkRun(),
      patterns: [
        pat(P1, "sec/a", "t-a"),
        pat(P2, "sec/a", "t-b"),
        pat(P3, "sec/b", "t-c"),
      ],
    });
    const criticStub = keepAllCritic();
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({
        "sec/a": oneUnitResult("sec/a", [P1, P2]),
        "sec/b": oneUnitResult("sec/b", [P1, P3]),
      }),
      critic: criticStub.critic,
      costStore: makeCostStore(0),
    });
    expect(criticStub.calls).toHaveLength(1);
    // Der eine Call enthaelt die Drafts BEIDER Sections.
    expect(criticStub.calls[0]).toHaveLength(2);
  });

  it("(C3 / AC-C-3) critic cost: ledger row role=email_bulk_critic with job_id, synthesis_cost_eur updated", async () => {
    const { client, state } = threePatternStub();
    const criticStub = keepAllCritic();
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer(
        { "sec/a": oneUnitResult("sec/a", [P1, P2, P3]) },
        0.01,
      ),
      critic: criticStub.critic,
      costStore: makeCostStore(0),
    });

    const criticLedger = state.inserts.find(
      (i) =>
        i.table === "ai_cost_ledger" &&
        (i.rows as Record<string, unknown>).role === "email_bulk_critic",
    );
    expect(criticLedger).toBeDefined();
    const row = criticLedger!.rows as Record<string, unknown>;
    expect(row.job_id).toBe(JOB_ID);
    expect(row.tenant_id).toBe(TENANT_ID);
    expect(row.usd_cost).toBeGreaterThan(0);

    // synthesis_cost_eur wurde 2x akkumuliert: 1x Synthese-Section + 1x Critic.
    const costUpdates = state.updates.filter(
      (u) => u.table === "email_bulk_run" && "synthesis_cost_eur" in u.patch,
    );
    expect(costUpdates).toHaveLength(2);
    const last = costUpdates[costUpdates.length - 1].patch
      .synthesis_cost_eur as number;
    const first = costUpdates[0].patch.synthesis_cost_eur as number;
    expect(last).toBeGreaterThan(first); // Critic-Cost kam oben drauf
  });

  it("(C4 / AC-C-4, R-C-2) cap-hit after critic, before persist → status=failed, 0 units", async () => {
    const { client, state } = threePatternStub();
    const criticStub = keepAllCritic();
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({ "sec/a": oneUnitResult("sec/a", [P1, P2, P3]) }),
      critic: criticStub.critic,
      // 1. Cap-Check (per-Section) unter Cap, 2. Cap-Check (post-Critic) drueber.
      costStore: makeCostStore([0, 999]),
      runCapEur: 20,
    });
    expect(criticStub.calls).toHaveLength(1);
    expect(state.updates.find((u) => u.patch.status === "failed")).toBeDefined();
    expect(state.inserts.filter((i) => i.table === "email_synthesized_unit")).toHaveLength(0);
    expect(state.rpcs.map((r) => r.name)).toContain("rpc_complete_ai_job");
  });

  it("(C5 / R-C-2) critic SonnetSchemaError → run failed, no persist of un-critiqued units", async () => {
    const { client, state } = threePatternStub();
    const criticStub = makeCritic(new SonnetSchemaError("critic drift", "raw", null));
    await expect(
      executeEmailBulkSynthesis(makeJob(), {
        adminClient: client as never,
        synthesizer: makeSynthesizer({ "sec/a": oneUnitResult("sec/a", [P1, P2, P3]) }),
        critic: criticStub.critic,
        costStore: makeCostStore(0),
      }),
    ).rejects.toBeInstanceOf(SonnetSchemaError);
    expect(state.updates.find((u) => u.patch.status === "failed")).toBeDefined();
    expect(state.inserts.filter((i) => i.table === "email_synthesized_unit")).toHaveLength(0);
  });

  it("(C6) zero drafts (all sections schema-drift) → critic NOT called, run synthesized", async () => {
    const { client, state } = threePatternStub();
    const criticStub = keepAllCritic();
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({
        "sec/a": new SonnetSchemaError("drift", "raw", null),
      }),
      critic: criticStub.critic,
      costStore: makeCostStore(0),
    });
    expect(criticStub.calls).toHaveLength(0);
    expect(state.updates.find((u) => u.patch.status === "synthesized")).toBeDefined();
    expect(state.inserts.filter((i) => i.table === "email_synthesized_unit")).toHaveLength(0);
  });

  it("(C7 / AC-C-2 strict) missing verdict for a draft → unit dropped", async () => {
    const { client, state } = threePatternStub();
    // 2 Drafts (beide evidence 2+), Critic liefert nur fuer Index 0 ein Verdict.
    const criticStub = makeCritic([
      { unit_ref: 0, verdict: "KEEP", reason: "belegt" },
    ]);
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({
        "sec/a": multiUnitResult("sec/a", [
          [P1, P2],
          [P2, P3],
        ]),
      }),
      critic: criticStub.critic,
      costStore: makeCostStore(0),
    });
    const unitInserts = state.inserts.filter((i) => i.table === "email_synthesized_unit");
    expect(unitInserts).toHaveLength(1);
    expect((unitInserts[0].rows as Record<string, unknown>).title).toBe("Unit 0");
  });

  it("(C8) out-of-range unit_ref is ignored; valid verdicts still apply", async () => {
    const { client, state } = threePatternStub();
    const criticStub = makeCritic([
      { unit_ref: 0, verdict: "KEEP", reason: "belegt" },
      { unit_ref: 99, verdict: "REJECT", reason: "halluzinierter Index" },
    ]);
    await executeEmailBulkSynthesis(makeJob(), {
      adminClient: client as never,
      synthesizer: makeSynthesizer({
        "sec/a": multiUnitResult("sec/a", [[P1, P2]]),
      }),
      critic: criticStub.critic,
      costStore: makeCostStore(0),
    });
    const unitInserts = state.inserts.filter((i) => i.table === "email_synthesized_unit");
    expect(unitInserts).toHaveLength(1);
    expect(state.updates.find((u) => u.patch.status === "synthesized")).toBeDefined();
  });
});
