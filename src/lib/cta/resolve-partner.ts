// V8.1.1 SLC-164 — Partner-Resolution via Tenant-Chain.
//
// Hintergrund: V8.1 SLC-163 CTA-Mechanik hat `session.partner_organization_id`
// gelesen — diese Spalte existiert nicht im Schema (ISSUE-086, Bug A).
// Zusaetzlich wurde `partner_organization.name` selektiert — auch nicht
// vorhanden (Bug B, durch Bug A maskiert; Schema kennt `display_name`).
//
// Schema-Wahrheit (Coolify-DB verified 2026-06-01):
//   capture_session.tenant_id (NOT NULL)
//     -> tenants.parent_partner_tenant_id (uuid, NULLABLE)
//        CHECK tenants_parent_partner_consistency:
//          tenant_kind='partner_client' AND parent_partner_tenant_id IS NOT NULL
//          OR tenant_kind <> 'partner_client' AND parent_partner_tenant_id IS NULL
//     -> partner_organization.tenant_id (NOT NULL, UNIQUE)
//        Spalten: id, tenant_id, legal_name, display_name (NOT NULL), contact_email (NOT NULL)
//
// Pattern bereits korrekt in V7.2 sendDiagnoseReportByEmail (bericht/actions.ts:158-167)
// — wurde in V8.1 nicht wiederverwendet. Helper-Extraktion verhindert kuenftige
// Drift (Pattern aus strategaize-pattern-reuse.md).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ResolvedPartner {
  id: string;
  /** Equivalent zu partner_organization.display_name (Bug B Fix). */
  name: string;
  /** partner_organization.contact_email kann leer-String oder null sein
   * (Empty wird vom Dual-Email-Orchestrator als no_email-Skip behandelt). */
  contact_email: string | null;
}

/**
 * Loest partner_organization fuer einen Mandanten-Capture-Session via
 * Tenant-Chain auf. Returns `null` wenn:
 * - Mandant-tenant nicht existiert, ODER
 * - Mandant ist direct_client (parent_partner_tenant_id IS NULL), ODER
 * - Partner-row fehlt (Daten-Konsistenz-Drift).
 *
 * Idempotent + side-effect-frei (2 SELECTs, kein Write).
 */
export async function resolvePartnerForCaptureSession(
  admin: SupabaseClient,
  captureSession: { tenant_id: string },
): Promise<ResolvedPartner | null> {
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("parent_partner_tenant_id")
    .eq("id", captureSession.tenant_id)
    .maybeSingle();

  if (!tenantRow || !tenantRow.parent_partner_tenant_id) {
    return null;
  }

  const { data: partnerRow } = await admin
    .from("partner_organization")
    .select("id, display_name, contact_email")
    .eq("tenant_id", tenantRow.parent_partner_tenant_id)
    .maybeSingle();

  if (!partnerRow) {
    return null;
  }

  return {
    id: partnerRow.id as string,
    name: partnerRow.display_name as string,
    contact_email: (partnerRow.contact_email as string | null) ?? null,
  };
}
