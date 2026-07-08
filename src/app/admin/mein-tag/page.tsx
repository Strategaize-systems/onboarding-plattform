// SLC-182 MT-2 — Berater-KI-Workspace "Mein Tag".
// URL: /admin/mein-tag.
//
// V10.4 SLC-190: erlaubt strategaize_admin (alle Tenants) UND strategaize_berater
// (nur zugewiesene Tenants, Report-Set ohne System-Status). Der Scope wird ueber
// resolveWorkspaceScope aufgeloest; die tenant_id wird in den Actions serverseitig
// erneut validiert (DEC-258/270, fail-closed) — die Page-Liste ist reine UX.

import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveWorkspaceScope } from "@/lib/workspace/workspace-scope";
import { BERATER_REPORT_KEYS } from "@/lib/workspace/reports";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

export default async function MeinTagPage() {
  const scope = await resolveWorkspaceScope();
  if (!scope) redirect("/dashboard");

  // Mandantenliste fuer den Frage-Selector. Admin: alle. Berater: nur zugewiesene
  // (∪ Cascade). Namen brauchen den Admin-Client (Berater hat keine cross-tenant-
  // SELECT-Policy auf tenants, DEC-269). Page ist ueber resolveWorkspaceScope gegated.
  const admin = createAdminClient();
  let tenants: Array<{ id: string; name: string }> = [];
  if (scope.allowedTenantIds === undefined) {
    const { data } = await admin
      .from("tenants")
      .select("id, name")
      .order("name", { ascending: true });
    tenants = (data ?? []) as Array<{ id: string; name: string }>;
  } else if (scope.allowedTenantIds.length > 0) {
    const { data } = await admin
      .from("tenants")
      .select("id, name")
      .in("id", scope.allowedTenantIds)
      .order("name", { ascending: true });
    tenants = (data ?? []) as Array<{ id: string; name: string }>;
  }

  // Berater bekommt nur die tenant-scopebaren Reports (kein System-Status, DEC-270).
  const reportKeys =
    scope.allowedTenantIds === undefined ? undefined : BERATER_REPORT_KEYS;

  const isBerater = scope.role === "strategaize_berater";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Mein Tag</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isBerater
            ? "Dein Berater-Workspace fuer deine zugewiesenen Mandanten: Standard-Berichte abrufen oder eine freie Frage stellen — die Analyse erscheint darunter."
            : "Dein Cross-Mandanten-Berater-Workspace: Standard-Berichte ueber alle Mandanten hinweg abrufen oder eine freie Frage stellen — die Analyse erscheint darunter."}
        </p>
      </div>

      <WorkspaceShell tenants={tenants} reportKeys={reportKeys} />
    </div>
  );
}
