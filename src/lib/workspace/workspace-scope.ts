// V10.4 SLC-190 (FEAT-107) MT-3 — Zugriffs-Scope-Resolver fuer "Mein Tag".
//
// Loest EINMAL (ein getUser + ein Profile-Read) auf, ob der Aufrufer den Berater-
// Workspace nutzen darf und — falls strategaize_berater — auf welche Tenants er
// gescopt ist. Ersetzt den reinen assertStrategaizeAdmin-Gate in den Mein-Tag-
// Entry-Points (page.tsx, actions.ts, rag-action.ts), damit derselbe Re-Gate
// beide erlaubten Rollen abdeckt (Server-Actions sind eigenstaendige Entry-Points,
// das Page-Gate schuetzt sie NICHT — R-183-1 / security-audit-standard).
//
// Scope-Semantik (spiegelt tenant-scope.ts / DEC-269/270):
//   - strategaize_admin   => allowedTenantIds === undefined (alle Tenants, 0 Regression)
//   - strategaize_berater => allowedTenantIds === string[] (zugewiesene ∪ Cascade;
//                             leer => 0 Zeilen, fail-closed)
//   - jede andere Rolle / nicht eingeloggt => null (Aufrufer redirected/unauthorized)

import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type WorkspaceScope =
  | { role: "strategaize_admin"; user: User; allowedTenantIds: undefined }
  | { role: "strategaize_berater"; user: User; allowedTenantIds: string[] };

/**
 * Re-Gate + Scope-Resolver. Liefert null, wenn der Aufrufer weder
 * strategaize_admin noch strategaize_berater ist (oder nicht eingeloggt).
 * MUSS in jedem Mein-Tag-Entry-Point VOR createAdminClient laufen.
 */
export async function resolveWorkspaceScope(): Promise<WorkspaceScope | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;

  if (role === "strategaize_admin") {
    return { role, user, allowedTenantIds: undefined };
  }

  if (role === "strategaize_berater") {
    // SECURITY-DEFINER-RPC (MIG-132): zugewiesene Kanzlei-/Direkt-Tenants ∪
    // deren Mandanten (Cascade). Fehler/kein Ergebnis => leeres Array (fail-closed).
    const { data } = await supabase.rpc("berater_assigned_tenant_ids", {
      p_uid: user.id,
    });
    const allowedTenantIds = Array.isArray(data) ? (data as string[]) : [];
    return { role, user, allowedTenantIds };
  }

  return null;
}

/**
 * Laedt die einem Berater zugewiesenen Tenants (id + name) fuer die Sidebar-Liste.
 * Namen brauchen den Admin-Client — Berater hat in P2 keine cross-tenant-SELECT-
 * Policy auf `tenants` (DEC-269). Leere Zuweisung => leere Liste (fail-closed).
 */
export async function loadBeraterAssignedTenants(
  beraterUserId: string,
): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient();
  const { data: idsData } = await admin.rpc("berater_assigned_tenant_ids", {
    p_uid: beraterUserId,
  });
  const ids = Array.isArray(idsData) ? (idsData as string[]) : [];
  if (ids.length === 0) return [];

  const { data } = await admin
    .from("tenants")
    .select("id, name")
    .in("id", ids)
    .order("name", { ascending: true });
  return (data ?? []) as { id: string; name: string }[];
}
