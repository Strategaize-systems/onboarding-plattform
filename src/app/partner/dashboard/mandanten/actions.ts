"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMandantInvitationEmail } from "@/lib/email";
import { captureException, captureInfo } from "@/lib/logger";
import { revalidatePath } from "next/cache";

import type { UserRole } from "@/types/db";

/**
 * V6 SLC-103 MT-1..MT-3 — Server Actions fuer Mandanten-Einladung (partner_admin).
 *
 * Drei Actions:
 *   - inviteMandant            (partner_admin → neuer partner_client-Tenant + Mapping + Invitation + Mail)
 *   - revokeMandantInvitation  (partner_admin → Mapping=revoked + Invitation=revoked)
 *   (acceptMandantInvitation laeuft via /accept-invitation/[token]/actions.ts —
 *    existierender Flow mit Branch fuer role_hint='tenant_admin')
 *
 * Atomare TX:
 *   Supabase/PostgREST kann keine Multi-Statement-TX. inviteMandant verwendet
 *   das Compensating-Action-Pattern (analog createPartnerOrganization in
 *   admin/partners/actions.ts): 3-Phasen-Insert (tenants → mapping →
 *   employee_invitation) mit Rollback der vorhergehenden Steps wenn ein
 *   nachfolgender Step fehlschlaegt.
 *
 * Duplicate-Check:
 *   "Mandant bereits eingeladen" wird via SELECT auf employee_invitation x
 *   partner_client_mapping geprueft (pcm.partner=this AND ei.email=this AND
 *   ei.status=pending AND pcm.invitation_status=invited).
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f-]{36}$/i;

async function requirePartnerAdmin(): Promise<
  { ok: true; userId: string; tenantId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  const role = profile?.role as UserRole | undefined;
  if (role !== "partner_admin") return { ok: false, error: "forbidden" };
  if (!profile?.tenant_id) return { ok: false, error: "no_tenant" };
  return { ok: true, userId: user.id, tenantId: profile.tenant_id };
}

// ============================================================
// inviteMandant (partner_admin)
// ============================================================

interface InviteMandantInput {
  mandantEmail: string;
  mandantCompanyName: string;
  mandantFirstName: string;
  mandantLastName: string;
}

function parseInviteMandantInput(formData: FormData): InviteMandantInput | { error: string } {
  const mandantCompanyName = sanitizeText(formData.get("mandant_company_name"));
  const mandantEmail = sanitizeText(formData.get("mandant_email")).toLowerCase();
  const mandantFirstName = sanitizeText(formData.get("mandant_first_name"));
  const mandantLastName = sanitizeText(formData.get("mandant_last_name"));

  if (!mandantCompanyName) return { error: "mandant_company_name_required" };
  if (!mandantEmail || !EMAIL_REGEX.test(mandantEmail)) {
    return { error: "invalid_mandant_email" };
  }
  if (!mandantFirstName) return { error: "mandant_first_name_required" };
  if (!mandantLastName) return { error: "mandant_last_name_required" };

  return { mandantCompanyName, mandantEmail, mandantFirstName, mandantLastName };
}

export async function inviteMandant(
  formData: FormData,
): Promise<ActionResult<{ mappingId: string; mandantTenantId: string; emailFailed?: boolean }>> {
  const parsed = parseInviteMandantInput(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const authCheck = await requirePartnerAdmin();
  if (!authCheck.ok) return authCheck;
  const { userId, tenantId: partnerTenantId } = authCheck;

  const admin = createAdminClient();

  // Cross-Tenant-Verifikation + Sprache fuer neuen Mandant ableiten
  const { data: partner, error: partnerErr } = await admin
    .from("partner_organization")
    .select("display_name, country")
    .eq("tenant_id", partnerTenantId)
    .single();
  if (partnerErr || !partner) {
    captureException(new Error(partnerErr?.message ?? "partner_organization not found"), {
      source: "partner/dashboard/mandanten/inviteMandant/loadPartner",
      userId,
      metadata: { partnerTenantId },
    });
    return { ok: false, error: "partner_not_found" };
  }
  const partnerLanguage = partner.country === "NL" ? "nl" : "de";

  // Duplicate-Check: existiert bereits eine pending-Einladung mit dieser E-Mail
  // unter diesem Partner?
  const { data: existingMappings, error: existingErr } = await admin
    .from("partner_client_mapping")
    .select("id, client_tenant_id")
    .eq("partner_tenant_id", partnerTenantId)
    .eq("invitation_status", "invited");

  if (existingErr) {
    captureException(new Error(existingErr.message), {
      source: "partner/dashboard/mandanten/inviteMandant/dupCheckMapping",
      userId,
      metadata: { partnerTenantId },
    });
    return { ok: false, error: "duplicate_check_failed" };
  }

  if (existingMappings && existingMappings.length > 0) {
    const clientIds = existingMappings.map((m) => m.client_tenant_id);
    const { data: pendingInvs, error: dupErr } = await admin
      .from("employee_invitation")
      .select("id")
      .in("tenant_id", clientIds)
      .eq("status", "pending")
      .ilike("email", parsed.mandantEmail);

    if (dupErr) {
      captureException(new Error(dupErr.message), {
        source: "partner/dashboard/mandanten/inviteMandant/dupCheckInvitation",
        userId,
        metadata: { partnerTenantId },
      });
      return { ok: false, error: "duplicate_check_failed" };
    }
    if (pendingInvs && pendingInvs.length > 0) {
      return { ok: false, error: "mandant_already_invited" };
    }
  }

  // Phase 1 — tenants INSERT (partner_client mit parent_partner_tenant_id)
  const { data: tenantRow, error: tenantErr } = await admin
    .from("tenants")
    .insert({
      name: parsed.mandantCompanyName,
      language: partnerLanguage,
      tenant_kind: "partner_client",
      parent_partner_tenant_id: partnerTenantId,
      created_by: userId,
    })
    .select("id")
    .single();

  if (tenantErr || !tenantRow) {
    captureException(new Error(tenantErr?.message ?? "tenants insert returned no row"), {
      source: "partner/dashboard/mandanten/inviteMandant/tenants",
      userId,
      metadata: { partnerTenantId, mandantEmail: parsed.mandantEmail },
    });
    return { ok: false, error: "tenant_insert_failed" };
  }
  const mandantTenantId = tenantRow.id;

  // Phase 2 — partner_client_mapping INSERT (Trigger prueft tenant_kinds)
  const { data: mapRow, error: mapErr } = await admin
    .from("partner_client_mapping")
    .insert({
      partner_tenant_id: partnerTenantId,
      client_tenant_id: mandantTenantId,
      invited_by_user_id: userId,
      invitation_status: "invited",
    })
    .select("id")
    .single();

  if (mapErr || !mapRow) {
    captureException(new Error(mapErr?.message ?? "mapping insert returned no row"), {
      source: "partner/dashboard/mandanten/inviteMandant/mapping",
      userId,
      metadata: { partnerTenantId, mandantTenantId },
    });
    // Compensating Delete (tenants)
    await admin.from("tenants").delete().eq("id", mandantTenantId);
    return { ok: false, error: "mapping_insert_failed" };
  }
  const mappingId = mapRow.id;

  // Phase 3 — employee_invitation INSERT (role_hint='tenant_admin', tenant_id=mandantTenantId)
  const tokenBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  const displayName = `${parsed.mandantFirstName} ${parsed.mandantLastName}`.trim();
  const expiresAt = new Date(Date.now() + 14 * 24 * 3600_000);

  const { data: invRow, error: invErr } = await admin
    .from("employee_invitation")
    .insert({
      tenant_id: mandantTenantId,
      email: parsed.mandantEmail,
      display_name: displayName,
      role_hint: "tenant_admin",
      invitation_token: token,
      invited_by_user_id: userId,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (invErr || !invRow) {
    captureException(new Error(invErr?.message ?? "invitation insert returned no row"), {
      source: "partner/dashboard/mandanten/inviteMandant/invitation",
      userId,
      metadata: { partnerTenantId, mandantTenantId, mappingId },
    });
    // Compensating Deletes (mapping + tenants)
    await admin.from("partner_client_mapping").delete().eq("id", mappingId);
    await admin.from("tenants").delete().eq("id", mandantTenantId);
    return { ok: false, error: "invitation_insert_failed" };
  }

  // Audit-Log
  captureInfo(
    `Mandant '${parsed.mandantEmail}' fuer Partner ${partner.display_name} eingeladen`,
    {
      source: "partner/dashboard/mandanten/inviteMandant",
      userId,
      metadata: {
        category: "partner_mandant_invited",
        partner_tenant_id: partnerTenantId,
        mandant_tenant_id: mandantTenantId,
        mandant_email: parsed.mandantEmail,
        mapping_id: mappingId,
      },
    },
  );

  // E-Mail-Versand (best-effort)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const inviteUrl = `${baseUrl}/accept-invitation/${token}`;

  try {
    await sendMandantInvitationEmail({
      to: parsed.mandantEmail,
      partnerDisplayName: partner.display_name,
      inviteUrl,
      expiresAt,
      displayName,
      locale: partnerLanguage,
    });
  } catch (err) {
    captureException(err, {
      source: "partner/dashboard/mandanten/inviteMandant/sendMail",
      userId,
      metadata: { mappingId, mandantEmail: parsed.mandantEmail },
    });
    revalidatePath("/partner/dashboard");
    revalidatePath("/partner/dashboard/mandanten");
    return { ok: true, mappingId, mandantTenantId, emailFailed: true };
  }

  revalidatePath("/partner/dashboard");
  revalidatePath("/partner/dashboard/mandanten");
  return { ok: true, mappingId, mandantTenantId };
}

// ============================================================
// revokeMandantInvitation (partner_admin)
// ============================================================

export async function revokeMandantInvitation(
  formData: FormData,
): Promise<ActionResult> {
  const mappingId = sanitizeText(formData.get("mapping_id"));
  if (!mappingId || !UUID_REGEX.test(mappingId)) {
    return { ok: false, error: "invalid_mapping_id" };
  }

  const authCheck = await requirePartnerAdmin();
  if (!authCheck.ok) return authCheck;
  const { userId, tenantId: partnerTenantId } = authCheck;

  const admin = createAdminClient();

  // Mapping laden + Owner-Check (Cross-Tenant-Schutz)
  const { data: mapping, error: mapErr } = await admin
    .from("partner_client_mapping")
    .select("id, partner_tenant_id, client_tenant_id, invitation_status")
    .eq("id", mappingId)
    .maybeSingle();

  if (mapErr) {
    captureException(new Error(mapErr.message), {
      source: "partner/dashboard/mandanten/revokeMandantInvitation/loadMapping",
      userId,
      metadata: { mappingId },
    });
    return { ok: false, error: "load_failed" };
  }
  if (!mapping) return { ok: false, error: "mapping_not_found" };
  if (mapping.partner_tenant_id !== partnerTenantId) {
    return { ok: false, error: "forbidden" };
  }
  if (mapping.invitation_status === "accepted") {
    return { ok: false, error: "already_accepted" };
  }
  if (mapping.invitation_status === "revoked") {
    return { ok: false, error: "already_revoked" };
  }
  if (mapping.invitation_status !== "invited") {
    return { ok: false, error: "invalid_status" };
  }

  const nowIso = new Date().toISOString();

  // Mapping → revoked
  const { error: updMapErr } = await admin
    .from("partner_client_mapping")
    .update({ invitation_status: "revoked", revoked_at: nowIso })
    .eq("id", mappingId);

  if (updMapErr) {
    captureException(new Error(updMapErr.message), {
      source: "partner/dashboard/mandanten/revokeMandantInvitation/updateMapping",
      userId,
      metadata: { mappingId },
    });
    return { ok: false, error: "update_mapping_failed" };
  }

  // Magic-Link-Token invalidieren (employee_invitation.status='revoked' fuer
  // den Mandanten-Tenant, tenant_admin-Hint, status=pending).
  const { error: updInvErr } = await admin
    .from("employee_invitation")
    .update({ status: "revoked" })
    .eq("tenant_id", mapping.client_tenant_id)
    .eq("role_hint", "tenant_admin")
    .eq("status", "pending");

  if (updInvErr) {
    // Nicht-blockend: Mapping ist bereits revoked, das ist Source-of-Truth.
    captureException(new Error(updInvErr.message), {
      source: "partner/dashboard/mandanten/revokeMandantInvitation/updateInvitation",
      userId,
      metadata: { mappingId, mandantTenantId: mapping.client_tenant_id },
    });
  }

  captureInfo(`Mandanten-Einladung widerrufen (mapping=${mappingId})`, {
    source: "partner/dashboard/mandanten/revokeMandantInvitation",
    userId,
    metadata: {
      category: "partner_mandant_revoked",
      partner_tenant_id: partnerTenantId,
      mandant_tenant_id: mapping.client_tenant_id,
      mapping_id: mappingId,
    },
  });

  revalidatePath("/partner/dashboard");
  revalidatePath("/partner/dashboard/mandanten");
  return { ok: true };
}
