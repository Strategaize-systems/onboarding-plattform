// V7.1 SLC-137 MT-4 — partnerOrgId-Resolver fuer TextOverrideProvider.
//
// Mappt einen tenant_id (Mandant oder Partner-Tenant) auf seine
// partner_organization.id. Stuetzt sich auf `tenant_to_partner_view`
// aus Migration 101 (V7.1 SLC-136), die diese Zuordnung view-basiert
// fuer Mandanten und Partner-Tenants gleichermassen liefert.
//
// Direct-Clients (kein Partner) -> null.
// Strategaize-Admin in eigener tenant -> null (kein Partner-Scope).
//
// Wird ausschliesslich von TextOverrideProvider in Server-Components
// verwendet, daher direkter Supabase-Client-Aufruf (kein RPC noetig —
// die View ist read-only und mit SELECT-Grant fuer authenticated).

import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

export const resolvePartnerOrgIdForTenant = cache(async (
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<string | null> => {
  if (!tenantId) return null;
  try {
    const { data, error } = await supabase
      .from("tenant_to_partner_view")
      .select("partner_org_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error || !data) return null;
    return (data.partner_org_id as string | null) ?? null;
  } catch {
    return null;
  }
});
