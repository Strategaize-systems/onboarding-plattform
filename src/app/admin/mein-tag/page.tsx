// SLC-182 MT-2 — Berater-KI-Workspace "Mein Tag" (Shell, statisch).
// URL: /admin/mein-tag. Cross-Mandanten-Workspace fuer den Berater.
//
// Auth: zwar bereits durch /admin/layout auf strategaize_admin oder
// tenant_admin gegated, aber dieses Page-Level explizit auf strategaize_admin —
// tenant_admin sieht hier nichts (analog /admin/reviews).
//
// Dieser Slice liefert nur die statische Shell: keine Live-Daten, kein LLM,
// keine DB-Reads ueber die Auth-Pruefung hinaus (Daten folgen SLC-183/184).

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

export default async function MeinTagPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") {
    redirect("/dashboard");
  }

  // Mandantenliste fuer den Frage-Selector (SLC-184). strategaize_admin darf
  // tenants cross-Mandant lesen (RLS). Reine UX — der tenant_id wird in der
  // RAG-Action erneut server-seitig validiert (DEC-258).
  const { data: tenantRows } = await supabase
    .from("tenants")
    .select("id, name")
    .order("name", { ascending: true });
  const tenants = (tenantRows ?? []) as Array<{ id: string; name: string }>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Mein Tag</h1>
        <p className="mt-1 text-sm text-slate-500">
          Dein Cross-Mandanten-Berater-Workspace: Standard-Berichte ueber alle
          Mandanten hinweg abrufen oder eine freie Frage stellen — die Analyse
          erscheint darunter.
        </p>
      </div>

      <WorkspaceShell tenants={tenants} />
    </div>
  );
}
