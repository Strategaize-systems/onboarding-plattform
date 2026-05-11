/**
 * V6 SLC-101 — zentrale DB-Typen fuer Multiplikator-Foundation.
 *
 * Spiegelt das Schema aus Migration 090 (`090_v6_partner_tenant_foundation.sql`)
 * sowie die Rollen-Erweiterung in `profiles.role` und `handle_new_user`.
 *
 * Bestehende lose Literale (z.B. in v5-walkthrough-rls.test.ts oder admin/team)
 * werden NICHT refaktoriert — V6 fuehrt diese Typen additiv ein, um neue
 * Slices (SLC-102..106) ohne Stringly-Typing aufzubauen.
 */

// ============================================================
// Rollen
// ============================================================

export type UserRole =
  | "strategaize_admin"
  | "tenant_admin"
  | "tenant_member"
  | "employee"
  | "partner_admin";

// ============================================================
// Tenant + tenant_kind
// ============================================================

export type TenantKind = "direct_client" | "partner_organization" | "partner_client";

export interface Tenant {
  id: string;
  name: string;
  language: "de" | "en" | "nl";
  tenant_kind: TenantKind;
  /**
   * Nur gesetzt fuer tenant_kind='partner_client'. Verweist auf den
   * Partner-Tenant, der den Mandanten eingeladen hat.
   */
  parent_partner_tenant_id: string | null;
  created_at: string;
  created_by: string | null;
}

// ============================================================
// partner_organization (Stammdaten Steuerberater-Kanzlei)
// ============================================================

export type PartnerKind = "tax_advisor";
export type PartnerCountry = "DE" | "NL";

export interface PartnerOrganization {
  id: string;
  /** 1:1 mit tenants.id, UNIQUE. */
  tenant_id: string;
  legal_name: string;
  display_name: string;
  partner_kind: PartnerKind;
  /** V6 immer NULL — V3+ Tier-System (DEC-111). */
  tier: string | null;
  contact_email: string;
  contact_phone: string | null;
  country: PartnerCountry;
  created_by_admin_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// partner_client_mapping (Sichtbarkeits-Layer)
// ============================================================

export type InvitationStatus = "invited" | "accepted" | "revoked";

export interface PartnerClientMapping {
  id: string;
  /** tenants.id mit tenant_kind='partner_organization'. */
  partner_tenant_id: string;
  /** tenants.id mit tenant_kind='partner_client'. */
  client_tenant_id: string;
  invited_by_user_id: string | null;
  invitation_status: InvitationStatus;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}
