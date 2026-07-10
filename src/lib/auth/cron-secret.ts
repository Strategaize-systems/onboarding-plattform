// SLC-195 MT-2 (V20, ISSUE-131) + Review-Cleanup — Timing-safe Cron-Secret-Verifier.
//
// Duenner Wrapper ueber verifyServiceKey (src/lib/auth/service-key.ts): EINE
// kanonische Timing-safe-Impl (Buffer-Length-Check VOR crypto.timingSafeEqual) statt
// einer zweiten Byte-fuer-Byte-Kopie, die getrennt gepflegt werden muesste. Der
// einzige Verhaltensunterschied: verifyServiceKey WIRFT bei undefined expectedKey
// (Production-Misconfig-Defense); hier ist der undefined/leer-Fall bewusst fail-closed
// `false`, weil die "ENV missing"-Behandlung (503) VOR diesem Aufruf in
// requireCronSecret bzw. der Route liegt.

import { verifyServiceKey } from "@/lib/auth/service-key";

/**
 * Vergleicht den vom Caller gelieferten `x-cron-secret`-Header konstant-zeitig gegen
 * `process.env.CRON_SECRET`. `true` nur bei exaktem Match; fehlendes/leeres
 * expectedSecret => `false` (fail-closed), fehlender Header => `false`.
 *
 * @param headerValue  Wert des `x-cron-secret`-Header (kann null/undefined sein).
 * @param expectedSecret  `process.env.CRON_SECRET` (kann undefined sein).
 */
export function verifyCronSecret(
  headerValue: string | null | undefined,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) {
    return false;
  }
  return verifyServiceKey(headerValue ?? null, expectedSecret);
}
