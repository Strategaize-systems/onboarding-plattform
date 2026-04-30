// SLC-047 MT-5 — Dashboard-Layout: Auto-Trigger fuer Tenant-Onboarding-Wizard.
//
// Server-Component. Ruft getWizardStateForCurrentUser() (SLC-046) und rendert
// den <Wizard> nur wenn shouldShow=true (tenant_admin, state in
// pending|started, 0 capture_sessions bei pending). Der Wizard selbst ist ein
// Client-Component und kuemmert sich um setWizardStarted, Step-Transitions und
// Skip/Complete.
//
// Tenant-Name + aktive Templates werden hier geladen, weil der Wizard sie als
// Prop erwartet. Wenn shouldShow=false wird das gar nicht erst gefetcht
// (Performance + RLS-Footprint minimal halten).

import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getWizardStateForCurrentUser } from "@/lib/wizard/get-wizard-state";
import { Wizard, type WizardTemplate } from "@/components/onboarding-wizard/Wizard";
import { clampStep } from "@/components/onboarding-wizard/wizard-helpers";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const wizardState = await getWizardStateForCurrentUser();

  if (!wizardState.shouldShow) {
    return <>{children}</>;
  }

  // Wizard wird gerendert — fetch Templates + tenant.name (nur fuer den
  // sichtbaren Wizard-Branch).
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // shouldShow=true setzt einen tenant_admin voraus; defensive null-checks
  // sind trotzdem da, damit ein zwischenzeitlicher Auth-Drift nicht crasht.
  if (!user) return <>{children}</>;

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) return <>{children}</>;

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

  return (
    <>
      {children}
      <Wizard
        initialStep={clampStep(wizardState.step)}
        initialState={wizardState.state === "started" ? "started" : "pending"}
        tenantName={tenantName}
        templates={templates}
      />
    </>
  );
}
