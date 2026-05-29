// V8 SLC-149 MT-1 — Pure-Logic Tests fuer HygieneAnswerPills (FEAT-065).
//
// Vitest in node-env. Komponente selbst (HygieneAnswerPills.tsx) wird via
// /qa-Live-Smoke verifiziert (gleiche Konvention wie HelperTextModal +
// EditableText + Walkthrough).

import { describe, it, expect } from "vitest";
import { getNextValue } from "../hygiene-answer-pills-logic";

describe("getNextValue", () => {
  it("returns clicked value when current is undefined", () => {
    expect(getNextValue(undefined, "ja")).toBe("ja");
  });

  it("returns clicked value when current is null", () => {
    expect(getNextValue(null, "ja")).toBe("ja");
  });

  it("switches to new value when clicked value differs from current", () => {
    expect(getNextValue("ja", "teilweise")).toBe("teilweise");
  });

  it("returns null (toggle-off) when clicked value equals current", () => {
    expect(getNextValue("ja", "ja")).toBeNull();
  });

  it("switches from nein to ja", () => {
    expect(getNextValue("nein", "ja")).toBe("ja");
  });
});
