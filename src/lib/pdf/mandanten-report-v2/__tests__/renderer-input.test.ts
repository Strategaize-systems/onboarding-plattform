// V8 SLC-150 MT-2 — Vitest fuer RendererInput-Defensive-Validator.
//
// Pure-Function-Tests. Kein @react-pdf-Render-Path (Component-Render-Tests
// kommen in MT-7 als Visual-Smoke gegen Founder-Verdict).

import { describe, it, expect } from "vitest";

import { validateRendererInput } from "../types";
import type { RendererInput } from "../types";
import type { V8ReportSnapshot } from "@/lib/diagnose/types";

const VALID_SNAPSHOT: V8ReportSnapshot = {
  schemaVersion: 1,
  finalizedAt: "2026-05-29T10:00:00Z",
  moduleScores: { m1: 8, m2: 2, m3: 5, m4: 2, m5: 9, m6: 3, m7: 7, m8: 4, m9: 6 },
  sui: 67,
  classification: {
    kind: "tragbar",
    color: "gruen",
    label: "Tragbar",
    meaning: "Grundsaetzlich uebergabefaehig.",
  },
  stufenMapping: { m1: 4, m2: 2, m3: 3, m4: 2, m5: 5, m6: 2, m7: 4, m8: 3, m9: 3 },
  hausaufgaben: [],
  reflexionen: [],
  hebel: [],
};

const VALID_MODULE_NAMES = {
  m1: "Strategie & Vision",
  m2: "Fuehrung & Nachfolge",
  m3: "Organisation & Prozesse",
  m4: "Finanzen & Controlling",
  m5: "Vertrieb & Kunden",
  m6: "Produkt & Innovation",
  m7: "Personal & Kultur",
  m8: "IT & Daten",
  m9: "Recht & Compliance",
};

const VALID_INPUT: RendererInput = {
  snapshot: VALID_SNAPSHOT,
  mandant: { name: "Mueller Praezisionstechnik GmbH", datum: "2026-05-29" },
  moduleNames: VALID_MODULE_NAMES,
};

describe("validateRendererInput", () => {
  it("accepts a complete valid input", () => {
    expect(validateRendererInput(VALID_INPUT)).toBe(true);
  });

  it("accepts input with optional stb", () => {
    const input: RendererInput = {
      ...VALID_INPUT,
      stb: { firma: "StB Wagner & Partner", standort: "Duesseldorf" },
    };
    expect(validateRendererInput(input)).toBe(true);
  });

  it("rejects missing snapshot", () => {
    const input = { ...VALID_INPUT, snapshot: undefined } as unknown as RendererInput;
    expect(() => validateRendererInput(input)).toThrow(/snapshot is required/);
  });

  it("rejects missing classification", () => {
    const input = {
      ...VALID_INPUT,
      snapshot: { ...VALID_SNAPSHOT, classification: undefined },
    } as unknown as RendererInput;
    expect(() => validateRendererInput(input)).toThrow(/classification is required/);
  });

  it("rejects missing moduleScores", () => {
    const input = {
      ...VALID_INPUT,
      snapshot: { ...VALID_SNAPSHOT, moduleScores: undefined },
    } as unknown as RendererInput;
    expect(() => validateRendererInput(input)).toThrow(/moduleScores is required/);
  });

  it("rejects empty mandant.name", () => {
    const input: RendererInput = {
      ...VALID_INPUT,
      mandant: { name: "   ", datum: "2026-05-29" },
    };
    expect(() => validateRendererInput(input)).toThrow(/mandant.name is required/);
  });

  it("rejects empty mandant.datum", () => {
    const input: RendererInput = {
      ...VALID_INPUT,
      mandant: { name: "Mueller GmbH", datum: "" },
    };
    expect(() => validateRendererInput(input)).toThrow(/mandant.datum is required/);
  });

  it("rejects missing moduleNames", () => {
    const input = { ...VALID_INPUT, moduleNames: undefined } as unknown as RendererInput;
    expect(() => validateRendererInput(input)).toThrow(/moduleNames is required/);
  });

  it("rejects missing single moduleNames key", () => {
    const input: RendererInput = {
      ...VALID_INPUT,
      moduleNames: { ...VALID_MODULE_NAMES, m5: "" },
    };
    expect(() => validateRendererInput(input)).toThrow(/moduleNames.m5 is required/);
  });
});
