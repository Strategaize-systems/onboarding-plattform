// V9.1 SLC-V9.1-A MT-4 — Setup-Token-Verify Unit-Tests (offline).

import { describe, it, expect } from "vitest";

import { verifySetupToken } from "../validation/setup-token";

const TOKEN = "tok_abcdef0123456789abcdef0123456789";

describe("verifySetupToken", () => {
  it("returns true for an exact match", () => {
    expect(verifySetupToken(TOKEN, TOKEN)).toBe(true);
  });

  it("returns false for a mismatch (same length)", () => {
    const wrong = "tok_ffffff0123456789abcdef0123456789";
    expect(wrong.length).toBe(TOKEN.length);
    expect(verifySetupToken(wrong, TOKEN)).toBe(false);
  });

  it("returns false for a different-length token", () => {
    expect(verifySetupToken(TOKEN + "x", TOKEN)).toBe(false);
  });

  it("returns false for null/undefined provided token", () => {
    expect(verifySetupToken(null, TOKEN)).toBe(false);
    expect(verifySetupToken(undefined, TOKEN)).toBe(false);
  });

  it("returns false for empty provided token", () => {
    expect(verifySetupToken("", TOKEN)).toBe(false);
  });

  it("returns false for empty expected token", () => {
    expect(verifySetupToken(TOKEN, "")).toBe(false);
  });
});
