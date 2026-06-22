// V10 SLC-174 MT-3 — Vitest fuer executeModuleOutputJob (Worker `module_output_synthesis`).
//
// Strategie: Dependency-Injection (synthesizer/critic/costStore) + chainable
// Admin-Client-Stub. Kein Bedrock, keine echte DB.
//
// Coverage:
//   1. Payload ohne capture_session_id / non-UUID -> throw
//   2. Ungueltiger modul_key -> throw
//   3. Session not-found -> throw
//   4. Idempotenz (existing outputs) -> complete, kein Draft, kein Insert
//   5. Happy Path: Draft+Critic je 1 Call, 2 ai_cost_ledger, modul_output-Insert
//      (Triple + ki_hebel mit Katalog-Reifegrad), complete
//   6. Keine Antworten -> throw + Cleanup-Delete, kein Draft
//   7. Tenant-Monatscap exceeded -> throw, kein Draft, Cleanup-Delete
//   8. Run-Cap exceeded nach Draft -> throw, kein Insert, Cleanup-Delete
//   9. modul_key-Mismatch Template vs. Payload -> throw

import { describe, it, expect, vi } from "vitest";

vi.mock("../../../lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
  captureWarning: vi.fn(),
}));
vi.mock("../../../lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

import {
  executeModuleOutputJob,
  type HandleModuleOutputDeps,
  type ModuleSynthesizer,
  type ModuleCritic,
} from "../handle-module-output-job";
import type { ModuleDraft } from "../../../lib/stb-vertikale/synthesis-prompt";
import type { ModuleCallResult } from "../../../lib/stb-vertikale/synthesize-module-output";
import type { ClaimedJob } from "../../condensation/claim-loop";

const TENANT = "11111111-1111-1111-1111-111111111111";
const SESSION = "22222222-2222-2222-2222-222222222222";
const JOB = "33333333-3333-3333-3333-333333333333";
const TEMPLATE = "44444444-4444-4444-4444-444444444444";
const CP1 = "55555555-5555-5555-5555-555555555555";
const Q1 = "66666666-6666-6666-6666-666666666666";

function makeJob(payload: Record<string, unknown>): ClaimedJob {
  return {
    id: JOB,
    tenant_id: TENANT,
    job_type: "module_output_synthesis",
    payload,
    created_at: new Date().toISOString(),
  };
}

const TEMPLATE_ROW = {
  name: "M-04",
  description: "",
  blocks: [
    {
      id: "b1",
      key: "stufe1_kern",
      title: { de: "Kern" },
      order: 1,
      required: true,
      weight: 1,
      questions: [
        {
          id: Q1,
          frage_id: "F-M04-001",
          text: "Frage?",
          ebene: "Kern",
          unterbereich: "D1",
          position: 1,
        },
      ],
    },
  ],
  metadata: {
    modul_key: "m04",
    output_contract: { kinds: ["entscheidung"], ki_hebel_kind: "ki_hebel", reifegrad_range: [1, 4] },
    themenmodell: [],
    ki_hebel: [
      { hebel_id: "H-M04-001", name: "Autokommentar", beschreibung: "", reifegrad: 2, referenz: "" },
    ],
  },
};

interface StubOpts {
  session?: Record<string, unknown> | null;
  sessionError?: { message: string } | null;
  existingCount?: number;
  template?: Record<string, unknown> | null;
  checkpoints?: Array<{ id: string; block_key: string; content: unknown; created_at: string }>;
}

interface State {
  inserts: Array<{ table: string; rows: unknown }>;
  deletes: Array<{ table: string; col: string; val: unknown }>;
  rpcs: Array<{ name: string; args: unknown }>;
}

function makeAdmin(opts: StubOpts): { client: unknown; state: State } {
  const state: State = { inserts: [], deletes: [], rpcs: [] };

  function builder(table: string) {
    const b: Record<string, unknown> & {
      _head: boolean;
      _op: string;
    } = { _head: false, _op: "select" };
    const resolve = () => {
      if (b._op === "insert") return { error: null };
      if (b._op === "delete") return { error: null };
      if (table === "capture_session") return { data: opts.session ?? null, error: opts.sessionError ?? null };
      if (table === "template") return { data: opts.template ?? null, error: null };
      if (table === "modul_output" && b._head) return { count: opts.existingCount ?? 0, error: null };
      if (table === "block_checkpoint") return { data: opts.checkpoints ?? [], error: null };
      return { data: null, error: { message: `unexpected ${table}` } };
    };
    b.select = (_c: string, o?: { head?: boolean }) => {
      if (o?.head) b._head = true;
      return b;
    };
    b.eq = () => b;
    b.in = () => b;
    b.gte = () => b;
    b.order = () => b;
    b.single = async () => resolve();
    b.maybeSingle = async () => resolve();
    b.then = (cb: (v: unknown) => unknown) => Promise.resolve(resolve()).then(cb);
    b.insert = (rows: unknown) => {
      b._op = "insert";
      state.inserts.push({ table, rows });
      return b;
    };
    b.delete = () => {
      b._op = "delete";
      return {
        eq: (col: string, val: unknown) => {
          state.deletes.push({ table, col, val });
          return Promise.resolve({ error: null });
        },
      };
    };
    return b;
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: async (name: string, args: unknown) => {
      state.rpcs.push({ name, args });
      return { error: null };
    },
  };
  return { client, state };
}

function callResult(data: ModuleDraft, costUsd = 0.001): ModuleCallResult<ModuleDraft> {
  return {
    data,
    rawText: "{}",
    tokensIn: 100,
    tokensOut: 50,
    costUsd,
    latencyMs: 50,
    modelId: "eu.anthropic.claude-sonnet-4-20250514-v1:0",
    region: "eu-central-1",
  };
}

function deps(
  client: unknown,
  over: Partial<HandleModuleOutputDeps> = {},
): HandleModuleOutputDeps {
  return {
    adminClient: client as HandleModuleOutputDeps["adminClient"],
    costStore: { getTenantMonthCostEur: async () => 0 },
    runCapEur: 100,
    tenantMonthCapEur: 100,
    ...over,
  };
}

const ANSWER_CP = [{ id: CP1, block_key: "stufe1_kern", content: { answers: { [Q1]: "Antwort" } }, created_at: "2026-06-22T10:00:00Z" }];

describe("executeModuleOutputJob — guards", () => {
  it("throws on missing capture_session_id", async () => {
    const { client } = makeAdmin({});
    await expect(executeModuleOutputJob(makeJob({ modul_key: "m04" }), deps(client))).rejects.toThrow(
      /capture_session_id/,
    );
  });

  it("throws on invalid modul_key", async () => {
    const { client } = makeAdmin({});
    await expect(
      executeModuleOutputJob(makeJob({ capture_session_id: SESSION, modul_key: "x" }), deps(client)),
    ).rejects.toThrow(/modul_key/);
  });

  it("throws when session not found", async () => {
    const { client } = makeAdmin({ session: null });
    await expect(
      executeModuleOutputJob(makeJob({ capture_session_id: SESSION, modul_key: "m04" }), deps(client)),
    ).rejects.toThrow(/capture_session .* not found/);
  });
});

describe("executeModuleOutputJob — idempotency", () => {
  it("skips + completes when outputs already exist", async () => {
    const { client, state } = makeAdmin({
      session: { id: SESSION, tenant_id: TENANT, template_id: TEMPLATE },
      existingCount: 3,
    });
    const synth = vi.fn();
    await executeModuleOutputJob(
      makeJob({ capture_session_id: SESSION, modul_key: "m04" }),
      deps(client, { synthesizer: synth as unknown as ModuleSynthesizer }),
    );
    expect(synth).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
    expect(state.rpcs).toEqual([{ name: "rpc_complete_ai_job", args: { p_job_id: JOB } }]);
  });
});

describe("executeModuleOutputJob — happy path", () => {
  it("drafts+critiques once, logs 2 ledger rows, persists triple+ki_hebel, completes", async () => {
    const { client, state } = makeAdmin({
      session: { id: SESSION, tenant_id: TENANT, template_id: TEMPLATE },
      existingCount: 0,
      template: TEMPLATE_ROW,
      checkpoints: ANSWER_CP,
    });

    const draft: ModuleDraft = {
      triple: [{ output_kind: "entscheidung", title: "E", body: "Body", evidence_frage_ids: ["F-M04-001", "F-XXX"] }],
      ki_hebel: [{ hebel_id: "H-M04-001", name: "Autokommentar", body: "passt", reifegrad: null, evidence_frage_ids: [] }],
    };
    const synthesizer: ModuleSynthesizer = vi.fn(async () => callResult(draft));
    const critic: ModuleCritic = vi.fn(async () => callResult(draft));

    await executeModuleOutputJob(
      makeJob({ capture_session_id: SESSION, modul_key: "m04" }),
      deps(client, { synthesizer, critic }),
    );

    expect(synthesizer).toHaveBeenCalledTimes(1);
    expect(critic).toHaveBeenCalledTimes(1);

    const ledgerInserts = state.inserts.filter((i) => i.table === "ai_cost_ledger");
    expect(ledgerInserts).toHaveLength(2);
    expect((ledgerInserts[0].rows as { role: string }).role).toBe("module_output_synthesis");
    expect((ledgerInserts[1].rows as { role: string }).role).toBe("module_output_critic");

    const outputInsert = state.inserts.find((i) => i.table === "modul_output");
    expect(outputInsert).toBeTruthy();
    const rows = outputInsert!.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    const triple = rows.find((r) => r.output_kind === "entscheidung")!;
    expect(triple.evidence_refs).toEqual(["F-M04-001"]); // halluzinierte F-XXX gefiltert
    expect(triple.ai_job_id).toBe(JOB);
    expect(triple.source).toBe("ai_draft");
    expect(triple.block_checkpoint_id).toBe(CP1);
    const hebel = rows.find((r) => r.output_kind === "ki_hebel")!;
    expect(hebel.reifegrad).toBe(2); // aus Katalog (DEC-245), nicht model null
    expect(hebel.title).toBe("Autokommentar");

    expect(state.rpcs).toEqual([{ name: "rpc_complete_ai_job", args: { p_job_id: JOB } }]);
  });
});

describe("executeModuleOutputJob — fail-closed + cleanup", () => {
  it("throws + cleans up when there are no answers (no draft call)", async () => {
    const { client, state } = makeAdmin({
      session: { id: SESSION, tenant_id: TENANT, template_id: TEMPLATE },
      template: TEMPLATE_ROW,
      checkpoints: [],
    });
    const synthesizer: ModuleSynthesizer = vi.fn(async () => callResult({ triple: [], ki_hebel: [] }));
    await expect(
      executeModuleOutputJob(
        makeJob({ capture_session_id: SESSION, modul_key: "m04" }),
        deps(client, { synthesizer }),
      ),
    ).rejects.toThrow(/no capture answers/);
    expect(synthesizer).not.toHaveBeenCalled();
    expect(state.deletes).toEqual([{ table: "modul_output", col: "ai_job_id", val: JOB }]);
  });

  it("throws before drafting when tenant-month cap is exceeded", async () => {
    const { client, state } = makeAdmin({
      session: { id: SESSION, tenant_id: TENANT, template_id: TEMPLATE },
      template: TEMPLATE_ROW,
      checkpoints: ANSWER_CP,
    });
    const synthesizer: ModuleSynthesizer = vi.fn(async () => callResult({ triple: [], ki_hebel: [] }));
    await expect(
      executeModuleOutputJob(
        makeJob({ capture_session_id: SESSION, modul_key: "m04" }),
        deps(client, {
          synthesizer,
          costStore: { getTenantMonthCostEur: async () => 100 },
          tenantMonthCapEur: 50,
        }),
      ),
    ).rejects.toThrow(/tenant_month_cap_exceeded/);
    expect(synthesizer).not.toHaveBeenCalled();
    expect(state.deletes).toHaveLength(1);
  });

  it("throws after draft when run-cap is exceeded, no modul_output insert", async () => {
    const { client, state } = makeAdmin({
      session: { id: SESSION, tenant_id: TENANT, template_id: TEMPLATE },
      template: TEMPLATE_ROW,
      checkpoints: ANSWER_CP,
    });
    const draft: ModuleDraft = { triple: [{ output_kind: "standard", title: "S", body: "B", evidence_frage_ids: [] }], ki_hebel: [] };
    const synthesizer: ModuleSynthesizer = vi.fn(async () => callResult(draft, 1)); // 1 USD -> >run-cap
    const critic: ModuleCritic = vi.fn(async () => callResult(draft));
    await expect(
      executeModuleOutputJob(
        makeJob({ capture_session_id: SESSION, modul_key: "m04" }),
        deps(client, { synthesizer, critic, runCapEur: 0.0001 }),
      ),
    ).rejects.toThrow(/run_cap_exceeded/);
    expect(critic).not.toHaveBeenCalled();
    expect(state.inserts.find((i) => i.table === "modul_output")).toBeUndefined();
    expect(state.deletes).toHaveLength(1);
  });

  it("throws on modul_key mismatch between payload and template", async () => {
    const { client } = makeAdmin({
      session: { id: SESSION, tenant_id: TENANT, template_id: TEMPLATE },
      template: { ...TEMPLATE_ROW, metadata: { ...TEMPLATE_ROW.metadata, modul_key: "m06" } },
      checkpoints: ANSWER_CP,
    });
    await expect(
      executeModuleOutputJob(makeJob({ capture_session_id: SESSION, modul_key: "m04" }), deps(client)),
    ).rejects.toThrow(/!= template metadata.modul_key/);
  });
});
