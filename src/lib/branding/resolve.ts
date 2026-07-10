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

import { cache } from "react";
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

// SLC-194 MT-4 (V20, ISSUE-130) — Render-Zeit-Re-Validierung der Farbwerte.
// Write-Zeit prueft actions.ts (HEX_REGEX), aber ein direkt in die DB geschriebener
// oder Alt-Wert koennte ungueltig sein. resolve.ts giesst primaryColor/secondaryColor
// im Root-Layout in ein inline <style> (:root { --brand-primary: ... }) — ein
// Nicht-HEX-Wert waere eine CSS-Injection. Defense-in-Depth: bei Invalid → Fallback.
function sanitizeHexColor(
  value: string | null | undefined,
  fallback: string,
): string;
function sanitizeHexColor(
  value: string | null | undefined,
  fallback: null,
): string | null;
function sanitizeHexColor(
  value: string | null | undefined,
  fallback: string | null,
): string | null {
  if (typeof value === "string" && HEX_RE.test(value)) return value;
  return fallback;
}

export function hexToRgbTriplet(hex: string): string {
  const m = HEX_RE.exec(hex);
  if (!m) return STRATEGAIZE_DEFAULT_BRANDING.primaryColorRgb;
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

// SLC-110 MT-3 (DEC-115) — React cache() Request-Scope-Memoization.
// Layout (resolveBrandingForCurrentRequest) UND Mandanten-Dashboard rufen
// resolveBrandingForTenant pro Request mit identischer tenant_id auf
// (ISSUE-049). cache() deduplicated Aufrufe innerhalb derselben Render-Phase
// per Object.is auf den Args. Cross-Request bleibt jeder Aufruf separat —
// Branding-Aenderungen werden beim naechsten Request sofort sichtbar.
// Praktischer Cache-Hit setzt voraus, dass Caller dieselbe SupabaseClient-
// Instanz uebergeben (createClient() einmal pro Request, dann durchreichen).
export const resolveBrandingForTenant = cache(async (
  supabase: SupabaseClient,
  tenantId: string | null
): Promise<BrandingConfig> => {
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
    // SLC-194 MT-4 (ISSUE-130): Farbwerte render-zeit gegen HEX_RE pruefen,
    // bevor sie ins inline <style> des Root-Layouts gelangen.
    const primaryColor = sanitizeHexColor(
      payload.primary_color,
      STRATEGAIZE_DEFAULT_BRANDING.primaryColor,
    );
    const secondaryColor = sanitizeHexColor(payload.secondary_color, null);
    const logoStoragePath = payload.logo_url ?? null;

    return {
      logoUrl: logoStoragePath
        ? `/api/partner-branding/${encodeURIComponent(tenantId)}/logo`
        : null,
      primaryColor,
      primaryColorRgb: hexToRgbTriplet(primaryColor),
      secondaryColor,
      displayName: payload.display_name ?? null,
    };
  } catch {
    return STRATEGAIZE_DEFAULT_BRANDING;
  }
});
