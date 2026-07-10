// SLC-194 MT-3 — Pure-Mock-Test fuer den CSP-Builder. Prueft die Direktiven-Struktur
// (Code-Level-AC). Das funktionale Live-Verhalten (0 Console-CSP-Violations,
// Report-Only→enforcing) verifiziert /qa im Browser-Smoke (security-headers-live-smoke.md).

import { describe, it, expect } from "vitest";
import { buildCSP, COOP_VALUE } from "./csp";

describe("buildCSP (MT-3)", () => {
  const csp = buildCSP("https://kong.example.com", "https://meet.example.com");

  it("includes the core hardening directives", () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("allowlists supabase in connect-src", () => {
    expect(csp).toMatch(/connect-src[^;]*https:\/\/kong\.example\.com/);
  });

  it("allowlists jitsi in BOTH script-src and frame-src (embedded, not popup)", () => {
    expect(csp).toMatch(/script-src[^;]*https:\/\/meet\.example\.com/);
    expect(csp).toMatch(/frame-src[^;]*https:\/\/meet\.example\.com/);
  });

  it("does NOT allowlist bedrock or sentry (OP divergence, DEC-288)", () => {
    expect(csp).not.toContain("bedrock");
    expect(csp).not.toContain("sentry");
  });

  it("uses 'unsafe-inline' for script-src (no nonce, DEC-288)", () => {
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });

  it("omits report-uri by default, includes it when supplied", () => {
    expect(csp).not.toContain("report-uri");
    expect(buildCSP("https://k", "https://j", "https://r/csp")).toContain(
      "report-uri https://r/csp",
    );
  });

  it("degrades gracefully when supabase/jitsi are empty", () => {
    const bare = buildCSP("", "");
    expect(bare).toContain("connect-src 'self'");
    expect(bare).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'");
    expect(bare).toContain("frame-src 'self'");
    // kein doppeltes Leerzeichen / haengendes Token durch leere Werte
    expect(bare).not.toMatch(/\s{2,}/);
  });

  it("COOP allows popups (window.open) while blocking cross-origin openers", () => {
    expect(COOP_VALUE).toBe("same-origin-allow-popups");
  });
});
