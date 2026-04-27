import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadCockpitMetrics } from "@/lib/cockpit/load-metrics";
import { DashboardClient } from "./dashboard-client";
import { StatusCockpit } from "./StatusCockpit";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, email, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role === "strategaize_admin") {
    redirect("/admin");
  }

  // Cockpit-Metriken (SLC-040). Nur fuer tenant_admin sinnvoll — fuer andere
  // Rollen liefert loadCockpitMetrics einen Empty-State, den der StatusCockpit
  // mit "Neue Erhebung starten" rendert.
  const metricsPromise = profile.tenant_id
    ? loadCockpitMetrics({ supabase, tenantId: profile.tenant_id, userId: user.id })
    : null;

  // Sessions-Liste (Bestand)
  const sessionsPromise = supabase
    .from("capture_session")
    .select("id, status, started_at, updated_at, capture_mode, template:template_id(name, slug)")
    .order("updated_at", { ascending: false });

  const gapsPromise = supabase
    .from("gap_question")
    .select("capture_session_id")
    .eq("status", "pending");

  const [metrics, sessionsRes, gapsRes] = await Promise.all([
    metricsPromise,
    sessionsPromise,
    gapsPromise,
  ]);

  const sessions = (sessionsRes.data ?? []).map((row) => ({
    id: row.id as string,
    status: row.status as string,
    started_at: row.started_at as string,
    updated_at: row.updated_at as string,
    capture_mode: (row as Record<string, unknown>).capture_mode as string | null,
    template: (Array.isArray(row.template) ? row.template[0] ?? null : row.template) as
      | { name: string; slug: string }
      | null,
  }));

  const gapCounts: Record<string, number> = {};
  for (const g of gapsRes.data ?? []) {
    gapCounts[g.capture_session_id] = (gapCounts[g.capture_session_id] ?? 0) + 1;
  }

  const cockpitContent =
    profile.role === "tenant_admin" && metrics ? (
      <StatusCockpit metrics={metrics} />
    ) : null;

  return (
    <DashboardClient
      profile={profile}
      initialSessions={sessions}
      initialGapCounts={gapCounts}
      cockpitContent={cockpitContent}
    />
  );
}
