// V9.75 SLC-V9.75-C MT-2/MT-3 — Hermetische Tests fuer die Roster-Actions.
//
// createClient() wird gemockt (next/headers cookies sind im Test-Kontext nicht
// verfuegbar). Geprueft werden Input-Validation, Auth-/Rollen-Gate, blueprint+-
// Stufen-Gate, weiche Dedup (23505-Swallow) und die Promote-Bruecke inkl.
// Idempotenz (duplicate_pending_invitation, Re-Promote-Schutz).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ captureException: vi.fn() }));

// --- Queue-basierter Supabase-Mock -----------------------------------------
// Pro Tabelle eine Ergebnis-Queue; jeder Terminal (.single() / await-builder)
// shiftet das naechste Ergebnis. rpc() liefert pro Name ein konfiguriertes
// Ergebnis. So lassen sich Mehr-Schritt-Flows (load -> update) abbilden.
let tableQueues: Record<string, unknown[]>;
let rpcResults: Record<string, unknown>;
let userResult: { data: { user: { id: string } | null } };
let inserts: Array<{ table: string; values: Record<string, unknown> }>;
let updates: Array<{ table: string; values: Record<string, unknown> }>;
let deletes: string[];

function take(table: string): unknown {
  const q = tableQueues[table] ?? [];
  return q.length ? q.shift() : { data: null, error: null };
}

function builder(table: string) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.order = () => b;
  b.limit = () => b;
  b.insert = (values: Record<string, unknown>) => {
    inserts.push({ table, values });
    return b;
  };
  b.update = (values: Record<string, unknown>) => {
    updates.push({ table, values });
    return b;
  };
  b.delete = () => {
    deletes.push(table);
    return b;
  };
  b.single = () => Promise.resolve(take(table));
  b.maybeSingle = () => Promise.resolve(take(table));
  // builder ist thenable -> `await ...eq(...)` (update/delete) shiftet die Queue.
  b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(take(table)).then(resolve, reject);
  return b;
}

const supabaseMock = {
  auth: { getUser: () => Promise.resolve(userResult) },
  from: (table: string) => builder(table),
  rpc: (name: string) => Promise.resolve(rpcResults[name] ?? { data: null, error: null }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supabaseMock),
}));

import {
  addRosterEntry,
  updateRosterEntry,
  deleteRosterEntry,
  promoteRosterEntryToInvitation,
} from "./roster-actions";

const SESSION = "11111111-1111-1111-1111-111111111111";
const TENANT = "22222222-2222-2222-2222-222222222222";
const ROSTER = "33333333-3333-3333-3333-333333333333";
const USER = { id: "44444444-4444-4444-4444-444444444444" };
const INVITATION = "55555555-5555-5555-5555-555555555555";

function profile(role: string, tenantId: string | null = TENANT) {
  return { data: { role, tenant_id: tenantId }, error: null };
}
function session(tier: string, tenantId = TENANT) {
  return { data: { tenant_id: tenantId, tier }, error: null };
}
function rankFor(tier: string) {
  // Spiegelt fn_tier_rank fuer den Mock.
  return { data: { free: 0, blueprint: 1, handbook: 2 }[tier] ?? -1, error: null };
}

beforeEach(() => {
  tableQueues = {};
  rpcResults = {};
  inserts = [];
  updates = [];
  deletes = [];
  userResult = { data: { user: USER } };
});

// ===========================================================================
// addRosterEntry — Validation + Gates + Dedup (AC-C-1, AC-C-4, AC-C-5)
// ===========================================================================
describe("addRosterEntry", () => {
  it("lehnt invalide Session-ID ab", async () => {
    const r = await addRosterEntry({ sessionId: "not-uuid", name: "Anna" });
    expect(r).toEqual({ ok: false, error: "session_id_invalid" });
  });

  it("lehnt leeren Namen ab", async () => {
    const r = await addRosterEntry({ sessionId: SESSION, name: "   " });
    expect(r).toEqual({ ok: false, error: "name_required" });
  });

  it("lehnt Rolle ausserhalb (tenant_admin/strategaize_admin) ab", async () => {
    tableQueues.profiles = [profile("employee")];
    const r = await addRosterEntry({ sessionId: SESSION, name: "Anna" });
    expect(r).toEqual({ ok: false, error: "forbidden" });
  });

  it("lehnt free-Stufe ab (tier_gate_denied)", async () => {
    tableQueues.profiles = [profile("strategaize_admin", null)];
    tableQueues.capture_session = [session("free")];
    rpcResults.fn_tier_rank = rankFor("free");
    const r = await addRosterEntry({ sessionId: SESSION, name: "Anna" });
    expect(r).toEqual({ ok: false, error: "tier_gate_denied" });
  });

  it("fuegt ab blueprint hinzu; INSERT traegt tenant_id/session/created_by", async () => {
    tableQueues.profiles = [profile("tenant_admin")];
    tableQueues.capture_session = [session("blueprint")];
    rpcResults.fn_tier_rank = rankFor("blueprint");
    tableQueues.employee_roster_draft = [
      { data: { id: ROSTER, name: "Anna Beispiel", role_hint: "Buchhaltung", block_key: "block_1", promoted_invitation_id: null }, error: null },
    ];

    const r = await addRosterEntry({
      sessionId: SESSION,
      name: "Anna Beispiel",
      roleHint: "Buchhaltung",
      blockKey: "block_1",
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entry?.id).toBe(ROSTER);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.values).toMatchObject({
      tenant_id: TENANT,
      capture_session_id: SESSION,
      name: "Anna Beispiel",
      role_hint: "Buchhaltung",
      block_key: "block_1",
      created_by: USER.id,
    });
  });

  it("weiche Dedup: 23505 wird als no-op (deduped) geschluckt, kein Hard-Fail", async () => {
    tableQueues.profiles = [profile("tenant_admin")];
    tableQueues.capture_session = [session("blueprint")];
    rpcResults.fn_tier_rank = rankFor("blueprint");
    tableQueues.employee_roster_draft = [{ data: null, error: { code: "23505" } }];

    const r = await addRosterEntry({ sessionId: SESSION, name: "Anna", roleHint: "Buchhaltung" });
    expect(r).toEqual({ ok: true, deduped: true });
  });
});

// ===========================================================================
// updateRosterEntry / deleteRosterEntry
// ===========================================================================
describe("updateRosterEntry", () => {
  it("aktualisiert Name/Funktion ab blueprint", async () => {
    tableQueues.profiles = [profile("tenant_admin")];
    tableQueues.employee_roster_draft = [
      { data: { capture_session_id: SESSION }, error: null }, // load
      { error: null }, // update
    ];
    tableQueues.capture_session = [session("blueprint")];
    rpcResults.fn_tier_rank = rankFor("blueprint");

    const r = await updateRosterEntry({ id: ROSTER, name: "Neuer Name", roleHint: "IT" });
    expect(r).toEqual({ ok: true });
    expect(updates).toHaveLength(1);
    expect(updates[0]!.values).toMatchObject({ name: "Neuer Name", role_hint: "IT" });
  });

  it("nicht gefundene Zeile -> not_found", async () => {
    tableQueues.profiles = [profile("tenant_admin")];
    tableQueues.employee_roster_draft = [{ data: null, error: null }];
    const r = await updateRosterEntry({ id: ROSTER, name: "X" });
    expect(r).toEqual({ ok: false, error: "not_found" });
  });
});

describe("deleteRosterEntry", () => {
  it("loescht ab blueprint", async () => {
    tableQueues.profiles = [profile("tenant_admin")];
    tableQueues.employee_roster_draft = [
      { data: { capture_session_id: SESSION }, error: null }, // load
      { error: null }, // delete
    ];
    tableQueues.capture_session = [session("blueprint")];
    rpcResults.fn_tier_rank = rankFor("blueprint");

    const r = await deleteRosterEntry(ROSTER);
    expect(r).toEqual({ ok: true });
    expect(deletes).toContain("employee_roster_draft");
  });
});

// ===========================================================================
// promoteRosterEntryToInvitation — Bruecke + Idempotenz (AC-C-2, R-C-1)
// ===========================================================================
describe("promoteRosterEntryToInvitation", () => {
  it("lehnt ungueltige E-Mail ab", async () => {
    const r = await promoteRosterEntryToInvitation(ROSTER, "keine-mail");
    expect(r).toEqual({ ok: false, error: "invalid_email" });
  });

  it("Erfolg: 1 Invitation via RPC; promoted_invitation_id wird gestempelt", async () => {
    tableQueues.profiles = [profile("tenant_admin")];
    tableQueues.employee_roster_draft = [
      { data: { capture_session_id: SESSION, name: "Anna", role_hint: "Buchhaltung", promoted_invitation_id: null }, error: null },
      { error: null }, // update (Stempel)
    ];
    tableQueues.capture_session = [session("blueprint")];
    rpcResults.fn_tier_rank = rankFor("blueprint");
    rpcResults.rpc_create_employee_invitation = {
      data: { invitation_id: INVITATION, invitation_token: "tok" },
      error: null,
    };

    const r = await promoteRosterEntryToInvitation(ROSTER, "anna@example.com");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.invitationId).toBe(INVITATION);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.values).toMatchObject({ promoted_invitation_id: INVITATION });
  });

  it("bestehendes pending -> 'bereits eingeladen', KEIN Duplikat, kein Stempel (R-C-1)", async () => {
    tableQueues.profiles = [profile("tenant_admin")];
    tableQueues.employee_roster_draft = [
      { data: { capture_session_id: SESSION, name: "Anna", role_hint: null, promoted_invitation_id: null }, error: null },
    ];
    tableQueues.capture_session = [session("blueprint")];
    rpcResults.fn_tier_rank = rankFor("blueprint");
    rpcResults.rpc_create_employee_invitation = {
      data: { error: "duplicate_pending_invitation" },
      error: null,
    };

    const r = await promoteRosterEntryToInvitation(ROSTER, "anna@example.com");
    expect(r).toEqual({ ok: true, alreadyInvited: true });
    expect(updates).toHaveLength(0); // kein Stempel auf Duplikat
  });

  it("bereits promoted -> alreadyPromoted ohne RPC-Aufruf (Re-Promote-Schutz)", async () => {
    tableQueues.profiles = [profile("tenant_admin")];
    tableQueues.employee_roster_draft = [
      { data: { capture_session_id: SESSION, name: "Anna", role_hint: null, promoted_invitation_id: INVITATION }, error: null },
    ];
    tableQueues.capture_session = [session("blueprint")];
    rpcResults.fn_tier_rank = rankFor("blueprint");

    const r = await promoteRosterEntryToInvitation(ROSTER, "anna@example.com");
    expect(r).toEqual({ ok: true, alreadyPromoted: true, invitationId: INVITATION });
    // RPC nicht konfiguriert -> wuerde {data:null} liefern; alreadyPromoted greift davor.
  });

  it("free-Stufe -> tier_gate_denied vor RPC", async () => {
    tableQueues.profiles = [profile("strategaize_admin", null)];
    tableQueues.employee_roster_draft = [
      { data: { capture_session_id: SESSION, name: "Anna", role_hint: null, promoted_invitation_id: null }, error: null },
    ];
    tableQueues.capture_session = [session("free")];
    rpcResults.fn_tier_rank = rankFor("free");

    const r = await promoteRosterEntryToInvitation(ROSTER, "anna@example.com");
    expect(r).toEqual({ ok: false, error: "tier_gate_denied" });
  });
});
