// SLC-195 MT-2 — Pure-Mock-Test fuer verifyCronSecret. AC-195-2 (timing-safe,
// korrekt/falsch/Length-Mismatch).

import { describe, it, expect } from "vitest";
import { verifyCronSecret } from "./cron-secret";

describe("verifyCronSecret (SLC-195 MT-2)", () => {
  it("returns true for an exact match", () => {
    expect(verifyCronSecret("s3cr3t-value", "s3cr3t-value")).toBe(true);
  });

  it("returns false for a wrong secret of equal length", () => {
    expect(verifyCronSecret("s3cr3t-valuX", "s3cr3t-value")).toBe(false);
  });

  it("returns false on length mismatch (no timingSafeEqual crash)", () => {
    expect(verifyCronSecret("short", "s3cr3t-value")).toBe(false);
    expect(verifyCronSecret("s3cr3t-value-longer", "s3cr3t-value")).toBe(false);
  });

  it("returns false for null/empty header (fail-closed)", () => {
    expect(verifyCronSecret(null, "s3cr3t-value")).toBe(false);
    expect(verifyCronSecret("", "s3cr3t-value")).toBe(false);
    expect(verifyCronSecret(undefined, "s3cr3t-value")).toBe(false);
  });

  it("returns false for undefined/empty expected secret (misconfig fail-closed)", () => {
    expect(verifyCronSecret("anything", undefined)).toBe(false);
    expect(verifyCronSecret("anything", "")).toBe(false);
  });
});
