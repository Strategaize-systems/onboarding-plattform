"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createRateLimiter } from "@/lib/rate-limit";

/**
 * SLC-034 MT-3 — acceptEmployeeInvitation Server-Action.
 *
 * DEC-011-Pattern (strikt):
 *   1. Token via service-role client validieren (SELECT).
 *   2. supabase.auth.admin.createUser mit email + password + user_metadata
 *      { role:'employee', tenant_id }. handle_new_user-Trigger legt profile an.
 *   3. rpc_accept_employee_invitation_finalize(invitation_id, new_user_id) via
 *      admin-client (service_role kann die RPC aufrufen).
 *   4. Bei Fehler in Schritt 3: supabase.auth.admin.deleteUser(new_user_id) — Rollback.
 *   5. signInWithPassword via server-client -> Session-Cookie gesetzt.
 *   6. redirect("/employee")
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

  // (1) Token validieren
  const { data: invitation, error: invErr } = await admin
    .from("employee_invitation")
    .select("id, tenant_id, email, display_name, status, expires_at")
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
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "employee",
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

  // (5) Auto-Login via server-Client (Session-Cookie)
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

  // (6) Redirect ins Mitarbeiter-Dashboard
  redirect("/employee");
}
