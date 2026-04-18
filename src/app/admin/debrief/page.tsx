import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DebriefListPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Verify admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "strategaize_admin") {
    redirect("/dashboard");
  }

  // Load all capture sessions (admin_full RLS = cross-tenant)
  const { data: sessions } = await supabase
    .from("capture_session")
    .select("id, tenant_id, template_id, status, started_at, updated_at")
    .order("updated_at", { ascending: false });

  // Load tenant names
  const tenantIds = [...new Set((sessions ?? []).map((s) => s.tenant_id))];
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, name")
    .in("id", tenantIds.length > 0 ? tenantIds : ["none"]);

  const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t.name]));

  // Load template names
  const templateIds = [...new Set((sessions ?? []).map((s) => s.template_id))];
  const { data: templates } = await supabase
    .from("template")
    .select("id, name")
    .in("id", templateIds.length > 0 ? templateIds : ["none"]);

  const templateMap = new Map((templates ?? []).map((t) => [t.id, t.name]));

  const statusLabel: Record<string, string> = {
    open: "Offen",
    in_progress: "In Bearbeitung",
    submitted: "Eingereicht",
    reviewed: "Reviewed",
    finalized: "Finalisiert",
  };

  const statusColor: Record<string, string> = {
    open: "bg-slate-100 text-slate-600",
    in_progress: "bg-amber-100 text-amber-800",
    submitted: "bg-blue-100 text-blue-800",
    reviewed: "bg-green-100 text-green-800",
    finalized: "bg-green-200 text-green-900",
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Debrief</h1>
        <p className="mt-1 text-sm text-slate-500">
          Capture Sessions verwalten und Knowledge Units reviewen
        </p>
      </div>

      {(!sessions || sessions.length === 0) ? (
        <div className="rounded-lg border-2 border-dashed border-slate-200 p-12 text-center">
          <p className="text-sm font-medium text-slate-500">
            Noch keine Capture Sessions vorhanden
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Sessions werden erstellt, wenn ein Kunde eine Erhebung startet.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/admin/debrief/${session.id}`}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm transition-colors hover:bg-slate-50"
            >
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {tenantMap.get(session.tenant_id) ?? "Unbekannter Tenant"}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {templateMap.get(session.template_id) ?? "—"} · Session{" "}
                  {session.id.slice(0, 8)}… · Gestartet{" "}
                  {new Date(session.started_at).toLocaleDateString("de-DE")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusColor[session.status] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {statusLabel[session.status] ?? session.status}
                </span>
                <svg
                  className="h-4 w-4 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
