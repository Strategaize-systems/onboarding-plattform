// V9.1 SLC-V9.1-A MT-3 — HMAC-SHA256 Signatur fuer Inbound-Webhook.
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-3)
//
// Pattern-Quelle: src/lib/cta/token.ts (HMAC-SHA256 + timingSafeEqual mit
// Length-Pre-Check). Hier ohne base64url-Payload — die Signatur wird ueber den
// rohen POST-Body berechnet und gegen den Header `X-Strategaize-Signature` geprueft.
//
// Wire-Format (ARCHITECTURE.md V9.1 Flow A, Schritt 7):
//   X-Strategaize-Signature: sha256=<hex-digest>
// Die Lambda signiert den exakt gleichen rohen Body, den der Webhook empfaengt.

import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

/**
 * Berechnet die Inbound-Signatur `sha256=<hex>` ueber den rohen Body mit dem
 * Shared-Secret. Identische Funktion wie die Lambda-Sign-Seite — daher hier
 * exportiert (auch fuer Test-Fixtures + Lambda-Source-Reuse in MT-5).
 */
export function computeInboundSignature(rawBody: string, secret: string): string {
  return (
    SIGNATURE_PREFIX +
    createHmac("sha256", secret).update(rawBody, "utf-8").digest("hex")
  );
}

/**
 * Constant-time-Verify des `X-Strategaize-Signature`-Headers gegen die ueber den
 * rohen Body berechnete Erwartungs-Signatur.
 *
 * Returns false (statt throw) bei jedem Fehlerfall — der Webhook-Handler mappt
 * false auf reject_layer='hmac_invalid' + 401.
 *
 * - Leere/fehlende Signatur            -> false
 * - Leeres/fehlendes Secret            -> false
 * - Falsches Secret (Length-gleich)    -> false (timingSafeEqual)
 * - Tampered Body                      -> false (timingSafeEqual)
 * - Valide Signatur                    -> true
 */
export function verifyInboundHmac(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (typeof signature !== "string" || signature.length === 0) return false;
  if (typeof secret !== "string" || secret.length === 0) return false;

  const expected = computeInboundSignature(rawBody, secret);
  const provided = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);

  // Length-Pre-Check vermeidet timingSafeEqual-RangeError bei ungleicher Laenge.
  if (provided.length !== expectedBuf.length) return false;
  return timingSafeEqual(provided, expectedBuf);
}
