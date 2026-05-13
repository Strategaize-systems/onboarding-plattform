"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException, captureInfo } from "@/lib/logger";
import { revalidatePath } from "next/cache";

import type { UserRole } from "@/types/db";

/**
 * V6 SLC-104 MT-8 — Server Actions fuer Partner-Branding (uploadLogo + updateBranding).
 *
 * Beide Actions sind partner_admin-only und schreiben ausschliesslich in die
 * EIGENE partner_branding_config-Row (Tenant-Filter via WHERE partner_tenant_id =
 * profile.tenant_id). Storage-Upload landet im EIGENEN Tenant-Folder
 * `partner-branding-assets/{partner_tenant_id}/logo.{ext}`.
 *
 * Defense-in-Depth (parallel zu Storage-RLS aus Migration 091):
 *   1. Inline-Auth-Check via requirePartnerAdmin (User existiert + role='partner_admin' + tenant_id).
 *   2. Tenant-Filter im UPDATE/UPSERT (partner_tenant_id = profile.tenant_id).
 *   3. Storage-Pfad-Praefix erzwungen (kein User-Input bestimmt Folder).
 *   4. RLS-Policies pbc_update_own_partner_admin / pbc_insert_own_partner_admin
 *      und partner_branding_assets_insert/update greifen zusaetzlich auf DB-Ebene,
 *      werden aber durch service_role-Client aus createAdminClient bewusst umgangen
 *      (notwendig weil Backfill-Row evtl. fehlt → INSERT noetig, RLS WITH CHECK
 *      pruft bereits dasselbe).
 *
 * Audit: error_log via captureInfo mit metadata.category in
 * 'partner_branding_logo_updated' | 'partner_branding_updated' (Pattern aus MT-5).
 */

type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;
const MAX_LOGO_BYTES = 500 * 1024; // 500 KiB = 512000 Byte, identisch Storage-Bucket-Limit aus Migration 091b
const ALLOWED_MIMES = ["image/png", "image/svg+xml", "image/jpeg"] as const;
type AllowedMime = (typeof ALLOWED_MIMES)[number];

const EXT_BY_MIME: Record<AllowedMime, string> = {
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/jpeg": "jpg",
};

function sanitizeText(raw: FormDataEntryValue | null): string {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function sanitizeNullable(raw: FormDataEntryValue | null): string | null {
  const v = sanitizeText(raw);
  return v.length > 0 ? v : null;
}

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

async function upsertBrandingPath(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  patch: Record<string, string | null>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1) UPDATE bevorzugen — Backfill aus Migration 091 hat Row angelegt.
  const { error: updErr, data: updRows } = await admin
    .from("partner_branding_config")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("partner_tenant_id", tenantId)
    .select("partner_tenant_id");

  if (updErr) {
    return { ok: false, error: updErr.message };
  }
  if (updRows && updRows.length > 0) return { ok: true };

  // 2) Edge-Case: Backfill hat diese Row nicht erfasst → INSERT.
  const { error: insErr } = await admin
    .from("partner_branding_config")
    .insert({ partner_tenant_id: tenantId, ...patch });

  if (insErr) {
    return { ok: false, error: insErr.message };
  }
  return { ok: true };
}

// ============================================================
// uploadLogo (partner_admin)
// ============================================================

export async function uploadLogo(formData: FormData): Promise<ActionResult> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "logo_required" };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "logo_too_large" };
  }
  const mime = file.type as AllowedMime;
  if (!ALLOWED_MIMES.includes(mime)) {
    return { ok: false, error: "logo_mime_unsupported" };
  }

  const authCheck = await requirePartnerAdmin();
  if (!authCheck.ok) return authCheck;
  const { userId, tenantId } = authCheck;

  const ext = EXT_BY_MIME[mime];
  const storagePath = `${tenantId}/logo.${ext}`;
  const admin = createAdminClient();

  const arrayBuffer = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from("partner-branding-assets")
    .upload(storagePath, arrayBuffer, {
      contentType: mime,
      upsert: true,
    });

  if (upErr) {
    captureException(new Error(upErr.message), {
      source: "partner/dashboard/branding/uploadLogo",
      userId,
      metadata: { tenantId, storagePath, mime, size: file.size },
    });
    return { ok: false, error: "logo_upload_failed" };
  }

  const dbResult = await upsertBrandingPath(admin, tenantId, {
    logo_url: storagePath,
  });
  if (!dbResult.ok) {
    captureException(new Error(dbResult.error), {
      source: "partner/dashboard/branding/uploadLogo",
      userId,
      metadata: { tenantId, storagePath },
    });
    return { ok: false, error: "logo_db_update_failed" };
  }

  captureInfo(
    `Partner-Branding Logo aktualisiert (tenant_id=${tenantId})`,
    {
      source: "partner/dashboard/branding/uploadLogo",
      userId,
      metadata: {
        category: "partner_branding_logo_updated",
        partner_tenant_id: tenantId,
        storage_path: storagePath,
        mime,
        size: file.size,
      },
    },
  );

  revalidatePath("/partner/dashboard/branding");
  revalidatePath("/partner/dashboard");
  return { ok: true };
}

// ============================================================
// updateBranding (partner_admin)
// ============================================================

export async function updateBranding(
  formData: FormData,
): Promise<ActionResult> {
  const primaryColor = sanitizeText(formData.get("primary_color"));
  const secondaryColor = sanitizeNullable(formData.get("secondary_color"));
  const displayName = sanitizeNullable(formData.get("display_name"));

  if (!primaryColor || !HEX_REGEX.test(primaryColor)) {
    return { ok: false, error: "primary_color_invalid" };
  }
  if (secondaryColor !== null && !HEX_REGEX.test(secondaryColor)) {
    return { ok: false, error: "secondary_color_invalid" };
  }

  const authCheck = await requirePartnerAdmin();
  if (!authCheck.ok) return authCheck;
  const { userId, tenantId } = authCheck;

  const admin = createAdminClient();

  const dbResult = await upsertBrandingPath(admin, tenantId, {
    primary_color: primaryColor,
    secondary_color: secondaryColor,
    display_name: displayName,
  });
  if (!dbResult.ok) {
    captureException(new Error(dbResult.error), {
      source: "partner/dashboard/branding/updateBranding",
      userId,
      metadata: { tenantId },
    });
    return { ok: false, error: "branding_update_failed" };
  }

  captureInfo(
    `Partner-Branding aktualisiert (tenant_id=${tenantId})`,
    {
      source: "partner/dashboard/branding/updateBranding",
      userId,
      metadata: {
        category: "partner_branding_updated",
        partner_tenant_id: tenantId,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        display_name: displayName,
      },
    },
  );

  revalidatePath("/partner/dashboard/branding");
  revalidatePath("/partner/dashboard");
  return { ok: true };
}
