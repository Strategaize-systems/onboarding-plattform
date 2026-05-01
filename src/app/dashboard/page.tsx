import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadCockpitMetrics } from "@/lib/cockpit/load-metrics";
import { getReviewSummary } from "@/lib/handbook/get-review-summary";
import { getInactiveEmployeesCount } from "@/lib/dashboard/inactive-employees";
import { BlockReviewStatusCard } from "@/components/cockpit/BlockReviewStatusCard";
import { InactiveEmployeesCard } from "@/components/cockpit/InactiveEmployeesCard";
import { DashboardClient } from "./dashboard-client";
import { StatusCockpit } from "./StatusCockpit";
// SLC-047 Wizard-Trigger — eigentlich ueber dashboard/layout.tsx geplant
// (DEC SLC-047 MT-5), aber Next 16 Turbopack-Build erkennt das layout.tsx
// nicht und packt seinen Code nicht ins Bundle. Workaround: Trigger hier in
// page.tsx. Effektiv identisch fuer V4.2 (Wizard nur initial auf /dashboard).
import { getWizardStateForCurrentUser } from "@/lib/wizard/get-wizard-state";
import { Wizard, type WizardTemplate } from "@/components/onboarding-wizard/Wizard";
import { clampStep } from "@/components/onboarding-wizard/wizard-helpers";
import { HelpTrigger } from "@/components/help/HelpTrigger";
import { loadHelpMarkdown } from "@/lib/help/load";

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

  // SLC-042 — Berater-Review-Status fuer 6. Cockpit-Card.
  // Loaded nur fuer tenant_admin mit aktiver Session; sonst keine Card.
  // ISSUE-029 Fix: getReviewSummary aggregiert ueber Tenant (nicht GF-Session),
  // weil block_review-Rows in den Mitarbeiter-Sessions liegen.
  let reviewCard: React.ReactNode = null;
  if (
    profile.role === "tenant_admin" &&
    metrics &&
    metrics.captureSessionId &&
    profile.tenant_id
  ) {
    const summary = await getReviewSummary(supabase, profile.tenant_id);
    reviewCard = (
      <BlockReviewStatusCard
        summary={summary}
        role="tenant_admin"
        tenantId={profile.tenant_id}
      />
    );
  }

  // SLC-049 MT-3 — Cockpit-Card "Mitarbeiter ohne Aktivitaet" fuer tenant_admin.
  // Klick fuehrt zu /admin/team?filter=inactive (MT-4).
  let inactiveCard: React.ReactNode = null;
  if (profile.role === "tenant_admin" && profile.tenant_id) {
    const inactive = await getInactiveEmployeesCount(supabase, profile.tenant_id);
    inactiveCard = (
      <InactiveEmployeesCard
        inactiveCount={inactive.inactiveCount}
        totalAccepted={inactive.totalAccepted}
      />
    );
  }

  const cockpitContent =
    profile.role === "tenant_admin" && metrics ? (
      <StatusCockpit
        metrics={metrics}
        reviewCard={reviewCard}
        inactiveCard={inactiveCard}
      />
    ) : null;

  // SLC-047 — Auto-Trigger Wizard fuer tenant_admin im pending|started state.
  // Lade Tenant-Name + aktive Templates nur wenn Wizard tatsaechlich rendert.
  const wizardState = await getWizardStateForCurrentUser();
  let wizardOverlay: React.ReactNode = null;
  if (wizardState.shouldShow && profile.tenant_id) {
    const [tenantRes, templatesRes] = await Promise.all([
      supabase.from("tenants").select("name").eq("id", profile.tenant_id).single(),
      supabase
        .from("template")
        .select("id, slug, name, description")
        .order("created_at", { ascending: true }),
    ]);
    const tenantName = tenantRes.data?.name ?? "Ihr Unternehmen";
    const templates: WizardTemplate[] = (templatesRes.data ?? []).map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
    }));
    wizardOverlay = (
      <Wizard
        initialStep={clampStep(wizardState.step)}
        initialState={wizardState.state === "started" ? "started" : "pending"}
        tenantName={tenantName}
        templates={templates}
      />
    );
  }

  // SLC-050 — In-App-Hilfe Trigger im Header.
  const helpMarkdown = loadHelpMarkdown("dashboard");

  return (
    <>
      <DashboardClient
        profile={profile}
        initialSessions={sessions}
        initialGapCounts={gapCounts}
        cockpitContent={cockpitContent}
        headerActions={
          <HelpTrigger pageKey="dashboard" markdown={helpMarkdown} />
        }
      />
      {wizardOverlay}
    </>
  );
}
