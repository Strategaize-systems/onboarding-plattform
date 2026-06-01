// V8.1 SLC-163 MT-2 — HMAC-SHA256 Magic-Link-Token fuer Strategaize-Freigabe-CTA.
//
// Pattern: Stateless HMAC pro DEC-173 (kein DB-Roundtrip bei Verify), 90 Tage
// Expiry pro DEC-172 (Default ENV-konfigurierbar). Kein Single-Use in V8.1 —
// Idempotenz wird ueber capture_session.released_for_strategaize_review-Flag
// im /strategaize-anfrage-Endpoint erzwungen (SLC-163 MT-7).
//
// Pattern-Quelle: src/lib/jitsi/jwt.ts (HMAC-SHA256 + base64url). Hier ohne
// JWT-Header-Schema — kompakter Payload `<base64url-json>.<base64url-sig>`.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface CtaTokenPayload {
  capture_session_id: string;
  partner_organization_id: string;
  mandant_email: string;
  issued_at: number;   // Unix-Seconds
  expiry_at: number;   // Unix-Seconds
}

export interface CtaTokenInput {
  capture_session_id: string;
  partner_organization_id: string;
  mandant_email: string;
}

export type CtaTokenVerifyResult =
  | { valid: true; payload: CtaTokenPayload }
  | { valid: false; reason: "invalid_signature" | "expired" | "malformed" };

function readSecret(): string {
  const secret = process.env.STRATEGAIZE_CTA_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "STRATEGAIZE_CTA_TOKEN_SECRET is not set or too short (min 32 hex chars required).",
    );
  }
  return secret;
}

function readExpiryDays(): number {
  const raw = process.env.STRATEGAIZE_CTA_TOKEN_EXPIRY_DAYS;
  if (!raw) return 90;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 90;
  return n;
}

function base64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf-8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/**
 * Generate HMAC-SHA256-signed Magic-Link-Token for Strategaize-Freigabe-CTA.
 *
 * Output format: `<base64url-json-payload>.<base64url-hmac-sha256-signature>`.
 *
 * Throws if STRATEGAIZE_CTA_TOKEN_SECRET is not configured.
 */
export function generateCtaMagicLinkToken(input: CtaTokenInput): string {
  const secret = readSecret();
  const now = Math.floor(Date.now() / 1000);
  const expiryDays = readExpiryDays();
  const payload: CtaTokenPayload = {
    capture_session_id: input.capture_session_id,
    partner_organization_id: input.partner_organization_id,
    mandant_email: input.mandant_email,
    issued_at: now,
    expiry_at: now + expiryDays * 24 * 60 * 60,
  };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sigB64 = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify Magic-Link-Token. Returns parsed payload on success, structured
 * failure reason otherwise. Timing-safe signature comparison.
 */
export function verifyCtaMagicLinkToken(token: string): CtaTokenVerifyResult {
  const secret = readSecret();

  if (typeof token !== "string" || !token.includes(".")) {
    return { valid: false, reason: "malformed" };
  }
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) {
    return { valid: false, reason: "malformed" };
  }

  const expectedSigB64 = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expectedSigB64);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "invalid_signature" };
  }

  let payload: CtaTokenPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString("utf-8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (
    typeof payload?.capture_session_id !== "string" ||
    typeof payload?.partner_organization_id !== "string" ||
    typeof payload?.mandant_email !== "string" ||
    typeof payload?.issued_at !== "number" ||
    typeof payload?.expiry_at !== "number"
  ) {
    return { valid: false, reason: "malformed" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec >= payload.expiry_at) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, payload };
}
