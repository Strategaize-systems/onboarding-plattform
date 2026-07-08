// V10.4 SLC-189 (FEAT-106) — Server-Actions: strategaize_berater anlegen + Tenants zuweisen.
//
// Nur strategaize_admin. Drei Actions:
//   - createBerater(email)               — Invite-Mail OHNE tenant_id (cross-tenant Rolle)
//   - assignBerater(beraterId, tenantId) — Zuweisung setzen (idempotent)
//   - unassignBerater(beraterId, tenantId) — Zuweisung entfernen
//
// Port-Quellen (Auth/Invite-Klasse, strategaize-pattern-reuse.md / P-040):
//   - src/app/api/admin/tenants/[tenantId]/invite/route.ts (generateLink type:"invite" +
//     eigener verifyUrl + SMTP-Versand statt GoTrue-URL) — Berater-Variante OHNE tenant_id.
//   - src/app/admin/partners/actions.ts (Server-Action-Gate + createAdminClient + captureInfo-Audit).
//   - BS cockpit/src/lib/auth/invite.ts (inviteUserAndCreateProfile-Muster).
//
// Gate: assertStrategaizeAdmin() (SLC-184) VOR jedem createAdminClient-Zugriff —
// Server-Actions sind eigenstaendige Entry-Points, das Page-Gate schuetzt sie NICHT
// (R-183-1 / security-audit-standard).
//
// 'use server'-Constraint: dieses File exportiert ausschliesslich async Functions +
// Types. Sync-Helper/Regex bleiben modul-intern (nicht exportiert).
"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { assertStrategaizeAdmin } from "@/lib/workspace/admin-gate";
import { sendInviteEmail } from "@/lib/email";
import { captureException, captureInfo } from "@/lib/logger";

export type ActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f-]{36}$/i;

// ============================================================
// MT-1 — createBerater (Invite ohne tenant_id)
// ============================================================

/**
 * Legt einen strategaize_berater-Account per Invite-Mail an. Der Invite traegt
 * KEIN tenant_id in den user_metadata -> handle_new_user (MIG-132) legt ein
 * Profile ohne tenant_id an (cross-tenant Rolle, wie strategaize_admin).
 * Zuweisung zu Kanzleien/Direkt-Kunden ist ein separater Schritt (assignBerater).
 */
export async function createBerater(
  email: string,
): Promise<ActionResult<{ emailFailed?: boolean }>> {
  const user = await assertStrategaizeAdmin();
  if (!user) return { ok: false, error: "unauthorized" };

  const emailLower = (email ?? "").trim().toLowerCase();
  if (!emailLower || !EMAIL_REGEX.test(emailLower)) {
    return { ok: false, error: "invalid_email" };
  }

  const admin = createAdminClient();

  // Existierenden User pruefen (targeted lookup ueber lowercase-Index).
  // Bestaetigt -> Konflikt; unbestaetigt -> alten User loeschen und neu einladen
  // (GoTrue re-created bei generateLink). Port aus invite/route.ts.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, role")
    .ilike("email", emailLower)
    .single();

  if (existingProfile) {
    const { data: authUser } = await admin.auth.admin.getUserById(
      existingProfile.id as string,
    );
    if (authUser?.user?.email_confirmed_at) {
      return { ok: false, error: "email_exists" };
    }
    await admin.auth.admin.deleteUser(existingProfile.id as string);
  }

  // generateLink statt inviteUserByEmail: GoTrue erzeugt verify-URLs mit dem
  // internen Docker-Host (supabase-kong). Wir holen das Token selbst und
  // versenden ueber unseren SMTP-Adapter. KEIN tenant_id in data (Berater-Variante).
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`;
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "invite",
      email: emailLower,
      options: {
        data: { role: "strategaize_berater" },
        redirectTo,
      },
    });

  if (linkError || !linkData) {
    captureException(
      new Error(linkError?.message ?? "generateLink returned no data"),
      { source: "admin/berater/createBerater/generateLink", userId: user.id },
    );
    return { ok: false, error: "link_failed" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const hashedToken = linkData.properties?.hashed_token;
  const verifyUrl = `${appUrl}/auth/callback?token_hash=${hashedToken}&type=invite&locale=de`;

  try {
    await sendInviteEmail({
      to: emailLower,
      tenantName: "StrategAIze Beratung",
      verifyUrl,
      locale: "de",
    });
  } catch (emailError) {
    captureException(emailError, {
      source: "admin/berater/createBerater/sendMail",
      userId: user.id,
    });
    // User ist angelegt, nur der Mail-Versand schlug fehl.
    return { ok: true, emailFailed: true };
  }

  captureInfo(`Berater '${emailLower}' eingeladen`, {
    source: "admin/berater/createBerater",
    userId: user.id,
    metadata: { category: "berater_invited", email: emailLower },
  });

  revalidatePath("/admin/berater");
  return { ok: true };
}

// ============================================================
// MT-2 — assignBerater / unassignBerater
// ============================================================

/**
 * Weist einem Berater einen Kanzlei-/Direkt-Tenant zu (idempotent: PK-Konflikt
 * = No-Op). Mandanten der Kanzlei folgen automatisch (Cascade via
 * berater_assigned_tenant_ids, DEC-268) — hier wird NUR die Kanzlei-Zeile gesetzt.
 * Direkter service_role-Write (1 Statement, atomar) — kein RPC noetig.
 */
export async function assignBerater(
  beraterUserId: string,
  tenantId: string,
): Promise<ActionResult> {
  const user = await assertStrategaizeAdmin();
  if (!user) return { ok: false, error: "unauthorized" };

  if (!UUID_REGEX.test(beraterUserId ?? "")) {
    return { ok: false, error: "invalid_berater_id" };
  }
  if (!UUID_REGEX.test(tenantId ?? "")) {
    return { ok: false, error: "invalid_tenant_id" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("berater_tenant_assignments")
    .upsert(
      { berater_user_id: beraterUserId, tenant_id: tenantId, assigned_by: user.id },
      { onConflict: "berater_user_id,tenant_id", ignoreDuplicates: true },
    );

  if (error) {
    captureException(new Error(error.message), {
      source: "admin/berater/assignBerater",
      userId: user.id,
      metadata: { beraterUserId, tenantId },
    });
    return { ok: false, error: "assign_failed" };
  }

  revalidatePath("/admin/berater");
  return { ok: true };
}

/** Entfernt eine Berater-Tenant-Zuweisung (per PK). */
export async function unassignBerater(
  beraterUserId: string,
  tenantId: string,
): Promise<ActionResult> {
  const user = await assertStrategaizeAdmin();
  if (!user) return { ok: false, error: "unauthorized" };

  if (!UUID_REGEX.test(beraterUserId ?? "")) {
    return { ok: false, error: "invalid_berater_id" };
  }
  if (!UUID_REGEX.test(tenantId ?? "")) {
    return { ok: false, error: "invalid_tenant_id" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("berater_tenant_assignments")
    .delete()
    .eq("berater_user_id", beraterUserId)
    .eq("tenant_id", tenantId);

  if (error) {
    captureException(new Error(error.message), {
      source: "admin/berater/unassignBerater",
      userId: user.id,
      metadata: { beraterUserId, tenantId },
    });
    return { ok: false, error: "unassign_failed" };
  }

  revalidatePath("/admin/berater");
  return { ok: true };
}
