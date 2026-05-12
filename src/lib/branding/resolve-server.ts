// V6 SLC-104 MT-5 — Server-Side Branding-Resolver fuer Root-Layout (FEAT-044, DEC-106).
//
// resolveBrandingForCurrentRequest() liest die Server-Auth-Session via createClient(),
// ermittelt tenantId aus profiles.tenant_id und gibt die passende BrandingConfig zurueck.
//
// Strikt getrennt von resolve.ts (pure-functional, ohne next/headers-Import) damit
// Vitest-Tests gegen resolveBrandingForTenant + hexToRgbTriplet ohne next-Mock laufen.
//
// R-104-1 Mitigation: Top-Level Try/Catch faengt jeden Fehler ab und gibt
// Strategaize-Default zurueck. Root-Layout darf NIE durch Branding-Resolver brechen.

import { createClient } from "@/lib/supabase/server";
import { resolveBrandingForTenant, STRATEGAIZE_DEFAULT_BRANDING } from "./resolve";
import type { BrandingConfig } from "./types";

export async function resolveBrandingForCurrentRequest(): Promise<BrandingConfig> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return STRATEGAIZE_DEFAULT_BRANDING;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    const tenantId = profile?.tenant_id ?? null;
    return await resolveBrandingForTenant(supabase, tenantId);
  } catch {
    return STRATEGAIZE_DEFAULT_BRANDING;
  }
}
