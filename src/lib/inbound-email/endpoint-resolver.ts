// V9.1 SLC-V9.1-A MT-R4 — Default-Endpoint-Resolver (DEC-R1-2).
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer + IMAP-Sync (REVISION R1)
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-R4)
//
// Der IMAP-Sync (MT-R5) zieht Mails aus EINEM IONOS-Postfach (Single-Mailbox-Modus)
// und muss sie einem email_inbound_endpoint-Row zuordnen. resolveDefaultEndpoint()
// liefert diesen Default-Endpoint nach DEC-R1-2:
//   1. ENV INBOUND_DEFAULT_ENDPOINT_SLUG gesetzt -> lookupEndpointBySlug (Reuse).
//   2. sonst SELECT die einzige status='active'-Row in email_inbound_endpoint.
// Ambiguitaet (0 oder >1 aktive Rows ohne ENV-Slug) -> null + captureWarning (Abort).
//
// Der mode='single_mailbox' steuert die tolerante Setup-Token-Logik in MT-R5
// (DEC-R1-3): forwarded Mails tragen keinen Forward-Token-Header.

import { captureWarning } from "../logger";
import type { createAdminClient } from "../supabase/admin";
import { lookupEndpointBySlug } from "./tenant-lookup";
import type { ResolvedEndpoint, TenantLookupResult } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

const LOG_SOURCE = "email_inbound:endpoint-resolver";

/**
 * Loest den Default-Endpoint fuer den IMAP-Sync auf (DEC-R1-2).
 *
 * @returns ResolvedEndpoint (mode='single_mailbox') oder null bei Ambiguitaet
 *          (0/>1 aktive Rows ohne ENV-Slug) bzw. fehlendem ENV-Slug-Endpoint.
 */
export async function resolveDefaultEndpoint(
  admin: AdminClient,
): Promise<ResolvedEndpoint | null> {
  const envSlug = process.env.INBOUND_DEFAULT_ENDPOINT_SLUG?.trim();

  // Pfad 1: ENV-Slug zuerst (deckt heute Founder-Setup + spaetere Catchall-Migration).
  if (envSlug) {
    const endpoint = await lookupEndpointBySlug(admin, envSlug);
    if (!endpoint) {
      captureWarning(
        `resolveDefaultEndpoint: INBOUND_DEFAULT_ENDPOINT_SLUG='${envSlug}' resolved to no endpoint`,
        { source: LOG_SOURCE, metadata: { slug: envSlug } },
      );
      return null;
    }
    return { ...endpoint, mode: "single_mailbox" };
  }

  // Pfad 2: einzige status='active'-Row in email_inbound_endpoint.
  const { data, error } = await admin
    .from("email_inbound_endpoint")
    .select("id, tenant_id, slug, setup_token, status")
    .eq("status", "active");
  if (error) {
    throw new Error(
      `resolveDefaultEndpoint: email_inbound_endpoint SELECT failed: ${error.message}`,
    );
  }

  const rows = (data ?? []) as Array<{
    id: string;
    tenant_id: string;
    slug: string;
    setup_token: string;
    status: TenantLookupResult["status"];
  }>;

  if (rows.length === 0) {
    captureWarning(
      "resolveDefaultEndpoint: no active email_inbound_endpoint and no INBOUND_DEFAULT_ENDPOINT_SLUG set",
      { source: LOG_SOURCE, metadata: { activeCount: 0 } },
    );
    return null;
  }
  if (rows.length > 1) {
    captureWarning(
      `resolveDefaultEndpoint: ${rows.length} active email_inbound_endpoint rows — ambiguous, set INBOUND_DEFAULT_ENDPOINT_SLUG`,
      { source: LOG_SOURCE, metadata: { activeCount: rows.length } },
    );
    return null;
  }

  const row = rows[0];
  return {
    endpointId: row.id,
    tenantId: row.tenant_id,
    slug: row.slug,
    setupToken: row.setup_token,
    status: row.status,
    mode: "single_mailbox",
  };
}
