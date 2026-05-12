// V6 SLC-104 — Resolver Vitest (FEAT-044, MT-3)
//
// 4 Pflicht-Faelle + 2 Hex-Konversions-Faelle + 1 Fehler-Pfad = 7 Faelle.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveBrandingForTenant,
  hexToRgbTriplet,
  STRATEGAIZE_DEFAULT_BRANDING,
} from "../resolve";

interface RpcResult {
  data: unknown;
  error: { message: string } | null;
}

function mockClient(result: RpcResult): SupabaseClient {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  } as unknown as SupabaseClient;
}

describe("hexToRgbTriplet", () => {
  it("converts #2563eb to '37 99 235' (Strategaize-Blau)", () => {
    expect(hexToRgbTriplet("#2563eb")).toBe("37 99 235");
  });

  it("converts #FFFFFF (uppercase) to '255 255 255'", () => {
    expect(hexToRgbTriplet("#FFFFFF")).toBe("255 255 255");
  });

  it("converts #000000 to '0 0 0'", () => {
    expect(hexToRgbTriplet("#000000")).toBe("0 0 0");
  });

  it("falls back to Default-RGB for invalid hex", () => {
    expect(hexToRgbTriplet("not-a-hex")).toBe(STRATEGAIZE_DEFAULT_BRANDING.primaryColorRgb);
    expect(hexToRgbTriplet("#ABC")).toBe(STRATEGAIZE_DEFAULT_BRANDING.primaryColorRgb);
  });
});

describe("resolveBrandingForTenant", () => {
  it("Case 1: tenantId=null → Strategaize-Default", async () => {
    const supabase = mockClient({ data: null, error: null });
    const result = await resolveBrandingForTenant(supabase, null);

    expect(result).toEqual(STRATEGAIZE_DEFAULT_BRANDING);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("Case 2: partner_client mit parent → Parent-Branding via RPC", async () => {
    const supabase = mockClient({
      data: {
        logo_url: "partner-a/logo.png",
        primary_color: "#ff0000",
        secondary_color: null,
        display_name: "Kanzlei Mueller",
      },
      error: null,
    });

    const result = await resolveBrandingForTenant(supabase, "mandant-tenant-id");

    expect(result.primaryColor).toBe("#ff0000");
    expect(result.primaryColorRgb).toBe("255 0 0");
    expect(result.logoUrl).toBe("/api/partner-branding/mandant-tenant-id/logo");
    expect(result.displayName).toBe("Kanzlei Mueller");
    expect(result.secondaryColor).toBeNull();
    expect(supabase.rpc).toHaveBeenCalledWith("rpc_get_branding_for_tenant", {
      p_tenant_id: "mandant-tenant-id",
    });
  });

  it("Case 3: partner_organization → Eigene Branding via RPC", async () => {
    const supabase = mockClient({
      data: {
        logo_url: "partner-org/logo.svg",
        primary_color: "#00aaff",
        secondary_color: "#cccccc",
        display_name: "Steuerberater XYZ",
      },
      error: null,
    });

    const result = await resolveBrandingForTenant(supabase, "partner-tenant-id");

    expect(result.primaryColor).toBe("#00aaff");
    expect(result.primaryColorRgb).toBe("0 170 255");
    expect(result.logoUrl).toBe("/api/partner-branding/partner-tenant-id/logo");
    expect(result.secondaryColor).toBe("#cccccc");
    expect(result.displayName).toBe("Steuerberater XYZ");
  });

  it("Case 4: direct_client → RPC liefert Default-Payload (kein Logo)", async () => {
    const supabase = mockClient({
      data: {
        logo_url: null,
        primary_color: "#2563eb",
        secondary_color: null,
        display_name: "Strategaize",
      },
      error: null,
    });

    const result = await resolveBrandingForTenant(supabase, "direct-client-tenant-id");

    expect(result.primaryColor).toBe("#2563eb");
    expect(result.primaryColorRgb).toBe("37 99 235");
    expect(result.logoUrl).toBeNull();
    expect(result.displayName).toBe("Strategaize");
  });

  it("Case 5: RPC-Error → Strategaize-Default (R-104-1 Try/Catch)", async () => {
    const supabase = mockClient({
      data: null,
      error: { message: "rpc execution failed" },
    });

    const result = await resolveBrandingForTenant(supabase, "any-tenant-id");

    expect(result).toEqual(STRATEGAIZE_DEFAULT_BRANDING);
  });

  it("Case 6: RPC throws → Strategaize-Default (Defensive Try/Catch)", async () => {
    const supabase = {
      rpc: vi.fn().mockRejectedValue(new Error("network down")),
    } as unknown as SupabaseClient;

    const result = await resolveBrandingForTenant(supabase, "any-tenant-id");

    expect(result).toEqual(STRATEGAIZE_DEFAULT_BRANDING);
  });

  it("Case 7: tenant_id mit Sonderzeichen wird URL-encoded", async () => {
    const supabase = mockClient({
      data: {
        logo_url: "partner/x.png",
        primary_color: "#abcdef",
        secondary_color: null,
        display_name: "X",
      },
      error: null,
    });

    const tenantWithSpace = "tenant with space";
    const result = await resolveBrandingForTenant(supabase, tenantWithSpace);

    expect(result.logoUrl).toBe("/api/partner-branding/tenant%20with%20space/logo");
  });
});
