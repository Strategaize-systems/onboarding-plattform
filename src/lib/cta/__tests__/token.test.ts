// V8.1 SLC-163 MT-2 — Vitest fuer HMAC-SHA256 Magic-Link-Token.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import {
  generateCtaMagicLinkToken,
  verifyCtaMagicLinkToken,
  type CtaTokenInput,
} from "../token";

const ORIGINAL_SECRET = process.env.STRATEGAIZE_CTA_TOKEN_SECRET;
const ORIGINAL_EXPIRY = process.env.STRATEGAIZE_CTA_TOKEN_EXPIRY_DAYS;

const TEST_SECRET =
  "test_secret_must_be_long_enough_for_hmac_at_least_32_chars_aaaaaaaaaa";

const INPUT: CtaTokenInput = {
  capture_session_id: "cs-uuid-fixture-001",
  partner_organization_id: "po-uuid-fixture-001",
  mandant_email: "mandant@example.com",
};

describe("CTA Magic-Link-Token — HMAC-SHA256 (SLC-163 MT-2)", () => {
  beforeAll(() => {
    process.env.STRATEGAIZE_CTA_TOKEN_SECRET = TEST_SECRET;
    process.env.STRATEGAIZE_CTA_TOKEN_EXPIRY_DAYS = "90";
  });

  afterAll(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.STRATEGAIZE_CTA_TOKEN_SECRET;
    } else {
      process.env.STRATEGAIZE_CTA_TOKEN_SECRET = ORIGINAL_SECRET;
    }
    if (ORIGINAL_EXPIRY === undefined) {
      delete process.env.STRATEGAIZE_CTA_TOKEN_EXPIRY_DAYS;
    } else {
      process.env.STRATEGAIZE_CTA_TOKEN_EXPIRY_DAYS = ORIGINAL_EXPIRY;
    }
  });

  it("generate→verify roundtrip is valid", () => {
    const token = generateCtaMagicLinkToken(INPUT);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const result = verifyCtaMagicLinkToken(token);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.capture_session_id).toBe(INPUT.capture_session_id);
      expect(result.payload.partner_organization_id).toBe(
        INPUT.partner_organization_id,
      );
      expect(result.payload.mandant_email).toBe(INPUT.mandant_email);
      expect(result.payload.issued_at).toBeGreaterThan(0);
      expect(result.payload.expiry_at).toBeGreaterThan(result.payload.issued_at);
      const expectedDelta = 90 * 24 * 60 * 60;
      expect(result.payload.expiry_at - result.payload.issued_at).toBe(
        expectedDelta,
      );
    }
  });

  it("tampered signature is rejected with invalid_signature", () => {
    const token = generateCtaMagicLinkToken(INPUT);
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const result = verifyCtaMagicLinkToken(tampered);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("invalid_signature");
    }
  });

  it("tampered payload is rejected with invalid_signature", () => {
    const token = generateCtaMagicLinkToken(INPUT);
    const [payloadB64, sigB64] = token.split(".");
    const flippedPayload =
      payloadB64.slice(0, -1) + (payloadB64.endsWith("A") ? "B" : "A");
    const tampered = `${flippedPayload}.${sigB64}`;
    const result = verifyCtaMagicLinkToken(tampered);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("invalid_signature");
    }
  });

  it("expired token is rejected with expired", () => {
    const token = generateCtaMagicLinkToken(INPUT);
    // 91 days into the future → token (90 day expiry) is expired.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(Date.now() + 91 * 24 * 60 * 60 * 1000));
      const result = verifyCtaMagicLinkToken(token);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("expired");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("malformed token (no dot) is rejected", () => {
    const result = verifyCtaMagicLinkToken("not-a-valid-token-format");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("malformed");
    }
  });

  it("malformed token (empty parts) is rejected", () => {
    const result = verifyCtaMagicLinkToken(".sig");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toBe("malformed");
    }
  });

  it("throws when STRATEGAIZE_CTA_TOKEN_SECRET is missing", () => {
    delete process.env.STRATEGAIZE_CTA_TOKEN_SECRET;
    try {
      expect(() => generateCtaMagicLinkToken(INPUT)).toThrow(
        /STRATEGAIZE_CTA_TOKEN_SECRET/,
      );
    } finally {
      process.env.STRATEGAIZE_CTA_TOKEN_SECRET = TEST_SECRET;
    }
  });

  it("two consecutive generates produce different signatures (issued_at delta)", async () => {
    const a = generateCtaMagicLinkToken(INPUT);
    // Wait >=1s so issued_at differs deterministically.
    await new Promise((r) => setTimeout(r, 1100));
    const b = generateCtaMagicLinkToken(INPUT);
    expect(a).not.toBe(b);
  }, 5_000);

  it("rotating secret invalidates existing tokens", () => {
    const token = generateCtaMagicLinkToken(INPUT);
    process.env.STRATEGAIZE_CTA_TOKEN_SECRET = "different_secret_min_32_chars_aaaaaaaaaa";
    try {
      const result = verifyCtaMagicLinkToken(token);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("invalid_signature");
      }
    } finally {
      process.env.STRATEGAIZE_CTA_TOKEN_SECRET = TEST_SECRET;
    }
  });
});
