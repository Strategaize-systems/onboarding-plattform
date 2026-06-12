// V9.1 SLC-V9.1-A MT-4 — Schicht-2-Validation: Setup-Token (DEC-201).
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-4, Flow A Schritt 5)
//
// GF setzt beim Einrichten der Forward-Regel den Header `X-Strategaize-Forward-Token`
// mit dem endpoint.setup_token. Der Webhook liest den Header aus der geparsten EML
// und vergleicht ihn constant-time mit dem in der DB gespeicherten Token.
//
// Pattern-Quelle: src/lib/cta/token.ts (timingSafeEqual + Length-Pre-Check).

import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time-Vergleich des Forward-Token-Headers gegen das Endpoint-Setup-Token.
 *
 * - Fehlender/leerer Header   -> false (Caller mappt auf reject_layer='setup_token_missing')
 * - Mismatch                  -> false (Caller mappt auf reject_layer='setup_token_invalid')
 * - Match                     -> true
 */
export function verifySetupToken(
  providedToken: string | null | undefined,
  expectedToken: string,
): boolean {
  if (typeof providedToken !== "string" || providedToken.length === 0) {
    return false;
  }
  if (typeof expectedToken !== "string" || expectedToken.length === 0) {
    return false;
  }
  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
