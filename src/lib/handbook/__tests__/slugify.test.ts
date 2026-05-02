// SLC-052 MT-1 — slugifyHeading Tests.
//
// Outputs are calibrated against github-slugger / rehype-slug actual behavior
// (verified via `node -e` on installed version). Diacritics are preserved by
// design — see slugify.ts header comment.

import { describe, expect, it } from "vitest";
import { slugifyHeading } from "../slugify";

describe("slugifyHeading", () => {
  it("kebab-cases a plain heading", () => {
    expect(slugifyHeading("Mitarbeiter-Strategie")).toBe("mitarbeiter-strategie");
  });

  it("strips terminating punctuation", () => {
    expect(slugifyHeading("Was bedeutet Verantwortung?")).toBe(
      "was-bedeutet-verantwortung",
    );
  });

  it("preserves umlauts and lowercases (rehype-slug parity)", () => {
    expect(slugifyHeading("ÜberArbeit")).toBe("überarbeit");
    expect(slugifyHeading("Über Mitarbeiter führen")).toBe(
      "über-mitarbeiter-führen",
    );
  });

  it("collapses-but-keeps multi-space gaps as dashes (rehype-slug parity)", () => {
    expect(slugifyHeading("Multi   Space")).toBe("multi---space");
  });

  it("handles numbers and punctuation in headings", () => {
    expect(slugifyHeading("Section 01: Foo")).toBe("section-01-foo");
  });

  it("returns empty string for empty input", () => {
    expect(slugifyHeading("")).toBe("");
  });
});
