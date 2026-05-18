/**
 * Service-Key-Verifier fuer V7 Cross-System-Auth.
 *
 * SLC-132 MT-2 — Public-Signup-API authentifiziert Caller (Intelligence-
 * Studio-Server-Side) per Header `x-strategaize-service-key`. Vergleich
 * gegen ENV `PUBLIC_SIGNUP_SERVICE_KEY` via `crypto.timingSafeEqual`
 * (Reuse-Anker DEC-107 V6 Lead-Push-Adapter).
 *
 * Wichtig:
 * - timing-safe-equal verhindert Timing-Attacken, die bei Standard-`===`
 *   moeglich waeren (`===` kann frueh aussteigen, wenn 1. Byte abweicht).
 * - Buffer-Length-Mismatch wirft Crash bei `timingSafeEqual`. Daher
 *   expliziter Length-Check VOR dem Compare-Call.
 * - Undefined-ENV (`expectedKey === undefined`) wirft Error mit
 *   Hinweis auf Pflicht-Setzung. Production-Code soll vor dem ersten
 *   `verifyServiceKey`-Call die ENV-Validation erledigen, aber als
 *   Defense-in-Depth wirft die Function selbst.
 *
 * `hashWithSha256` liegt im selben File weil der Public-Signup-Endpoint
 * (MT-6) beide Helper braucht (Key-Verify + Email/IP-Hash fuer DSGVO-
 * konformes Audit-Log).
 */

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Vergleicht den vom Caller gelieferten Service-Key gegen den erwarteten
 * Key per `crypto.timingSafeEqual`. Liefert `true` bei Match, sonst
 * `false`.
 *
 * @param headerValue - Wert des `x-strategaize-service-key`-Header.
 *                      Kann `null` sein (Header fehlt).
 * @param expectedKey - ENV-konfigurierter Service-Key. Wirft Error
 *                      wenn `undefined` (Production-Misconfig).
 */
export function verifyServiceKey(
  headerValue: string | null,
  expectedKey: string | undefined
): boolean {
  if (expectedKey === undefined) {
    throw new Error(
      "PUBLIC_SIGNUP_SERVICE_KEY ENV is not set. " +
        "Configure the service key in Coolify before deploying the public signup endpoint."
    );
  }

  if (headerValue === null || headerValue.length === 0) {
    return false;
  }

  const headerBuf = Buffer.from(headerValue, "utf8");
  const expectedBuf = Buffer.from(expectedKey, "utf8");

  // timingSafeEqual crashes on length-mismatch. Length-Check first so the
  // false-return is itself constant-time (only depends on `expectedKey`-length
  // which is a server-side constant — leaks zero info to the caller).
  if (headerBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(headerBuf, expectedBuf);
}

/**
 * Berechnet SHA-256-Hex-Digest fuer einen Klartext-String. Genutzt im
 * Public-Signup-Endpoint fuer:
 * - `verify_token_hash` (Klartext-Token nur in Email/URL, Hash in DB).
 * - `email_hash` / `ip_hash` in Audit-Log (DSGVO-Datensparsamkeit).
 */
export function hashWithSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
