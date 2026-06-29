// Hermetische Tests fuer den Blueprint-Diagnose-Trigger (SLC-172 MT-2).
//
// createClient/createAdminClient werden gemockt (next/headers + Bedrock/DB sind im
// Test-Kontext nicht verfuegbar). Geprueft: Auth-Gate, Tenant-Scope, Tier-Gate,
// Seed-Roundtrip, Enqueue-Idempotenz (pending-Delete) und der 7-Job-Enqueue mit
// korrektem payload + session_tier-Stempel (AC-172-5).

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Supabase-Mock (auth/profiles/capture_session) -------------------------
let tableQueues: Record<string, unknown[]>;
let userResult: { data: { user: { id: string } | null } };

function takeSupabase(table: string): unknown {
  const q = tableQueues[table] ?? [];
  return q.length ? q.shift() : { data: null, error: null };
}

function supabaseBuilder(table: string) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.single = () => Promise.resolve(takeSupabase(table));
  b.maybeSingle = () => Promise.resolve(takeSupabase(table));
  return b;
}

const supabaseMock = {
  auth: { getUser: () => Promise.resolve(userResult) },
  from: (table: string) => supabaseBuilder(table),
};

// --- Admin-Mock (rpc + ai_jobs delete/insert) ------------------------------
let rpcResults: Record<string, unknown>;
let rpcCalls: Array<{ name: string; args: unknown }>;
let jobInserts: Array<Record<string, unknown>[]>;
let jobDeletes: Array<Record<string, unknown>>;
let jobInsertError: { message: string } | null;

function adminJobsBuilder() {
  const filterState: Record<string, unknown> = {};
  const b: Record<string, unknown> = {};
  b.delete = () => b;
  b.eq = (col: string, val: unknown) => {
    filterState[col] = val;
    return b;
  };
  b.filter = (col: string, _op: string, val: unknown) => {
    filterState[col] = val;
    return b;
  };
  b.insert = (rows: Record<string, unknown>[]) => {
    jobInserts.push(rows);
    return Promise.resolve({ data: null, error: jobInsertError });
  };
  // delete-Kette: `await ...filter(...)` shiftet hier durch.
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
    jobDeletes.push({ ...filterState });
    return Promise.resolve({ data: null, error: null }).then(resolve, reject);
  };
  return b;
}

const adminMock = {
  rpc: (name: string, args: unknown) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(rpcResults[name] ?? { data: null, error: null });
  },
  from: (_table: string) => adminJobsBuilder(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supabaseMock),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock),
}));
vi.mock("@/lib/auth/assert-session-tier", () => ({
  assertSessionTierAllows: vi.fn(),
}));

import { triggerBlueprintDiagnosis } from "../blueprint-diagnosis";
import { assertSessionTierAllows } from "@/lib/auth/assert-session-tier";

const SESSION = "11111111-1111-1111-1111-111111111111";
const TENANT = "22222222-2222-2222-2222-222222222222";
const OWNER = "44444444-4444-4444-4444-444444444444";

const tierAllows = vi.mocked(assertSessionTierAllows);

function profile(tenantId: string | null = TENANT) {
  return { data: { tenant_id: tenantId }, error: null };
}
function sessionRow(tenantId: string | null = TENANT) {
  return { data: { tenant_id: tenantId, owner_user_id: OWNER }, error: null };
}
function sevenBlocks() {
  return ["A", "B", "C", "D", "E", "F", "G"].map((k, i) => ({
    block_key: k,
    checkpoint_id: `cp-${i}`,
  }));
}

beforeEach(() => {
  tableQueues = {};
  userResult = { data: { user: { id: OWNER } } };
  rpcResults = {};
  rpcCalls = [];
  jobInserts = [];
  jobDeletes = [];
  jobInsertError = null;
  tierAllows.mockReset();
  tierAllows.mockResolvedValue({ allowed: true, tier: "handbook" });
});

describe("triggerBlueprintDiagnosis", () => {
  it("lehnt nicht authentifizierte Aufrufe ab", async () => {
    userResult = { data: { user: null } };
    const res = await triggerBlueprintDiagnosis(SESSION);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Nicht authentifiziert/);
    expect(rpcCalls).toHaveLength(0);
  });

  it("lehnt ab, wenn kein Profil/Tenant existiert", async () => {
    tableQueues.profiles = [profile(null)];
    const res = await triggerBlueprintDiagnosis(SESSION);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Tenant/);
  });

  it("blockt fremde Session (Tenant-Mismatch)", async () => {
    tableQueues.profiles = [profile(TENANT)];
    tableQueues.capture_session = [sessionRow("99999999-9999-9999-9999-999999999999")];
    const res = await triggerBlueprintDiagnosis(SESSION);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Kein Zugriff/);
    expect(rpcCalls).toHaveLength(0);
  });

  it("blockt, wenn das Tier-Gate verweigert", async () => {
    tableQueues.profiles = [profile(TENANT)];
    tableQueues.capture_session = [sessionRow(TENANT)];
    tierAllows.mockResolvedValue({ allowed: false, tier: "free" });
    const res = await triggerBlueprintDiagnosis(SESSION);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/tier_gate_denied/);
    expect(rpcCalls).toHaveLength(0);
  });

  it("seedet die KUs und enqueued je Diagnose-Block A–G einen Job", async () => {
    tableQueues.profiles = [profile(TENANT)];
    tableQueues.capture_session = [sessionRow(TENANT)];
    rpcResults.rpc_seed_blueprint_diagnosis_input = {
      data: { session_id: SESSION, block_count: 7, ku_count: 13, blocks: sevenBlocks() },
      error: null,
    };

    const res = await triggerBlueprintDiagnosis(SESSION);

    expect(res.success).toBe(true);
    expect(res.enqueued).toBe(7);

    // Seed wurde mit der Session-ID aufgerufen.
    expect(rpcCalls).toEqual([
      { name: "rpc_seed_blueprint_diagnosis_input", args: { p_session_id: SESSION } },
    ]);

    // Enqueue-Idempotenz: pending-Jobs dieser Session wurden vorher geloescht.
    expect(jobDeletes).toHaveLength(1);
    expect(jobDeletes[0]).toMatchObject({
      job_type: "diagnosis_generation",
      status: "pending",
      "payload->>session_id": SESSION,
    });

    // Genau ein Insert-Batch mit 7 Jobs.
    expect(jobInserts).toHaveLength(1);
    const rows = jobInserts[0];
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => (r.payload as { block_key: string }).block_key)).toEqual([
      "A", "B", "C", "D", "E", "F", "G",
    ]);
    // payload-Shape + session_tier-Stempel (Worker-Defense).
    expect(rows[0]).toMatchObject({
      tenant_id: TENANT,
      job_type: "diagnosis_generation",
      status: "pending",
      session_tier: "handbook",
      payload: {
        block_checkpoint_id: "cp-0",
        block_key: "A",
        session_id: SESSION,
      },
    });
  });

  it("meldet einen Seed-Fehler und enqueued nichts", async () => {
    tableQueues.profiles = [profile(TENANT)];
    tableQueues.capture_session = [sessionRow(TENANT)];
    rpcResults.rpc_seed_blueprint_diagnosis_input = {
      data: null,
      error: { message: "diagnosis_schema.blocks ist leer" },
    };
    const res = await triggerBlueprintDiagnosis(SESSION);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/KU-Seed fehlgeschlagen/);
    expect(jobInserts).toHaveLength(0);
  });

  it("meldet einen Enqueue-Fehler", async () => {
    tableQueues.profiles = [profile(TENANT)];
    tableQueues.capture_session = [sessionRow(TENANT)];
    rpcResults.rpc_seed_blueprint_diagnosis_input = {
      data: { session_id: SESSION, block_count: 7, ku_count: 13, blocks: sevenBlocks() },
      error: null,
    };
    jobInsertError = { message: "insert denied" };
    const res = await triggerBlueprintDiagnosis(SESSION);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Job-Enqueue fehlgeschlagen/);
  });
});
