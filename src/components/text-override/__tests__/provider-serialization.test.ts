// V7.1 SLC-137 MT-2 — Provider-Serialization-Smoke (FEAT-056).
//
// Vitest in node-env. Wir testen die Serialisierungs-Schnittstelle zwischen
// Server-Component (Provider.tsx) und Client-Component (TextOverrideClient
// Provider): Map -> Array.from(entries) -> new Map(entries) muss
// rundtrip-stabil sein, sonst verlieren wir Overrides beim SSR-Boundary.

import { describe, it, expect } from "vitest";

describe("Map<->entries roundtrip (SSR boundary)", () => {
  it("rebuilds an identical Map from Array.from(entries)", () => {
    const src = new Map<string, string>([
      ["diagnose.bericht.cta", "Mehr erfahren"],
      ["template.partner_diagnostic.block.q1.label", "Frage 1 Override"],
      ["email.verify_signup.subject", "Bestaetigen Sie Ihre E-Mail"],
    ]);
    const entries = Array.from(src.entries());
    const rebuilt = new Map(entries);

    expect(rebuilt.size).toBe(src.size);
    expect(rebuilt.get("diagnose.bericht.cta")).toBe("Mehr erfahren");
    expect(rebuilt.get("template.partner_diagnostic.block.q1.label")).toBe(
      "Frage 1 Override",
    );
    expect(rebuilt.get("email.verify_signup.subject")).toBe(
      "Bestaetigen Sie Ihre E-Mail",
    );
  });

  it("preserves empty-string overrides through serialization", () => {
    const src = new Map<string, string>([["section.tagline", ""]]);
    const entries = Array.from(src.entries());
    const rebuilt = new Map(entries);
    expect(rebuilt.has("section.tagline")).toBe(true);
    expect(rebuilt.get("section.tagline")).toBe("");
  });

  it("preserves Unicode + line breaks (relevant for closing_statement)", () => {
    const value = "Reife-Bewertung\n\n- Punkt A\n- Punkt B\n\nVielen Dank!";
    const src = new Map<string, string>([
      ["template.partner_diagnostic.closing", value],
    ]);
    const entries = Array.from(src.entries());
    const rebuilt = new Map(entries);
    expect(rebuilt.get("template.partner_diagnostic.closing")).toBe(value);
  });

  it("handles empty Map", () => {
    const src = new Map<string, string>();
    const entries = Array.from(src.entries());
    const rebuilt = new Map(entries);
    expect(rebuilt.size).toBe(0);
  });
});
