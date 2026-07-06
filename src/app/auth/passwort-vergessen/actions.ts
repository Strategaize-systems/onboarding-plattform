"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  passwordResetIpLimiter,
  passwordResetAccountLimiter,
} from "@/lib/rate-limit";
import { captureInfo, captureException } from "@/lib/logger";
import { sendPasswordResetEmail } from "@/lib/email";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCE = "auth/passwort-vergessen";

/**
 * Enumeration-sichere Passwort-Reset-Anforderung (V10.3 SLC-186 MT-3).
 *
 * Antwortet fuer jede syntaktisch gueltige E-Mail byte-identisch mit
 * `{ ok: true }` — unabhaengig davon, ob der Account existiert, GoTrue
 * `user_not_found` liefert oder der SMTP-Versand scheitert. So kann ein
 * Angreifer nicht aus der Antwort ableiten, ob eine Adresse registriert ist.
 *
 * Rate-Limiting nach P-081-Muster: IP-scoped (Flood/Brute-Force) +
 * account-scoped (verhindert IP-Rotation gegen eine feste Adresse).
 */
export async function requestPasswordReset(
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  const rawEmail = (formData.get("email") as string | null) ?? "";
  const emailLower = rawEmail.trim().toLowerCase();

  if (!emailLower || !EMAIL_REGEX.test(emailLower)) {
    return { error: "Bitte eine gültige E-Mail-Adresse eingeben" };
  }

  // Rate-Limit: IP-scoped (x-forwarded-for, Traefik single-hop) + account-scoped.
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (!passwordResetIpLimiter.check(ip).allowed) {
    return { error: "Zu viele Anfragen. Bitte später erneut versuchen." };
  }
  if (!passwordResetAccountLimiter.check(emailLower).allowed) {
    return { error: "Zu viele Anfragen. Bitte später erneut versuchen." };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: emailLower,
  });

  // Fehler (inkl. user_not_found) schlucken — Enumeration-Schutz. Kein
  // Token/keine E-Mail im Klartext loggen; nur der Fehler-Grund als Info.
  if (error || !data?.properties?.hashed_token) {
    captureInfo("Passwort-Reset angefordert (kein Link erzeugt)", {
      source: SOURCE,
      metadata: { reason: error?.message ?? "no_hashed_token" },
    });
    return { ok: true };
  }

  // Verify-URL IMMER aus NEXT_PUBLIC_APP_URL bauen — nie request.origin (P-040).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const verifyUrl = `${appUrl}/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery&locale=de`;

  try {
    await sendPasswordResetEmail({ to: emailLower, verifyUrl });
  } catch (sendError) {
    // SMTP-Fehler ebenfalls schlucken — Antwort bleibt byte-identisch.
    captureException(sendError, { source: SOURCE });
    return { ok: true };
  }

  return { ok: true };
}
