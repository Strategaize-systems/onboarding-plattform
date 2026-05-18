/**
 * Magic-Link-Session-Helper fuer V7 Self-Signup Verify-Endpoint
 * (SLC-133 MT-2 / FEAT-053).
 *
 * Pattern aus src/app/api/admin/tenants/[tenantId]/invite/route.ts (V6 SLC-103)
 * via .claude/rules/strategaize-pattern-reuse.md.
 *
 * Erzeugt einen Magic-Link via `auth.admin.generateLink({type: 'magiclink'})`
 * und liefert eine fertige Callback-URL zurueck, die der Verify-Endpoint als
 * Redirect nutzen kann. Die Callback-URL zeigt auf das existierende
 * `/auth/callback` (das `verifyOtp({token_hash, type})` aufruft + Session-
 * Cookie setzt + auf `/auth/set-password` weiterleitet).
 *
 * Hintergrund: Self-hosted GoTrue generiert in `action_link` interne
 * Hostnamen (z.B. `supabase-kong:8000`), die fuer Browser-Redirects nicht
 * brauchbar sind (siehe V6-Kommentar in invite/route.ts). Wir bauen die URL
 * deshalb selbst aus `hashed_token` + Public-App-URL — analog V6 Invite.
 *
 * Ergebnis: `{ ok: true, verify_url: 'https://onboarding.../auth/callback?...' }`.
 * Mandant landet nach Klick (genauer: server-internem Redirect) mit aktiver
 * Session auf `/auth/set-password` und setzt sein Passwort.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type MagicLinkResult =
  | { ok: true; verify_url: string }
  | { ok: false; error: "magic_link_failed" };

export interface GenerateMagicLinkInput {
  email: string;
  /** Locale fuer Set-Password-Page, default 'de' (V7 deutsch). */
  locale?: "de" | "en" | "nl";
}

/**
 * Erzeugt einen `magiclink` via Supabase Admin-API und baut die fertige
 * /auth/callback-URL. Returnt einen Discriminated-Union — Caller (Verify-
 * Endpoint) entscheidet ob Redirect oder Error-Page.
 *
 * @param input - Email + optionale Locale.
 * @returns Result mit verify_url oder error='magic_link_failed'.
 */
export async function generateMagicLinkSession(
  input: GenerateMagicLinkInput
): Promise<MagicLinkResult> {
  const admin = createAdminClient();
  const locale = input.locale ?? "de";

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: input.email,
  });

  if (error || !data) {
    return { ok: false, error: "magic_link_failed" };
  }

  const hashedToken = data.properties?.hashed_token;
  if (!hashedToken || typeof hashedToken !== "string") {
    return { ok: false, error: "magic_link_failed" };
  }

  const publicAppUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.PUBLIC_APP_URL ?? "";

  // /auth/callback unterstuetzt token_hash + type=invite|email|magiclink
  // (SLC-133 MT-2: 'magiclink' im Type-Union ergaenzt). Locale wird als
  // NEXT_LOCALE-Cookie persistiert.
  const verifyUrl =
    `${publicAppUrl}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}` +
    `&type=magiclink&locale=${encodeURIComponent(locale)}`;

  return { ok: true, verify_url: verifyUrl };
}
