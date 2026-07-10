// V20 Review-Cleanup — gemeinsames Cron-Auth-Gate fuer alle /api/cron/*-Routes.
//
// Ersetzt die zuvor 7x byte-identisch kopierte Auth-Preamble (ENV-Check + 503 +
// timing-safe Secret-Compare + 403 + captureWarning). Die naechste Aenderung am
// Cron-Auth (Header-Rotation, Replay-Nonce, IP-Allowlist) trifft damit EINE Stelle
// statt sieben — kein "6 von 7 gehaertet"-Drift mehr.
//
// Liegt getrennt von cron-secret.ts (reiner, next-/logger-freier Verifier, damit die
// Pure-Mock-Unit-Tests von verifyCronSecret keine Server-Module ziehen).

import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/cron-secret";
import { captureWarning } from "@/lib/logger";

/**
 * Prueft die `x-cron-secret`-Autorisierung einer Cron-Route. Gibt eine Response zum
 * Short-Circuit zurueck (503 = `CRON_SECRET`-ENV fehlt, 403 = Secret-Mismatch), oder
 * `null` wenn der Aufruf autorisiert ist.
 *
 * @param req     Der eingehende Request (liest den `x-cron-secret`-Header).
 * @param source  Log-Source-Label, z.B. "cron:walkthrough-cleanup".
 */
export function requireCronSecret(
  req: Request,
  source: string,
): NextResponse | null {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    captureWarning("CRON_SECRET ENV missing — cron endpoint disabled", {
      source,
    });
    return new NextResponse("Cron not configured", { status: 503 });
  }

  if (!verifyCronSecret(req.headers.get("x-cron-secret"), expected)) {
    captureWarning("cron auth fail", {
      source,
      metadata: { reason: "x-cron-secret mismatch" },
    });
    return new NextResponse("Unauthorized", { status: 403 });
  }

  return null;
}
