// V8 SLC-150 MT-2 — Vitest fuer RendererInput-Defensive-Validator.
//
// Pure-Function-Tests. Kein @react-pdf-Render-Path (Component-Render-Tests
// kommen in MT-7 als Visual-Smoke gegen Founder-Verdict).

import { describe, it, expect } from "vitest";

import { validateRendererInput } from "../types";
import type { RendererInput } from "../types";
import type {
  ModulKey,
  V8ReportSnapshot,
  V8StufenLookup,
  V8Template,
} from "@/lib/diagnose/types";

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

const VALID_MODULE_NAMES: Record<ModulKey, string> = {
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

const MODUL_KEYS: ModulKey[] = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"];

function makeValidStufenLookup(): V8StufenLookup {
  const lookup: Partial<V8StufenLookup> = {};
  for (const key of MODUL_KEYS) {
    lookup[key] = {
      s1: { was_es_bedeutet: `${key}-s1-was`, unsere_empfehlung: `${key}-s1-empf` },
      s2: { was_es_bedeutet: `${key}-s2-was`, unsere_empfehlung: `${key}-s2-empf` },
      s3: { was_es_bedeutet: `${key}-s3-was`, unsere_empfehlung: `${key}-s3-empf` },
      s4: { was_es_bedeutet: `${key}-s4-was`, unsere_empfehlung: `${key}-s4-empf` },
      s5: { was_es_bedeutet: `${key}-s5-was`, unsere_empfehlung: `${key}-s5-empf` },
    };
  }
  return lookup as V8StufenLookup;
}

function makeValidWorumEsGeht(): Record<ModulKey, string> {
  const m: Partial<Record<ModulKey, string>> = {};
  for (const key of MODUL_KEYS) m[key] = `${key}-worum`;
  return m as Record<ModulKey, string>;
}

const VALID_TEMPLATE: V8Template = {
  slug: "exit-readiness-teaser-v1",
  version: 1,
  name: "Mock",
  description: "Mock",
  metadata: {
    usage_kind: "mandanten_report_teaser_v1",
    scoring_kind: "sui_weighted",
    report_renderer: "mandanten_report_v2",
    gewichtung: { m1: 1, m2: 1, m3: 1, m4: 1, m5: 1, m6: 1, m7: 1, m8: 1, m9: 2 },
    stufen_lookup: makeValidStufenLookup(),
    worum_es_geht: makeValidWorumEsGeht(),
  },
  blocks: MODUL_KEYS.map((key) => ({
    modul_id: key.toUpperCase(),
    name: VALID_MODULE_NAMES[key],
    answer_schema_kind: "reife_skala_5",
    questions: [],
  })),
};

const VALID_INPUT: RendererInput = {
  snapshot: VALID_SNAPSHOT,
  mandant: { name: "Mueller Praezisionstechnik GmbH", datum: "2026-05-29" },
  moduleNames: VALID_MODULE_NAMES,
  template: VALID_TEMPLATE,
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

  it("rejects missing template (SLC-151 Phase B)", () => {
    const input = { ...VALID_INPUT, template: undefined } as unknown as RendererInput;
    expect(() => validateRendererInput(input)).toThrow(/template is required/);
  });

  it("rejects missing template.metadata.stufen_lookup", () => {
    const input: RendererInput = {
      ...VALID_INPUT,
      template: {
        ...VALID_TEMPLATE,
        metadata: { ...VALID_TEMPLATE.metadata, stufen_lookup: undefined as never },
      },
    };
    expect(() => validateRendererInput(input)).toThrow(/stufen_lookup is required/);
  });

  it("rejects missing template.metadata.worum_es_geht", () => {
    const input: RendererInput = {
      ...VALID_INPUT,
      template: {
        ...VALID_TEMPLATE,
        metadata: { ...VALID_TEMPLATE.metadata, worum_es_geht: undefined },
      },
    };
    expect(() => validateRendererInput(input)).toThrow(/worum_es_geht is required/);
  });

  it("rejects empty template.blocks", () => {
    const input: RendererInput = {
      ...VALID_INPUT,
      template: { ...VALID_TEMPLATE, blocks: [] },
    };
    expect(() => validateRendererInput(input)).toThrow(/template\.blocks is required/);
  });
});
