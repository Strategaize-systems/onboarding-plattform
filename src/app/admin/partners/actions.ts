"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmployeeInvitationEmail } from "@/lib/email";
import { captureException, captureInfo } from "@/lib/logger";
import { revalidatePath } from "next/cache";

import type { PartnerCountry, UserRole } from "@/types/db";

/**
 * V6 SLC-102 MT-1 — Server Actions fuer Partner-Verwaltung (strategaize_admin).
 *
 * Deviation-Note vs. Slice MT-1 "BEGIN TX":
 *   Supabase/PostgREST kann ueber den HTTP-Client keine Multi-Statement-Transaction
 *   ohne eigene SECURITY-DEFINER-RPC ausdruecken. Migration 090 enthaelt KEINE
 *   solche RPC (Scope = Foundation + RLS + Trigger). Statt einer neuen Migration
 *   in MT-1 zu erzwingen, verwendet `createPartnerOrganization` ein
 *   **Compensating-Action-Pattern**: 2-Phasen-INSERT mit explizitem Cleanup
 *   bei Partial-Failure. Erfuellt AC #2 ("kein Orphan-Tenant") funktional
 *   identisch — der DELETE der tenants-Row wird durch ON DELETE CASCADE auf
 *   partner_organization automatisch aufgeraeumt, falls Step 2 selbst eine
 *   Row geschrieben hat und erst Step 3 (error_log) faellt. Ein dedizierter
 *   RPC ist als Backlog-Item fuer V6.1 vorgesehen, falls in der Praxis
 *   Partial-Failure-Pfade haeufig sind.
 */

type ActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function sanitizeText(raw: FormDataEntryValue | null): string {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function sanitizeNullable(raw: FormDataEntryValue | null): string | null {
  const v = sanitizeText(raw);
  return v.length > 0 ? v : null;
}

const COUNTRY_VALUES: ReadonlyArray<PartnerCountry> = ["DE", "NL"] as const;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f-]{36}$/i;

async function requireStrategaizeAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as UserRole | undefined;
  if (role !== "strategaize_admin") return { ok: false, error: "forbidden" };
  return { ok: true, userId: user.id };
}

// ============================================================
// createPartnerOrganization (strategaize_admin)
// ============================================================

export async function createPartnerOrganization(
  formData: FormData,
): Promise<ActionResult<{ partnerTenantId: string }>> {
  const legalName = sanitizeText(formData.get("legal_name"));
  const displayNameRaw = sanitizeText(formData.get("display_name"));
  const displayName = displayNameRaw.length > 0 ? displayNameRaw : legalName;
  const contactEmail = sanitizeText(formData.get("contact_email")).toLowerCase();
  const contactPhone = sanitizeNullable(formData.get("contact_phone"));
  const countryRaw = sanitizeText(formData.get("country"));

  if (!legalName) return { ok: false, error: "legal_name_required" };
  if (!contactEmail || !EMAIL_REGEX.test(contactEmail)) {
    return { ok: false, error: "invalid_email" };
  }
  if (!COUNTRY_VALUES.includes(countryRaw as PartnerCountry)) {
    return { ok: false, error: "invalid_country" };
  }
  const country = countryRaw as PartnerCountry;

  const authCheck = await requireStrategaizeAdmin();
  if (!authCheck.ok) return authCheck;
  const adminUserId = authCheck.userId;

  const admin = createAdminClient();

  // Phase 1 — tenants INSERT
  const { data: tenantRow, error: tenantErr } = await admin
    .from("tenants")
    .insert({
      name: displayName,
      language: country === "NL" ? "nl" : "de",
      tenant_kind: "partner_organization",
      parent_partner_tenant_id: null,
      created_by: adminUserId,
    })
    .select("id")
    .single();

  if (tenantErr || !tenantRow) {
    captureException(
      new Error(tenantErr?.message ?? "tenants insert returned no row"),
      {
        source: "admin/partners/createPartnerOrganization/tenants",
        userId: adminUserId,
        metadata: { legalName, country },
      },
    );
    return { ok: false, error: "tenant_insert_failed" };
  }

  // Phase 2 — partner_organization INSERT (Compensating Action bei Fehler)
  const { error: poErr } = await admin.from("partner_organization").insert({
    tenant_id: tenantRow.id,
    legal_name: legalName,
    display_name: displayName,
    partner_kind: "tax_advisor",
    tier: null,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    country,
    created_by_admin_user_id: adminUserId,
  });

  if (poErr) {
    // Compensating Action — Orphan-Tenant entfernen (Slice AC #2)
    const { error: deleteErr } = await admin
      .from("tenants")
      .delete()
      .eq("id", tenantRow.id);
    if (deleteErr) {
      captureException(new Error(deleteErr.message), {
        source: "admin/partners/createPartnerOrganization/compensatingDelete",
        userId: adminUserId,
        metadata: { tenant_id: tenantRow.id, legalName },
      });
    }
    captureException(new Error(poErr.message), {
      source: "admin/partners/createPartnerOrganization/partner_organization",
      userId: adminUserId,
      metadata: { tenant_id: tenantRow.id, legalName },
    });
    return { ok: false, error: "partner_organization_insert_failed" };
  }

  // Phase 3 — Audit-Log (best-effort, nicht-blockend)
  captureInfo(`Partner-Organisation '${legalName}' angelegt`, {
    source: "admin/partners/createPartnerOrganization",
    userId: adminUserId,
    metadata: {
      category: "partner_organization_created",
      partner_tenant_id: tenantRow.id,
      legal_name: legalName,
      country,
    },
  });

  // TODO SLC-104 — INSERT partner_branding_config wenn Tabelle existiert
  // (Default-Strategaize-Blau #2563eb, logo_url=NULL).

  revalidatePath("/admin/partners");
  return { ok: true, partnerTenantId: tenantRow.id };
}

// ============================================================
// invitePartnerAdmin (strategaize_admin)
// ============================================================

export async function invitePartnerAdmin(
  formData: FormData,
): Promise<ActionResult<{ invitationId: string; emailFailed?: boolean }>> {
  const partnerTenantId = sanitizeText(formData.get("partner_tenant_id"));
  const email = sanitizeText(formData.get("email")).toLowerCase();
  const firstName = sanitizeNullable(formData.get("first_name"));
  const lastName = sanitizeNullable(formData.get("last_name"));

  if (!partnerTenantId || !UUID_REGEX.test(partnerTenantId)) {
    return { ok: false, error: "invalid_partner_tenant_id" };
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: false, error: "invalid_email" };
  }

  const authCheck = await requireStrategaizeAdmin();
  if (!authCheck.ok) return authCheck;
  const adminUserId = authCheck.userId;

  const admin = createAdminClient();

  // Cross-Check: partner_tenant_id muss tenant_kind='partner_organization' sein
  const { data: tenantRow, error: tenantErr } = await admin
    .from("tenants")
    .select("id, name, language, tenant_kind")
    .eq("id", partnerTenantId)
    .single();
  if (tenantErr || !tenantRow) {
    return { ok: false, error: "partner_tenant_not_found" };
  }
  if (tenantRow.tenant_kind !== "partner_organization") {
    return { ok: false, error: "tenant_not_partner_organization" };
  }

  // 32-Byte Token (64-hex) — analog rpc_create_employee_invitation
  const tokenBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

  const displayName =
    [firstName, lastName].filter((v): v is string => Boolean(v)).join(" ") ||
    null;
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000);

  const { data: invRow, error: invErr } = await admin
    .from("employee_invitation")
    .insert({
      tenant_id: partnerTenantId,
      email,
      display_name: displayName,
      role_hint: "partner_admin",
      invitation_token: token,
      invited_by_user_id: adminUserId,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (invErr || !invRow) {
    // Postgres UNIQUE-Violation Code = 23505
    if (invErr && (invErr as { code?: string }).code === "23505") {
      return { ok: false, error: "duplicate_pending_invitation" };
    }
    captureException(
      new Error(invErr?.message ?? "invitation insert returned no row"),
      {
        source: "admin/partners/invitePartnerAdmin/insert",
        userId: adminUserId,
        metadata: { partnerTenantId, email },
      },
    );
    return { ok: false, error: "invitation_insert_failed" };
  }

  // Audit-Log
  captureInfo(`Partner-Admin '${email}' fuer Partner ${tenantRow.name} eingeladen`, {
    source: "admin/partners/invitePartnerAdmin",
    userId: adminUserId,
    metadata: {
      category: "partner_admin_invited",
      partner_tenant_id: partnerTenantId,
      invitation_id: invRow.id,
      email,
    },
  });

  // E-Mail (best-effort — bei Fehler bleibt invitation pending, Resend-Pfad ist SLC-103-Item)
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const inviteUrl = `${baseUrl}/accept-invitation/${token}`;
  const tenantName = tenantRow.name;
  const locale =
    typeof tenantRow.language === "string" ? tenantRow.language : "de";

  try {
    await sendEmployeeInvitationEmail({
      to: email,
      tenantName,
      inviteUrl,
      expiresAt,
      displayName,
      roleHint: "Partner-Administrator",
      locale,
    });
  } catch (err) {
    captureException(err, {
      source: "admin/partners/invitePartnerAdmin/sendMail",
      userId: adminUserId,
      metadata: { invitationId: invRow.id, email },
    });
    revalidatePath(`/admin/partners/${partnerTenantId}`);
    return { ok: true, invitationId: invRow.id, emailFailed: true };
  }

  revalidatePath(`/admin/partners/${partnerTenantId}`);
  return { ok: true, invitationId: invRow.id };
}
