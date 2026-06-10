// V9.1 SLC-V9.1-A MT-4 — Tenant-Lookup via Catchall-Local-Part (DEC-200).
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-4, Flow A Schritt 3)
//
// Recipient-Format: `bulk-<slug>@<INBOUND_CATCHALL_DOMAIN>`. Der Local-Part-Slug
// (32-byte URL-safe random, provisioniert in SLC-V9.1-D) resolved auf einen
// email_inbound_endpoint-Row -> tenant_id + setup_token + status.
//
// parseRecipientSlug() ist pure (offline-testbar). lookupEndpointBySlug() macht den
// DB-Roundtrip via service_role (System-Pfad, bypass RLS).

import type { createAdminClient } from "../supabase/admin";
import type { TenantLookupResult } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

const CATCHALL_PREFIX = "bulk-";

/**
 * Extrahiert den Endpoint-Slug aus der Recipient-Adresse.
 * `bulk-acme@bulk.strategaizetransition.com` -> `acme`.
 * Returns null bei fehlendem `bulk-`-Prefix, leerem Slug oder Malformed-Adresse.
 */
export function parseRecipientSlug(recipient: string | null | undefined): string | null {
  if (typeof recipient !== "string") return null;
  const at = recipient.indexOf("@");
  if (at <= 0) return null;
  const localPart = recipient.slice(0, at).toLowerCase().trim();
  if (!localPart.startsWith(CATCHALL_PREFIX)) return null;
  const slug = localPart.slice(CATCHALL_PREFIX.length);
  if (slug.length === 0) return null;
  return slug;
}

/**
 * Resolved den Slug auf einen email_inbound_endpoint-Row. Returns null wenn kein
 * Endpoint existiert (Caller mappt auf reject_layer='tenant_not_found').
 */
export async function lookupEndpointBySlug(
  admin: AdminClient,
  slug: string,
): Promise<TenantLookupResult | null> {
  const { data, error } = await admin
    .from("email_inbound_endpoint")
    .select("id, tenant_id, slug, setup_token, status")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    throw new Error(
      `tenant-lookup: email_inbound_endpoint SELECT failed for slug='${slug}': ${error.message}`,
    );
  }
  if (!data) return null;
  return {
    endpointId: data.id as string,
    tenantId: data.tenant_id as string,
    slug: data.slug as string,
    setupToken: data.setup_token as string,
    status: data.status as TenantLookupResult["status"],
  };
}
