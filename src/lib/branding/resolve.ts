// V6 SLC-104 — Partner-Branding Resolver (FEAT-044, DEC-106, DEC-109)
//
// resolveBrandingForTenant ruft rpc_get_branding_for_tenant (SECURITY DEFINER,
// keine Auth-Pruefung — DEC-109 best-effort lesbar) und uebersetzt das Ergebnis
// in eine BrandingConfig, die das Root-Layout in CSS-Custom-Properties giesst.
//
// Fallback-Verhalten (R-104-1 Try/Catch + Default):
//   - tenantId === null           -> Strategaize-Default
//   - RPC-Error oder data null    -> Strategaize-Default
//   - Tenant unbekannt im RPC     -> RPC liefert selbst Strategaize-Default
//   - Hex-Parse-Fehler bei rgb()  -> Strategaize-Default-RGB

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandingConfig, BrandingRpcPayload } from "./types";

// SLC-104 MT-6 (DEC-NEU): Strategaize-Default ist Style Guide V2 (#4454b8),
// NICHT Tailwind-Blue-Default (#2563eb). Damit ist der CSS-Var-Fallback in
// tailwind.config brand.primary identisch mit dem heutigen Style-Guide-Look.
export const STRATEGAIZE_DEFAULT_BRANDING: BrandingConfig = {
  logoUrl: null,
  primaryColor: "#4454b8",
  primaryColorRgb: "68 84 184",
  secondaryColor: null,
  displayName: "Strategaize",
};

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function hexToRgbTriplet(hex: string): string {
  const m = HEX_RE.exec(hex);
  if (!m) return STRATEGAIZE_DEFAULT_BRANDING.primaryColorRgb;
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export async function resolveBrandingForTenant(
  supabase: SupabaseClient,
  tenantId: string | null
): Promise<BrandingConfig> {
  if (tenantId === null) {
    return STRATEGAIZE_DEFAULT_BRANDING;
  }

  try {
    const { data, error } = await supabase.rpc("rpc_get_branding_for_tenant", {
      p_tenant_id: tenantId,
    });

    if (error || !data) {
      return STRATEGAIZE_DEFAULT_BRANDING;
    }

    const payload = data as BrandingRpcPayload;
    const primaryColor = payload.primary_color ?? STRATEGAIZE_DEFAULT_BRANDING.primaryColor;
    const logoStoragePath = payload.logo_url ?? null;

    return {
      logoUrl: logoStoragePath
        ? `/api/partner-branding/${encodeURIComponent(tenantId)}/logo`
        : null,
      primaryColor,
      primaryColorRgb: hexToRgbTriplet(primaryColor),
      secondaryColor: payload.secondary_color ?? null,
      displayName: payload.display_name ?? null,
    };
  } catch {
    return STRATEGAIZE_DEFAULT_BRANDING;
  }
}
