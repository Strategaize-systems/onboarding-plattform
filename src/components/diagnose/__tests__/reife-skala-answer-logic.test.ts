// V8 SLC-149 MT-2 — Pure-Logic Tests fuer ReifeSkalaAnswer (FEAT-064).
//
// Vitest in node-env. Komponente selbst (ReifeSkalaAnswer.tsx) wird via
// /qa-Live-Smoke verifiziert (gleiche Konvention wie HelperTextModal-Logic).

import { describe, it, expect } from "vitest";
import {
  stufeToScore,
  scoreToStufe,
  formatStufeLabel,
  type ScoreMapping,
} from "../reife-skala-answer-logic";

const MAPPING: ScoreMapping = { 1: 0, 2: 2, 3: 5, 4: 8, 5: 10 };

describe("stufeToScore", () => {
  it("maps Stufe 1 to 0", () => {
    expect(stufeToScore(1, MAPPING)).toBe(0);
  });

  it("maps Stufe 3 to 5", () => {
    expect(stufeToScore(3, MAPPING)).toBe(5);
  });

  it("maps Stufe 5 to 10", () => {
    expect(stufeToScore(5, MAPPING)).toBe(10);
  });
});

describe("scoreToStufe", () => {
  it("reverse-maps 0 to Stufe 1", () => {
    expect(scoreToStufe(0, MAPPING)).toBe(1);
  });

  it("reverse-maps 5 to Stufe 3", () => {
    expect(scoreToStufe(5, MAPPING)).toBe(3);
  });

  it("reverse-maps 10 to Stufe 5", () => {
    expect(scoreToStufe(10, MAPPING)).toBe(5);
  });

  it("returns null for non-exact match (defensive)", () => {
    expect(scoreToStufe(7, MAPPING)).toBeNull();
  });
});

describe("formatStufeLabel", () => {
  it("returns label for Stufe 1", () => {
    expect(formatStufeLabel(1)).toBe("Noch gar nicht vorhanden");
  });

  it("returns label for Stufe 5", () => {
    expect(formatStufeLabel(5)).toBe("Vollstaendig etabliert + belastbar");
  });
});
