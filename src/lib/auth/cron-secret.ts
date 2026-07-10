// SLC-195 MT-2 (V20, ISSUE-131) — Timing-safe Cron-Secret-Verifier.
//
// Struktur 1:1 aus src/lib/auth/service-key.ts (verifyServiceKey): Buffer-
// Length-Check VOR crypto.timingSafeEqual (das crasht bei Length-Mismatch),
// dann konstant-zeitiger Vergleich. Ersetzt das non-constant-time `secret !==
// expected` in allen 7 cron-Routes (Timing-Oracle-Defense-in-Depth).
//
// Die "ENV nicht gesetzt"-Behandlung (503) bleibt in der Route (eigener Pfad,
// vor diesem Aufruf) — dieser Helper liefert bei fehlendem/leerem Expected
// defensiv `false`, nicht throw, damit der Auth-Vergleich fail-closed ist.

import { timingSafeEqual } from "node:crypto";

/**
 * Vergleicht den vom Caller gelieferten `x-cron-secret`-Header konstant-zeitig
 * gegen `process.env.CRON_SECRET`. `true` nur bei exaktem Match.
 *
 * @param headerValue  Wert des `x-cron-secret`-Header (kann null sein).
 * @param expectedSecret  `process.env.CRON_SECRET` (kann undefined sein).
 */
export function verifyCronSecret(
  headerValue: string | null | undefined,
  expectedSecret: string | undefined,
): boolean {
  if (expectedSecret === undefined || expectedSecret.length === 0) {
    return false;
  }
  if (headerValue === null || headerValue === undefined || headerValue.length === 0) {
    return false;
  }

  const headerBuf = Buffer.from(headerValue, "utf8");
  const expectedBuf = Buffer.from(expectedSecret, "utf8");

  // Length-Check first — timingSafeEqual crasht bei Length-Mismatch. Der
  // false-return ist selbst konstant-zeitig (haengt nur an der Server-seitigen
  // expectedSecret-Laenge, leakt nichts an den Caller).
  if (headerBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(headerBuf, expectedBuf);
}
