// SLC-110 MT-2 (ISSUE-048) — Default-DisplayName-Leak Fallback-Test.
//
// Verifiziert das Fallback-Praedikat aus src/app/dashboard/page.tsx:81-93.
// Wenn der Branding-Resolver den Strategaize-Default zurueckgibt (RPC-Error
// oder unkonfiguriertes Partner-Branding), darf die UI nicht "Ihr Steuerberater:
// Strategaize" zeigen — stattdessen muss der partner_organization.display_name-
// Sekundaerlookup greifen.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBrandingForTenant, STRATEGAIZE_DEFAULT_BRANDING } from "@/lib/branding/resolve";

function mockClientReturning(payload: unknown): SupabaseClient {
  return {
    rpc: vi.fn().mockResolvedValue({ data: payload, error: null }),
  } as unknown as SupabaseClient;
}

// Replikat des Fallback-Praedikats aus page.tsx — bewusst dupliziert statt
// extrahiert, weil der Branch im Server-Component-Inline-Code liegt. Bei
// Aenderung dort beide Stellen synchron halten.
function applyPartnerDisplayNameFallback(
  brandingDisplayName: string | null,
  parentPartnerTenantId: string | null,
  partnerOrgDisplayName: string | null,
): string | null {
  if (
    (!brandingDisplayName ||
      brandingDisplayName === STRATEGAIZE_DEFAULT_BRANDING.displayName) &&
    parentPartnerTenantId
  ) {
    return partnerOrgDisplayName;
  }
  return brandingDisplayName;
}

describe("dashboard partnerDisplayName Fallback (SLC-110 MT-2 / ISSUE-048)", () => {
  it("Default-Resolver-Return + Mustermann GmbH im partner_organization → 'Mustermann GmbH'", async () => {
    const supabase = mockClientReturning({
      logo_url: null,
      primary_color: "#4454b8",
      secondary_color: null,
      display_name: "Strategaize",
    });

    const branding = await resolveBrandingForTenant(supabase, "mandant-tenant-id");
    expect(branding.displayName).toBe(STRATEGAIZE_DEFAULT_BRANDING.displayName);

    const result = applyPartnerDisplayNameFallback(
      branding.displayName,
      "parent-partner-tenant-id",
      "Mustermann GmbH",
    );

    expect(result).toBe("Mustermann GmbH");
  });

  it("Default-Resolver-Return + partner_organization.display_name=null → null (kein Strategaize-Leak)", async () => {
    const supabase = mockClientReturning({
      logo_url: null,
      primary_color: "#4454b8",
      secondary_color: null,
      display_name: "Strategaize",
    });

    const branding = await resolveBrandingForTenant(supabase, "mandant-tenant-id");

    const result = applyPartnerDisplayNameFallback(
      branding.displayName,
      "parent-partner-tenant-id",
      null,
    );

    expect(result).toBeNull();
  });

  it("branding.displayName=null + partner_organization-Lookup → partner-Wert", () => {
    const result = applyPartnerDisplayNameFallback(
      null,
      "parent-partner-tenant-id",
      "Kanzlei Mueller",
    );
    expect(result).toBe("Kanzlei Mueller");
  });

  it("Echter Partner-Name in branding (kein Default) → bleibt erhalten, kein Sekundaer-Lookup", () => {
    const result = applyPartnerDisplayNameFallback(
      "Steuerberater XYZ",
      "parent-partner-tenant-id",
      "Sollte nicht greifen",
    );
    expect(result).toBe("Steuerberater XYZ");
  });

  it("Default-Resolver-Return + parent_partner_tenant_id=null → branding.displayName bleibt (kein Lookup-Pfad)", () => {
    const result = applyPartnerDisplayNameFallback(
      STRATEGAIZE_DEFAULT_BRANDING.displayName,
      null,
      "Sollte nicht greifen",
    );
    expect(result).toBe(STRATEGAIZE_DEFAULT_BRANDING.displayName);
  });
});
