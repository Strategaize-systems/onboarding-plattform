"use server";

// V9.75 SLC-V9.75-C MT-2/MT-3 — Stufe-1 Mitarbeiter-Register + Bruecke.
//
// Leichtes Name+Funktion-Register (ohne E-Mail) im Debrief/Meeting-View
// (DEC-224). CRUD-Actions + Bruecke promoteRosterEntryToInvitation, die die
// UNVERAENDERTE rpc_create_employee_invitation ruft (SC-V9.75-7).
//
// Gates:
//   - Rolle: tenant_admin oder strategaize_admin (RLS-Perimeter wie
//     employee_invitation, Migration 122).
//   - Stufe: blueprint+ (AC-C-5). Leichtes Action-Gate, NICHT die volle Job-Gate-
//     Maschinerie (R-C-3: kein teures Capture-/Output-Entitlement). Die Ordnung
//     kommt aus der Matrix-Single-Source fn_tier_rank (DEC-220, blueprint=Rang 1),
//     kein hartkodierter TS-Mirror.
//
// Idempotenz/Dedup:
//   - Register: WEICH (UNIQUE-Index) — ein 23505 beim Hinzufuegen wird als
//     no-op (deduped) geschluckt, kein Hard-Fail (AC-C-4).
//   - Promote: HART auf der bestehenden employee_invitation-UNIQUE (pending-email).
//     Die RPC liefert bei Duplikat 'duplicate_pending_invitation' -> "bereits
//     eingeladen", kein Duplikat (AC-C-2). promoted_invitation_id = Re-Promote-Schutz.

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

const BLUEPRINT_RANK = 1; // fn_tier_rank('blueprint') — Stufe-1-Mindestrang.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 200;
const ROLE_MAX = 200;
const BLOCK_KEY_MAX = 100;

export type RosterActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export interface RosterEntry {
  id: string;
  name: string;
  role_hint: string | null;
  block_key: string | null;
  promoted_invitation_id: string | null;
}

function trimOrNull(raw: string | null | undefined, max: number): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (v.length === 0) return null;
  return v.slice(0, max);
}

/** Auth + Rollen-Gate (tenant_admin / strategaize_admin). */
async function requireRosterManager(
  supabase: SupabaseClient,
): Promise<
  | { ok: true; userId: string; role: string; tenantId: string | null }
  | { ok: false; error: string }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["tenant_admin", "strategaize_admin"].includes(profile.role)) {
    return { ok: false, error: "forbidden" };
  }
  return { ok: true, userId: user.id, role: profile.role, tenantId: profile.tenant_id };
}

/**
 * Stufen-Gate: laedt tenant_id + tier der Session und prueft blueprint+ via
 * fn_tier_rank (Matrix-Single-Source, fail-closed). Liefert tenant_id fuer den
 * INSERT zurueck.
 */
async function gateSessionBlueprint(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ ok: true; tenantId: string } | { ok: false; error: string }> {
  const { data: session } = await supabase
    .from("capture_session")
    .select("tenant_id, tier")
    .eq("id", sessionId)
    .single();
  if (!session) return { ok: false, error: "session_not_found" };

  const { data: rank } = await supabase.rpc("fn_tier_rank", {
    p_tier: (session.tier as string | null) ?? "",
  });
  if (typeof rank !== "number" || rank < BLUEPRINT_RANK) {
    return { ok: false, error: "tier_gate_denied" };
  }
  return { ok: true, tenantId: session.tenant_id as string };
}

function revalidateSession(sessionId: string): void {
  revalidatePath(`/admin/debrief/${sessionId}`, "layout");
}

// ---------------------------------------------------------------------------
// addRosterEntry
// ---------------------------------------------------------------------------
export async function addRosterEntry(input: {
  sessionId: string;
  name: string;
  roleHint?: string | null;
  blockKey?: string | null;
}): Promise<RosterActionResult<{ entry?: RosterEntry; deduped?: boolean }>> {
  if (!UUID_RE.test(input.sessionId ?? "")) {
    return { ok: false, error: "session_id_invalid" };
  }
  const name = trimOrNull(input.name, NAME_MAX);
  if (!name) return { ok: false, error: "name_required" };
  const roleHint = trimOrNull(input.roleHint ?? null, ROLE_MAX);
  const blockKey = trimOrNull(input.blockKey ?? null, BLOCK_KEY_MAX);

  const supabase = await createClient();

  const mgr = await requireRosterManager(supabase);
  if (!mgr.ok) return mgr;

  const gate = await gateSessionBlueprint(supabase, input.sessionId);
  if (!gate.ok) return gate;

  const { data: entry, error } = await supabase
    .from("employee_roster_draft")
    .insert({
      tenant_id: gate.tenantId,
      capture_session_id: input.sessionId,
      name,
      role_hint: roleHint,
      block_key: blockKey,
      created_by: mgr.userId,
    })
    .select("id, name, role_hint, block_key, promoted_invitation_id")
    .single();

  if (error) {
    // Weiche Dedup: doppelter Eintrag ist kein Fehler, nur ein no-op (AC-C-4).
    if (error.code === "23505") {
      return { ok: true, deduped: true };
    }
    return { ok: false, error: "insert_failed" };
  }

  revalidateSession(input.sessionId);
  return { ok: true, entry: entry as RosterEntry };
}

// ---------------------------------------------------------------------------
// updateRosterEntry
// ---------------------------------------------------------------------------
export async function updateRosterEntry(input: {
  id: string;
  name: string;
  roleHint?: string | null;
}): Promise<RosterActionResult> {
  if (!UUID_RE.test(input.id ?? "")) return { ok: false, error: "id_invalid" };
  const name = trimOrNull(input.name, NAME_MAX);
  if (!name) return { ok: false, error: "name_required" };
  const roleHint = trimOrNull(input.roleHint ?? null, ROLE_MAX);

  const supabase = await createClient();

  const mgr = await requireRosterManager(supabase);
  if (!mgr.ok) return mgr;

  const { data: row } = await supabase
    .from("employee_roster_draft")
    .select("capture_session_id")
    .eq("id", input.id)
    .single();
  if (!row) return { ok: false, error: "not_found" };

  const gate = await gateSessionBlueprint(supabase, row.capture_session_id as string);
  if (!gate.ok) return gate;

  const { error } = await supabase
    .from("employee_roster_draft")
    .update({ name, role_hint: roleHint, updated_at: new Date().toISOString() })
    .eq("id", input.id);

  if (error) {
    // Umbenennung kollidiert mit bestehendem Eintrag -> weiche Meldung.
    if (error.code === "23505") return { ok: false, error: "duplicate" };
    return { ok: false, error: "update_failed" };
  }

  revalidateSession(row.capture_session_id as string);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// deleteRosterEntry
// ---------------------------------------------------------------------------
export async function deleteRosterEntry(id: string): Promise<RosterActionResult> {
  if (!UUID_RE.test(id ?? "")) return { ok: false, error: "id_invalid" };

  const supabase = await createClient();

  const mgr = await requireRosterManager(supabase);
  if (!mgr.ok) return mgr;

  const { data: row } = await supabase
    .from("employee_roster_draft")
    .select("capture_session_id")
    .eq("id", id)
    .single();
  if (!row) return { ok: false, error: "not_found" };

  const gate = await gateSessionBlueprint(supabase, row.capture_session_id as string);
  if (!gate.ok) return gate;

  const { error } = await supabase.from("employee_roster_draft").delete().eq("id", id);
  if (error) return { ok: false, error: "delete_failed" };

  revalidateSession(row.capture_session_id as string);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// promoteRosterEntryToInvitation — Bruecke (MT-3)
// ---------------------------------------------------------------------------
export async function promoteRosterEntryToInvitation(
  rosterId: string,
  email: string,
): Promise<
  RosterActionResult<{
    invitationId?: string;
    alreadyPromoted?: boolean;
    alreadyInvited?: boolean;
  }>
> {
  if (!UUID_RE.test(rosterId ?? "")) return { ok: false, error: "id_invalid" };
  const cleanEmail = (email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: "invalid_email" };

  const supabase = await createClient();

  const mgr = await requireRosterManager(supabase);
  if (!mgr.ok) return mgr;

  const { data: row } = await supabase
    .from("employee_roster_draft")
    .select("capture_session_id, name, role_hint, promoted_invitation_id")
    .eq("id", rosterId)
    .single();
  if (!row) return { ok: false, error: "not_found" };

  const gate = await gateSessionBlueprint(supabase, row.capture_session_id as string);
  if (!gate.ok) return gate;

  // Re-Promote-Schutz: bereits in eine Einladung ueberfuehrt.
  if (row.promoted_invitation_id) {
    return {
      ok: true,
      alreadyPromoted: true,
      invitationId: row.promoted_invitation_id as string,
    };
  }

  // Bruecke -> UNVERAENDERTE Einladungs-RPC (SECURITY DEFINER prueft Rolle/Tenant).
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "rpc_create_employee_invitation",
    {
      p_email: cleanEmail,
      p_display_name: row.name as string,
      p_role_hint: (row.role_hint as string | null) ?? null,
    },
  );

  if (rpcError) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(rpcError.message), {
      source: "admin/debrief/promoteRosterEntryToInvitation",
    });
    return { ok: false, error: "rpc_failed" };
  }

  const result = (rpcData ?? {}) as Record<string, string>;

  // Harte Idempotenz sitzt auf der pending-email-UNIQUE: bereits eingeladen.
  if (result.error === "duplicate_pending_invitation") {
    return { ok: true, alreadyInvited: true };
  }
  if (!result.invitation_id) {
    return { ok: false, error: result.error ?? "unknown_error" };
  }

  // Erfolg -> promoted_invitation_id stempeln (Re-Promote-Schutz).
  await supabase
    .from("employee_roster_draft")
    .update({
      promoted_invitation_id: result.invitation_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rosterId);

  revalidateSession(row.capture_session_id as string);
  return { ok: true, invitationId: result.invitation_id };
}
