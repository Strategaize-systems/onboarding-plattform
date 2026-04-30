// SLC-047 Diagnostic — wird nach Verifikation entfernt.
// Returnt das exakte Resultat von getWizardStateForCurrentUser fuer den
// aktuellen Login + zusaetzliche Debug-Info.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWizardStateForCurrentUser } from "@/lib/wizard/get-wizard-state";

export async function GET() {
  const debug: Record<string, unknown> = {};
  try {
    const supabase = await createClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    debug.userId = userRes?.user?.id ?? null;
    debug.userErr = userErr ? String(userErr) : null;

    if (userRes?.user) {
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("tenant_id, role, email")
        .eq("id", userRes.user.id)
        .single();
      debug.profile = profile;
      debug.profileErr = profErr ? String(profErr) : null;

      if (profile?.tenant_id) {
        const { data: tenant, error: tErr } = await supabase
          .from("tenants")
          .select("id, name, onboarding_wizard_state, onboarding_wizard_step")
          .eq("id", profile.tenant_id)
          .single();
        debug.tenant = tenant;
        debug.tenantErr = tErr ? String(tErr) : null;

        const { count, error: cErr } = await supabase
          .from("capture_session")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", profile.tenant_id);
        debug.captureSessionCount = count;
        debug.captureSessionErr = cErr ? String(cErr) : null;
      }
    }

    const wizardState = await getWizardStateForCurrentUser();
    debug.wizardStateResult = wizardState;
  } catch (e) {
    debug.thrown = String(e);
  }
  return NextResponse.json(debug, { status: 200 });
}
