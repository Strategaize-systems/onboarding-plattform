"use server";

import { createClient } from "@/lib/supabase/server";
import { sendEmployeeInvitationEmail } from "@/lib/email";
import { revalidatePath } from "next/cache";

/**
 * SLC-034 MT-2 + MT-5 — tenant_admin Server-Actions fuer Mitarbeiter-Einladungen.
 *
 * inviteEmployee:
 *   - tenant_admin-Check via server-Client (RPC validiert zusaetzlich)
 *   - rpc_create_employee_invitation
 *   - Link-Aufbau aus NEXT_PUBLIC_APP_URL (Entscheidung 2)
 *   - E-Mail via SMTP
 *   - SMTP-Fehler -> Invitation bleibt pending, Resend via resendEmployeeInvitation
 *     (Entscheidung 1: pending + Resend, kein Rollback)
 *
 * revokeEmployeeInvitation:
 *   - rpc_revoke_employee_invitation
 *
 * resendEmployeeInvitation:
 *   - Re-send der bestehenden pending Invitation ueber vorhandenen Token
 *   - Kein neuer Token, kein Re-INSERT (UNIQUE-Index verhindert das ohnehin)
 */

type ActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function sanitizeEmail(raw: FormDataEntryValue | null): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

function sanitizeText(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  return v.length > 0 ? v : null;
}

export async function inviteEmployee(formData: FormData): Promise<ActionResult<{ invitationId: string; emailFailed?: boolean }>> {
  const email = sanitizeEmail(formData.get("email"));
  const displayName = sanitizeText(formData.get("displayName"));
  const roleHint = sanitizeText(formData.get("roleHint"));

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "invalid_email" };
  }

  const supabase = await createClient();

  // Auth-Check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "tenant_admin" || !profile.tenant_id) {
    return { ok: false, error: "forbidden" };
  }

  // RPC-Aufruf — SECURITY DEFINER, prueft auth.user_role() zusaetzlich
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "rpc_create_employee_invitation",
    {
      p_email: email,
      p_display_name: displayName,
      p_role_hint: roleHint,
    }
  );

  if (rpcError) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(rpcError.message), { source: "admin/team/inviteEmployee" });
    return { ok: false, error: "rpc_failed" };
  }

  const result = rpcData as Record<string, string> | null;
  if (!result || !result.invitation_id || !result.invitation_token) {
    return { ok: false, error: (result?.error as string) ?? "unknown_error" };
  }

  const invitationId = result.invitation_id;
  const token = result.invitation_token;

  // Tenant + Inviter Daten fuer E-Mail-Template
  const [{ data: tenant }, { data: inviterProfile }] = await Promise.all([
    supabase
      .from("tenants")
      .select("name, language")
      .eq("id", profile.tenant_id)
      .single(),
    supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single(),
  ]);

  const tenantName = tenant?.name ?? "StrategAIze";
  const locale = tenant?.language ?? "de";

  // Entscheidung 2: NEXT_PUBLIC_APP_URL, keine separate EMPLOYEE_INVITATION_BASE_URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const inviteUrl = `${baseUrl}/accept-invitation/${token}`;

  // Expiry ~ now() + 14 days (matches RPC-Default)
  const expiresAt = new Date(Date.now() + 14 * 24 * 3600_000);

  // Entscheidung 1: SMTP-Fehler -> pending + Resend, kein Rollback
  try {
    await sendEmployeeInvitationEmail({
      to: email,
      tenantName,
      inviteUrl,
      expiresAt,
      displayName,
      roleHint,
      locale,
    });
  } catch (err) {
    const { captureException } = await import("@/lib/logger");
    captureException(err, {
      source: "admin/team/inviteEmployee",
      metadata: { invitationId, inviterEmail: inviterProfile?.email ?? null },
    });
    revalidatePath("/admin/team");
    return { ok: true, invitationId, emailFailed: true };
  }

  revalidatePath("/admin/team");
  return { ok: true, invitationId };
}

export async function revokeEmployeeInvitation(
  invitationId: string
): Promise<ActionResult> {
  if (!invitationId || !/^[0-9a-f-]{36}$/i.test(invitationId)) {
    return { ok: false, error: "invalid_invitation_id" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("rpc_revoke_employee_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(error.message), {
      source: "admin/team/revokeEmployeeInvitation",
    });
    return { ok: false, error: "rpc_failed" };
  }

  const result = data as Record<string, unknown> | null;
  if (!result || typeof result.error === "string") {
    return { ok: false, error: (result?.error as string) ?? "unknown_error" };
  }

  revalidatePath("/admin/team");
  return { ok: true };
}

export async function resendEmployeeInvitation(
  invitationId: string
): Promise<ActionResult> {
  if (!invitationId || !/^[0-9a-f-]{36}$/i.test(invitationId)) {
    return { ok: false, error: "invalid_invitation_id" };
  }

  const supabase = await createClient();

  // Auth-Check — nur tenant_admin darf resenden
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "tenant_admin" || !profile.tenant_id) {
    return { ok: false, error: "forbidden" };
  }

  const { data: inv, error: invErr } = await supabase
    .from("employee_invitation")
    .select("id, email, invitation_token, display_name, role_hint, status, expires_at, tenant_id")
    .eq("id", invitationId)
    .single();

  if (invErr || !inv) return { ok: false, error: "not_found" };
  if (inv.tenant_id !== profile.tenant_id) return { ok: false, error: "forbidden" };
  if (inv.status !== "pending") return { ok: false, error: `status_${inv.status}` };

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, language")
    .eq("id", inv.tenant_id)
    .single();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const inviteUrl = `${baseUrl}/accept-invitation/${inv.invitation_token}`;

  try {
    await sendEmployeeInvitationEmail({
      to: inv.email,
      tenantName: tenant?.name ?? "StrategAIze",
      inviteUrl,
      expiresAt: new Date(inv.expires_at),
      displayName: inv.display_name,
      roleHint: inv.role_hint,
      locale: tenant?.language ?? "de",
    });
  } catch (err) {
    const { captureException } = await import("@/lib/logger");
    captureException(err, {
      source: "admin/team/resendEmployeeInvitation",
      metadata: { invitationId },
    });
    return { ok: false, error: "smtp_failed" };
  }

  return { ok: true };
}
