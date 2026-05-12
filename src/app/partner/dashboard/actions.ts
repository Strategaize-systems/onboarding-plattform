"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException, captureInfo } from "@/lib/logger";
import { revalidatePath } from "next/cache";

import type { UserRole } from "@/types/db";

/**
 * V6 SLC-102 MT-5 — Server Action `updatePartnerStammdaten` (partner_admin).
 *
 * Erlaubt dem partner_admin, Stammdaten der EIGENEN Partner-Organisation zu
 * aktualisieren (display_name, contact_email, contact_phone). `legal_name` und
 * `country` bleiben read-only — diese sind rechtlich/strukturell und nur ueber
 * `/admin/partners/[id]` durch strategaize_admin aenderbar (V6.1+ koennte das
 * eine `updatePartnerStammdatenByAdmin`-Variante hinzufuegen).
 *
 * Defense-in-Depth:
 *   1. Inline-Auth-Check (User existiert + role='partner_admin').
 *   2. Cross-Tenant-Block: WHERE tenant_id = profile.tenant_id im UPDATE.
 *   3. RLS-Policy `po_update_own_partner_admin` macht denselben Check
 *      auf DB-Ebene (USING + WITH CHECK).
 *
 * Audit: error_log via captureInfo mit metadata.category='partner_stammdaten_updated'
 * (analog MT-1-Pattern, error_log hat keine eigene category-Spalte).
 */

type ActionResult =
  | { ok: true }
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
// updatePartnerStammdaten (partner_admin)
// ============================================================

export async function updatePartnerStammdaten(
  formData: FormData,
): Promise<ActionResult> {
  const displayName = sanitizeText(formData.get("display_name"));
  const contactEmail = sanitizeText(
    formData.get("contact_email"),
  ).toLowerCase();
  const contactPhone = sanitizeNullable(formData.get("contact_phone"));

  if (!displayName) return { ok: false, error: "display_name_required" };
  if (!contactEmail || !EMAIL_REGEX.test(contactEmail)) {
    return { ok: false, error: "invalid_email" };
  }

  const authCheck = await requirePartnerAdmin();
  if (!authCheck.ok) return authCheck;
  const { userId, tenantId } = authCheck;

  const admin = createAdminClient();

  const { error: updateErr, data: updated } = await admin
    .from("partner_organization")
    .update({
      display_name: displayName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .select("tenant_id")
    .maybeSingle();

  if (updateErr) {
    captureException(new Error(updateErr.message), {
      source: "partner/dashboard/updatePartnerStammdaten",
      userId,
      metadata: { tenantId },
    });
    return { ok: false, error: "update_failed" };
  }
  if (!updated) {
    // Sollte nicht passieren — partner_admin hat per Definition eine
    // partner_organization-Row mit seiner tenant_id. Defensiv.
    return { ok: false, error: "partner_not_found" };
  }

  captureInfo(
    `Partner-Stammdaten aktualisiert (tenant_id=${tenantId})`,
    {
      source: "partner/dashboard/updatePartnerStammdaten",
      userId,
      metadata: {
        category: "partner_stammdaten_updated",
        partner_tenant_id: tenantId,
      },
    },
  );

  revalidatePath("/partner/dashboard");
  revalidatePath("/partner/dashboard/stammdaten");
  return { ok: true };
}
