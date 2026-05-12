"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createRateLimiter } from "@/lib/rate-limit";

/**
 * SLC-034 MT-3 — acceptEmployeeInvitation Server-Action.
 * V6 SLC-102 MT-6 — Branch fuer partner_admin via invitation.role_hint.
 * V6 SLC-103 MT-2 — Branch fuer tenant_admin (Mandant unter Partner) +
 *                   Post-Accept partner_client_mapping → 'accepted'.
 *
 * DEC-011-Pattern (strikt):
 *   1. Token via service-role client validieren (SELECT inkl. role_hint).
 *   2. acceptedRole abgeleitet aus invitation.role_hint:
 *        - 'partner_admin' → 'partner_admin' (V6 SLC-102)
 *        - 'tenant_admin'  → 'tenant_admin'  (V6 SLC-103 — Mandant)
 *        - sonst (NULL, anderer Wert) → 'employee' (V4 Default-Pfad)
 *   3. supabase.auth.admin.createUser mit email + password + user_metadata
 *      { role: acceptedRole, tenant_id }. handle_new_user-Trigger legt
 *      profile mit korrekter Rolle an (Migration 090 erlaubt partner_admin).
 *   4. rpc_accept_employee_invitation_finalize(invitation_id, new_user_id) via
 *      admin-client. RPC ist role-hint-agnostisch (setzt nur status/accepted_*).
 *   5. Bei Fehler in Schritt 4: supabase.auth.admin.deleteUser(new_user_id) — Rollback.
 *   6. Wenn role_hint='tenant_admin' UND tenant_kind='partner_client':
 *      UPDATE partner_client_mapping.invitation_status='accepted' + audit-log.
 *      Best-effort (Mapping ist Sichtbarkeits-Layer, nicht Auth-Pfad).
 *   7. signInWithPassword via server-client -> Session-Cookie gesetzt.
 *   8. redirect:
 *        - partner_admin → "/partner/dashboard"
 *        - tenant_admin  → "/dashboard"
 *        - employee      → "/employee"
 *
 * Passwort-Mindestlaenge 8 Zeichen (Slice-Risk-Note). Rate-Limiting per IP.
 */

const acceptInvitationLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
});

type AcceptResult = { error: string } | void;

export async function acceptEmployeeInvitation(
  token: string,
  formData: FormData
): Promise<AcceptResult> {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    return { error: "Ungültiger Einladungslink." };
  }
  if (!password || password.length < 8) {
    return { error: "Passwort muss mindestens 8 Zeichen lang sein." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwörter stimmen nicht überein." };
  }

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateCheck = acceptInvitationLimiter.check(ip);
  if (!rateCheck.allowed) {
    return { error: rateCheck.error ?? "Zu viele Versuche." };
  }

  const admin = createAdminClient();

  // (1) Token validieren (inkl. role_hint fuer V6 partner_admin-Branch)
  const { data: invitation, error: invErr } = await admin
    .from("employee_invitation")
    .select("id, tenant_id, email, display_name, role_hint, status, expires_at")
    .eq("invitation_token", token)
    .maybeSingle();

  if (invErr) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(invErr.message), { source: "accept-invitation/selectInvitation" });
    return { error: "Serverfehler. Bitte später erneut versuchen." };
  }

  if (!invitation) {
    return { error: "Diese Einladung ist ungültig oder wurde bereits verwendet." };
  }

  if (invitation.status === "accepted") {
    return { error: "Diese Einladung wurde bereits angenommen. Bitte logge dich direkt ein." };
  }

  if (invitation.status === "revoked") {
    return { error: "Diese Einladung wurde widerrufen. Bitte wende dich an deinen Administrator." };
  }

  if (invitation.status !== "pending") {
    return { error: "Diese Einladung ist nicht mehr gültig." };
  }

  const expiresAt = new Date(invitation.expires_at);
  if (expiresAt.getTime() < Date.now()) {
    return { error: "Diese Einladung ist abgelaufen. Bitte wende dich an deinen Administrator." };
  }

  // (2) Auth-User anlegen via Admin-API (DEC-011)
  //
  // V6 SLC-102 MT-6: role_hint='partner_admin' fuer Partner-Onboarding.
  // V6 SLC-103 MT-2: role_hint='tenant_admin' fuer Mandanten unter Partner.
  // Default bleibt 'employee' — V4-Employee-Flow unveraendert. Migration 090
  // handle_new_user-Trigger akzeptiert alle drei Rollen, Tenant-Validation
  // greift weiter.
  const acceptedRole: "employee" | "partner_admin" | "tenant_admin" =
    invitation.role_hint === "partner_admin"
      ? "partner_admin"
      : invitation.role_hint === "tenant_admin"
        ? "tenant_admin"
        : "employee";

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: {
      role: acceptedRole,
      tenant_id: invitation.tenant_id,
    },
  });

  if (createErr || !created?.user) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(createErr?.message ?? "createUser returned no user"), {
      source: "accept-invitation/createUser",
      metadata: { invitationId: invitation.id, email: invitation.email },
    });
    // Typischer Fall: E-Mail existiert bereits in auth.users. Dann kann der
    // Nutzer sich direkt einloggen — UI zeigt hilfreiche Meldung.
    const msg = createErr?.message ?? "";
    if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
      return { error: "Ein Account mit dieser E-Mail existiert bereits. Bitte logge dich direkt ein." };
    }
    return { error: "Konto konnte nicht angelegt werden. Bitte erneut versuchen." };
  }

  const newUserId = created.user.id;

  // (3) Finalize-RPC
  const { data: finalizeData, error: finalizeErr } = await admin.rpc(
    "rpc_accept_employee_invitation_finalize",
    {
      p_invitation_id: invitation.id,
      p_accepted_user_id: newUserId,
    }
  );

  const finalizeResult = finalizeData as Record<string, unknown> | null;
  const finalizeFailed =
    Boolean(finalizeErr) ||
    !finalizeResult ||
    typeof finalizeResult.error === "string";

  if (finalizeFailed) {
    // (4) Rollback — verwaisten auth.users-Eintrag entfernen
    try {
      await admin.auth.admin.deleteUser(newUserId);
    } catch (deleteErr) {
      const { captureException } = await import("@/lib/logger");
      captureException(deleteErr, {
        source: "accept-invitation/rollbackDeleteUser",
        metadata: { newUserId, invitationId: invitation.id },
      });
    }

    const { captureException } = await import("@/lib/logger");
    captureException(
      new Error(
        finalizeErr?.message ??
          ((finalizeResult?.error as string) ?? "finalize failed")
      ),
      {
        source: "accept-invitation/finalize",
        metadata: { invitationId: invitation.id, newUserId },
      }
    );
    return { error: "Einladung konnte nicht abgeschlossen werden. Bitte erneut versuchen." };
  }

  // (5) V6 SLC-103 — Mandanten-Mapping auf 'accepted' setzen, wenn die
  // Invitation zu einem partner_client-Tenant gehoert. Idempotent: wenn das
  // Mapping nicht existiert oder bereits accepted ist, bleibt der Zustand
  // erhalten. Best-effort — Mapping-Update ist Sichtbarkeits-Layer, kein
  // Auth-Pfad. Bei Fehler wird der User trotzdem eingeloggt (Mapping wird
  // dann ggf. via Backfill spaeter korrigiert; nicht V6-Scope).
  if (acceptedRole === "tenant_admin") {
    const { data: tenant } = await admin
      .from("tenants")
      .select("tenant_kind")
      .eq("id", invitation.tenant_id)
      .single();

    if (tenant?.tenant_kind === "partner_client") {
      const { error: updErr } = await admin
        .from("partner_client_mapping")
        .update({ invitation_status: "accepted", accepted_at: new Date().toISOString() })
        .eq("client_tenant_id", invitation.tenant_id)
        .eq("invitation_status", "invited");

      if (updErr) {
        const { captureException } = await import("@/lib/logger");
        captureException(new Error(updErr.message), {
          source: "accept-invitation/partnerClientMappingAccept",
          metadata: { invitationId: invitation.id, mandantTenantId: invitation.tenant_id },
        });
      } else {
        const { captureInfo } = await import("@/lib/logger");
        captureInfo(`Mandant '${invitation.email}' Einladung akzeptiert`, {
          source: "accept-invitation/partnerClientMappingAccept",
          metadata: {
            category: "partner_mandant_accepted",
            mandant_tenant_id: invitation.tenant_id,
            invitation_id: invitation.id,
          },
        });
      }
    }
  }

  // (6) Auto-Login via server-Client (Session-Cookie)
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: invitation.email,
    password,
  });

  if (signInErr) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(signInErr.message), {
      source: "accept-invitation/signIn",
      metadata: { invitationId: invitation.id, newUserId },
    });
    // Account ist angelegt, Invitation akzeptiert — User kann sich manuell einloggen
    redirect("/login");
  }

  // (7) Redirect ins rollen-spezifische Dashboard
  if (acceptedRole === "partner_admin") {
    redirect("/partner/dashboard");
  }
  if (acceptedRole === "tenant_admin") {
    redirect("/dashboard");
  }
  redirect("/employee");
}
