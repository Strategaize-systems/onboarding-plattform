// V9.1 SLC-V9.1-A MT-3 — HMAC-Verify Unit-Tests (offline, kein DB/AWS).

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";

import { computeInboundSignature, verifyInboundHmac } from "../hmac";

const SECRET = "0123456789abcdef0123456789abcdef"; // 32-char shared secret
const BODY = JSON.stringify({
  raw_eml_base64: "ZW1haWwtYm9keQ==",
  s3_key: "inbound/2026-06-10/msg-1.eml",
  message_id: "msg-1",
  recipient: "bulk-acme@bulk.strategaizetransition.com",
});

describe("computeInboundSignature", () => {
  it("produces a sha256=<hex> formatted signature", () => {
    const sig = computeInboundSignature(BODY, SECRET);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("matches a manually computed HMAC-SHA256 hex digest", () => {
    const expected =
      "sha256=" + createHmac("sha256", SECRET).update(BODY, "utf-8").digest("hex");
    expect(computeInboundSignature(BODY, SECRET)).toBe(expected);
  });

  it("is deterministic for the same body + secret", () => {
    expect(computeInboundSignature(BODY, SECRET)).toBe(
      computeInboundSignature(BODY, SECRET),
    );
  });
});

describe("verifyInboundHmac", () => {
  it("returns true for a valid signature", () => {
    const sig = computeInboundSignature(BODY, SECRET);
    expect(verifyInboundHmac(BODY, sig, SECRET)).toBe(true);
  });

  it("returns false for a mismatched signature (tampered body)", () => {
    const sig = computeInboundSignature(BODY, SECRET);
    expect(verifyInboundHmac(BODY + "tamper", sig, SECRET)).toBe(false);
  });

  it("returns false for an empty signature", () => {
    expect(verifyInboundHmac(BODY, "", SECRET)).toBe(false);
  });

  it("returns false for a wrong secret (same length digest)", () => {
    const sig = computeInboundSignature(BODY, SECRET);
    expect(verifyInboundHmac(BODY, sig, "ffffffffffffffffffffffffffffffff")).toBe(
      false,
    );
  });

  it("returns false for an empty secret", () => {
    const sig = computeInboundSignature(BODY, SECRET);
    expect(verifyInboundHmac(BODY, sig, "")).toBe(false);
  });

  it("returns false for a malformed signature without sha256= prefix", () => {
    const hexOnly = createHmac("sha256", SECRET)
      .update(BODY, "utf-8")
      .digest("hex");
    expect(verifyInboundHmac(BODY, hexOnly, SECRET)).toBe(false);
  });
});
