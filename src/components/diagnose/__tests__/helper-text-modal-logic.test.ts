// V7.1 SLC-138 MT-4 — Pure-Logic Tests fuer HelperTextModal (FEAT-057).
//
// Vitest in node-env. Komponente selbst (HelperTextModal.tsx) wird via
// /qa-Live-Smoke verifiziert (gleiche Konvention wie EditableText + Walkthrough).

import { describe, it, expect } from "vitest";
import {
  shouldShowInfoIcon,
  normalizeHelperContent,
  buildHelperKeyPaths,
} from "../helper-text-modal-logic";

describe("shouldShowInfoIcon", () => {
  it("returns false when both fields are undefined", () => {
    expect(shouldShowInfoIcon({})).toBe(false);
  });

  it("returns false when both fields are null", () => {
    expect(
      shouldShowInfoIcon({ helperText: null, examplesMd: null }),
    ).toBe(false);
  });

  it("returns false when both fields are whitespace only", () => {
    expect(
      shouldShowInfoIcon({ helperText: "   ", examplesMd: "\n\t  " }),
    ).toBe(false);
  });

  it("returns true when only helperText has content", () => {
    expect(
      shouldShowInfoIcon({ helperText: "Definition", examplesMd: null }),
    ).toBe(true);
  });

  it("returns true when only examplesMd has content", () => {
    expect(
      shouldShowInfoIcon({ helperText: "", examplesMd: "- foo" }),
    ).toBe(true);
  });

  it("returns true when both fields have content", () => {
    expect(
      shouldShowInfoIcon({ helperText: "Def", examplesMd: "- ex" }),
    ).toBe(true);
  });
});

describe("normalizeHelperContent", () => {
  it("normalizes whitespace-only to null", () => {
    expect(
      normalizeHelperContent({ helperText: "   ", examplesMd: "\n" }),
    ).toEqual({ helperText: null, examplesMd: null });
  });

  it("trims whitespace around content", () => {
    expect(
      normalizeHelperContent({
        helperText: "  Definition  ",
        examplesMd: "\n- Beispiel\n",
      }),
    ).toEqual({ helperText: "Definition", examplesMd: "- Beispiel" });
  });

  it("returns null for undefined fields", () => {
    expect(normalizeHelperContent({})).toEqual({
      helperText: null,
      examplesMd: null,
    });
  });

  it("preserves multi-line content", () => {
    const md = "- a\n- b\n- c";
    expect(
      normalizeHelperContent({ helperText: "First line", examplesMd: md }),
    ).toEqual({ helperText: "First line", examplesMd: md });
  });
});

describe("buildHelperKeyPaths", () => {
  it("composes key prefix from template slug + question key", () => {
    expect(
      buildHelperKeyPaths("partner_diagnostic", "ki_reife.q1"),
    ).toEqual({
      helperTextKey:
        "template.partner_diagnostic.question.ki_reife.q1.helper_text",
      examplesMdKey:
        "template.partner_diagnostic.question.ki_reife.q1.examples_md",
    });
  });

  it("supports different template slugs", () => {
    expect(
      buildHelperKeyPaths("exit_readiness", "phase1.q3"),
    ).toEqual({
      helperTextKey:
        "template.exit_readiness.question.phase1.q3.helper_text",
      examplesMdKey:
        "template.exit_readiness.question.phase1.q3.examples_md",
    });
  });
});
