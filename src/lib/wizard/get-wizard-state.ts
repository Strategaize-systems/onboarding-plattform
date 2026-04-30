import { createClient } from "@/lib/supabase/server";

// SLC-046 MT-3 — V4.2 Wizard Layout-Helper
// DEC-051: nur tenant_admin sieht den Wizard.
// Soft-Bedingung: pending → only show if NO capture_session existiert (User hat das Tool noch nicht genutzt).
// Resume: state='started' → immer zeigen (User kommt zurueck in den Wizard).
// Final-States: 'skipped' / 'completed' → nicht mehr zeigen.

export type WizardStateKind = "pending" | "started" | "skipped" | "completed";

export type WizardState = {
  shouldShow: boolean;
  state: WizardStateKind;
  step: 1 | 2 | 3 | 4;
};

const DEFAULT_HIDDEN: WizardState = {
  shouldShow: false,
  state: "completed",
  step: 1,
};

/**
 * Liefert den Wizard-Zustand fuer den aktuell angemeldeten User.
 * Wird im Server-Layout `/dashboard/layout.tsx` aufgerufen, um zu entscheiden
 * ob das Wizard-Modal initial geoeffnet werden soll.
 *
 * Logik:
 *  - kein User / kein Profil          → shouldShow=false
 *  - Rolle != tenant_admin            → shouldShow=false (DEC-051)
 *  - state in ('skipped','completed') → shouldShow=false
 *  - state = 'started'                → shouldShow=true (Resume)
 *  - state = 'pending' UND 0 capture_sessions → shouldShow=true
 *  - sonst                            → shouldShow=false
 */
export async function getWizardStateForCurrentUser(): Promise<WizardState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_HIDDEN;

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "tenant_admin" || !profile.tenant_id) {
    return DEFAULT_HIDDEN;
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("onboarding_wizard_state, onboarding_wizard_step")
    .eq("id", profile.tenant_id)
    .single();

  if (!tenant) return DEFAULT_HIDDEN;

  const state = tenant.onboarding_wizard_state as WizardStateKind;
  const step = (tenant.onboarding_wizard_step ?? 1) as 1 | 2 | 3 | 4;

  if (state === "skipped" || state === "completed") {
    return { shouldShow: false, state, step };
  }

  if (state === "started") {
    return { shouldShow: true, state, step };
  }

  // state === 'pending' — Soft-Bedingung: nur wenn noch keine capture_session existiert.
  const { count } = await supabase
    .from("capture_session")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id);

  const sessionCount = count ?? 0;
  return {
    shouldShow: sessionCount === 0,
    state,
    step,
  };
}
