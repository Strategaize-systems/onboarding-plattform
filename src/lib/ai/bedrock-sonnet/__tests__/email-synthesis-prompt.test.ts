// V9.8 SLC-V9.8-B MT-2 — Vitest fuer buildSynthesisUserPrompt existingTags-Block.
//
// Spec: slices/SLC-V9.8-B-controlled-tag-vokabular.md (MT-2 Verification)
// Coverage: Block + Regel bei vorhandenem Vokabular; byte-identisch zur
//   Baseline bei [] (AC-B-2, 0 Regression); Trim/Skip-Empty.

import { describe, it, expect } from "vitest";

import {
  buildSynthesisUserPrompt,
  type SynthesisInputPatternForPrompt,
} from "../email-synthesis-prompt";

const SECTION = "lieferung/zeiten";
const PATTERNS: SynthesisInputPatternForPrompt[] = [
  {
    id: "p1",
    title: "Lieferzeit-Frage",
    description: "Kunde fragt nach Lieferzeit.",
    evidence_snippets: ["wann kommt die Ware?"],
    themes: ["lieferung"],
    confidence: 0.8,
    thread_id: "t-a",
  },
];

describe("buildSynthesisUserPrompt — existingTags injection (MT-2)", () => {
  it("is byte-identical to the baseline when existingTags is empty (AC-B-2)", () => {
    const withDefault = buildSynthesisUserPrompt(SECTION, PATTERNS);
    const withEmpty = buildSynthesisUserPrompt(SECTION, PATTERNS, []);
    expect(withEmpty).toBe(withDefault);
    expect(withDefault).not.toContain("Bestehendes Tag-Vokabular");
  });

  it("injects the vocabulary block + rule when tags are present", () => {
    const prompt = buildSynthesisUserPrompt(SECTION, PATTERNS, [
      "lieferung",
      "pricing",
    ]);
    expect(prompt).toContain("Bestehendes Tag-Vokabular dieses Unternehmens");
    expect(prompt).toContain(JSON.stringify(["lieferung", "pricing"]));
    expect(prompt).toContain("Nutze fuer das `themes`-Feld");
    expect(prompt).toContain("nur dann ein NEUES Tag");
    // The base content (patterns JSON + final instruction) is still present.
    expect(prompt).toContain("Eingabe-Patterns (JSON-Array):");
    expect(prompt).toContain("Beginne mit `{` und beende mit `}`.");
  });

  it("trims and skips empty/whitespace tags", () => {
    const prompt = buildSynthesisUserPrompt(SECTION, PATTERNS, [
      "  pricing  ",
      "",
      "   ",
    ]);
    expect(prompt).toContain(JSON.stringify(["pricing"]));
  });

  it("omits the block when all tags are blank (treated as empty → baseline)", () => {
    const baseline = buildSynthesisUserPrompt(SECTION, PATTERNS, []);
    const blank = buildSynthesisUserPrompt(SECTION, PATTERNS, ["", "   "]);
    expect(blank).toBe(baseline);
  });
});
