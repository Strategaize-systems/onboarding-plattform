// V8 SLC-151 MT-1+MT-2 — Vitest fuer Pure-Logic-Helpers der ModulPage-Component.

import { describe, it, expect } from "vitest";

import type {
  ModulKey,
  V8ReportSnapshot,
  V8StufenLookup,
  V8Template,
} from "@/lib/diagnose/types";
import {
  getAllModulPagesProps,
  modulIdxFromKey,
  resolveStufenInfo,
} from "../modul-page-resolvers";

const mockLookup: V8StufenLookup = {
  m1: {
    s1: { was_es_bedeutet: "m1-s1-bedeutung", unsere_empfehlung: "m1-s1-empfehlung" },
    s2: { was_es_bedeutet: "m1-s2-bedeutung", unsere_empfehlung: "m1-s2-empfehlung" },
    s3: { was_es_bedeutet: "m1-s3-bedeutung", unsere_empfehlung: "m1-s3-empfehlung" },
    s4: { was_es_bedeutet: "m1-s4-bedeutung", unsere_empfehlung: "m1-s4-empfehlung" },
    s5: { was_es_bedeutet: "m1-s5-bedeutung", unsere_empfehlung: "m1-s5-empfehlung" },
  },
  m2: {
    s1: { was_es_bedeutet: "m2-s1-bedeutung", unsere_empfehlung: "m2-s1-empfehlung" },
    s2: { was_es_bedeutet: "m2-s2-bedeutung", unsere_empfehlung: "m2-s2-empfehlung" },
    s3: { was_es_bedeutet: "m2-s3-bedeutung", unsere_empfehlung: "m2-s3-empfehlung" },
    s4: { was_es_bedeutet: "m2-s4-bedeutung", unsere_empfehlung: "m2-s4-empfehlung" },
    s5: { was_es_bedeutet: "m2-s5-bedeutung", unsere_empfehlung: "m2-s5-empfehlung" },
  },
} as unknown as V8StufenLookup;

describe("modulIdxFromKey", () => {
  it("maps m1 -> 0", () => {
    expect(modulIdxFromKey("m1")).toBe(0);
  });

  it("maps m9 -> 8", () => {
    expect(modulIdxFromKey("m9")).toBe(8);
  });

  it("maps m5 -> 4", () => {
    expect(modulIdxFromKey("m5")).toBe(4);
  });
});

describe("resolveStufenInfo — happy path", () => {
  it("returns correct entry for m1.stufe=3", () => {
    const info = resolveStufenInfo("m1", 3, mockLookup);
    expect(info.was_es_bedeutet).toBe("m1-s3-bedeutung");
    expect(info.unsere_empfehlung).toBe("m1-s3-empfehlung");
  });

  it("returns correct entry for m2.stufe=5", () => {
    const info = resolveStufenInfo("m2", 5, mockLookup);
    expect(info.was_es_bedeutet).toBe("m2-s5-bedeutung");
    expect(info.unsere_empfehlung).toBe("m2-s5-empfehlung");
  });

  it("returns correct entry for boundary stufe=1", () => {
    const info = resolveStufenInfo("m1", 1, mockLookup);
    expect(info.was_es_bedeutet).toBe("m1-s1-bedeutung");
  });
});

describe("resolveStufenInfo — defensive checks", () => {
  it("throws on stufe=0 (below valid range)", () => {
    expect(() => resolveStufenInfo("m1", 0, mockLookup)).toThrow(
      /invalid stufe 0/,
    );
  });

  it("throws on stufe=6 (above valid range)", () => {
    expect(() => resolveStufenInfo("m1", 6, mockLookup)).toThrow(
      /invalid stufe 6/,
    );
  });

  it("throws on stufe=2.5 (non-integer)", () => {
    expect(() => resolveStufenInfo("m1", 2.5, mockLookup)).toThrow(
      /invalid stufe 2\.5/,
    );
  });

  it("throws on unknown modulKey (lookup missing)", () => {
    expect(() =>
      resolveStufenInfo("m99" as never, 3, mockLookup),
    ).toThrow(/stufen_lookup missing for m99/);
  });

  it("throws when modulKey exists but stufe-entry incomplete (empty was_es_bedeutet)", () => {
    const incomplete: V8StufenLookup = {
      m1: {
        ...mockLookup.m1,
        s3: { was_es_bedeutet: "", unsere_empfehlung: "ok" },
      },
    } as unknown as V8StufenLookup;
    expect(() => resolveStufenInfo("m1", 3, incomplete)).toThrow(
      /missing or incomplete for m1\.s3/,
    );
  });

  it("throws when modulKey exists but stufe-entry incomplete (empty unsere_empfehlung)", () => {
    const incomplete: V8StufenLookup = {
      m1: {
        ...mockLookup.m1,
        s3: { was_es_bedeutet: "ok", unsere_empfehlung: "" },
      },
    } as unknown as V8StufenLookup;
    expect(() => resolveStufenInfo("m1", 3, incomplete)).toThrow(
      /missing or incomplete for m1\.s3/,
    );
  });
});

describe("modulIdxFromKey — defensive", () => {
  it("throws on invalid modulKey", () => {
    expect(() => modulIdxFromKey("m99" as never)).toThrow(
      /invalid modulKey/,
    );
  });
});

// ============================================================
// MT-2: getAllModulPagesProps
// ============================================================

const MODUL_KEYS_M1_M9: ModulKey[] = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"];

function makeFullStufenLookup(): V8StufenLookup {
  const lookup: Partial<V8StufenLookup> = {};
  for (const key of MODUL_KEYS_M1_M9) {
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

function makeWorumEsGeht(): Record<ModulKey, string> {
  const m: Partial<Record<ModulKey, string>> = {};
  for (const key of MODUL_KEYS_M1_M9) m[key] = `${key}-worum-es-geht`;
  return m as Record<ModulKey, string>;
}

function makeSnapshot(): V8ReportSnapshot {
  return {
    schemaVersion: 1,
    finalizedAt: "2026-05-30T10:00:00Z",
    moduleScores: { m1: 8, m2: 2, m3: 5, m4: 2, m5: 9, m6: 3, m7: 7, m8: 4, m9: 6 },
    sui: 50,
    classification: {
      kind: "teil_reife",
      color: "amber",
      label: "Teil-Reife",
      meaning: "Mock",
    },
    stufenMapping: { m1: 4, m2: 2, m3: 3, m4: 2, m5: 5, m6: 2, m7: 4, m8: 3, m9: 3 },
    hausaufgaben: [],
    reflexionen: [],
    hebel: [],
  };
}

function makeTemplate(overrides: Partial<V8Template> = {}): V8Template {
  const base: V8Template = {
    slug: "exit-readiness-teaser-v1",
    version: 1,
    name: "Mock-Template",
    description: "Mock",
    metadata: {
      usage_kind: "mandanten_report_teaser_v1",
      scoring_kind: "sui_weighted",
      report_renderer: "mandanten_report_v2",
      gewichtung: { m1: 1, m2: 1, m3: 1, m4: 1, m5: 1, m6: 1, m7: 1, m8: 1, m9: 2 },
      stufen_lookup: makeFullStufenLookup(),
      worum_es_geht: makeWorumEsGeht(),
    },
    blocks: MODUL_KEYS_M1_M9.map((key) => ({
      modul_id: key.toUpperCase(),
      name: `Mock-${key}-Name`,
      answer_schema_kind: "reife_skala_5",
      questions: [],
    })),
  };
  return { ...base, ...overrides };
}

describe("getAllModulPagesProps — happy path", () => {
  it("returns exactly 9 entries in m1..m9 order", () => {
    const props = getAllModulPagesProps(makeSnapshot(), makeTemplate());
    expect(props).toHaveLength(9);
    expect(props.map((p) => p.modulKey)).toEqual(MODUL_KEYS_M1_M9);
  });

  it("populates modulName from template.blocks", () => {
    const props = getAllModulPagesProps(makeSnapshot(), makeTemplate());
    expect(props[0].modulName).toBe("Mock-m1-Name");
    expect(props[8].modulName).toBe("Mock-m9-Name");
  });

  it("populates modulScore and modulStufe from snapshot", () => {
    const props = getAllModulPagesProps(makeSnapshot(), makeTemplate());
    expect(props[0].modulScore).toBe(8);
    expect(props[0].modulStufe).toBe(4);
    expect(props[1].modulScore).toBe(2);
    expect(props[1].modulStufe).toBe(2);
    expect(props[8].modulScore).toBe(6);
    expect(props[8].modulStufe).toBe(3);
  });

  it("resolves stufenInfo for each module", () => {
    const props = getAllModulPagesProps(makeSnapshot(), makeTemplate());
    expect(props[0].stufenInfo.was_es_bedeutet).toBe("m1-s4-was");
    expect(props[0].stufenInfo.unsere_empfehlung).toBe("m1-s4-empf");
    expect(props[4].stufenInfo.was_es_bedeutet).toBe("m5-s5-was");
  });

  it("populates worumEsGeht for each module", () => {
    const props = getAllModulPagesProps(makeSnapshot(), makeTemplate());
    expect(props[0].worumEsGeht).toBe("m1-worum-es-geht");
    expect(props[8].worumEsGeht).toBe("m9-worum-es-geht");
  });

  it("uses snapshot.moduleScores as wheelScores for all entries", () => {
    const snapshot = makeSnapshot();
    const props = getAllModulPagesProps(snapshot, makeTemplate());
    for (const entry of props) {
      expect(entry.wheelScores).toBe(snapshot.moduleScores);
    }
  });

  it("assigns sequential page numbers starting at 4 by default", () => {
    const props = getAllModulPagesProps(makeSnapshot(), makeTemplate());
    expect(props.map((p) => p.pageNumber)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("honors custom startingPageNumber", () => {
    const props = getAllModulPagesProps(makeSnapshot(), makeTemplate(), "X-GmbH", 100);
    expect(props[0].pageNumber).toBe(100);
    expect(props[8].pageNumber).toBe(108);
  });

  it("forwards mandantName", () => {
    const props = getAllModulPagesProps(makeSnapshot(), makeTemplate(), "Mueller GmbH");
    for (const entry of props) {
      expect(entry.mandantName).toBe("Mueller GmbH");
    }
  });
});

describe("getAllModulPagesProps — defensive (Template-Drift)", () => {
  it("throws when template.blocks is missing a Modul (M5 case)", () => {
    const template = makeTemplate();
    template.blocks = template.blocks.filter((b) => b.modul_id !== "M5");
    expect(() => getAllModulPagesProps(makeSnapshot(), template)).toThrow(
      /template\.blocks missing entry for "M5"/,
    );
  });

  it("throws when block.name is empty", () => {
    const template = makeTemplate();
    template.blocks = template.blocks.map((b) =>
      b.modul_id === "M3" ? { ...b, name: "  " } : b,
    );
    expect(() => getAllModulPagesProps(makeSnapshot(), template)).toThrow(
      /template\.blocks\[M3\]\.name is empty/,
    );
  });

  it("throws when worum_es_geht is missing for a Modul", () => {
    const template = makeTemplate();
    const worum = { ...(template.metadata.worum_es_geht ?? {}) };
    delete (worum as Partial<Record<ModulKey, string>>).m7;
    template.metadata.worum_es_geht = worum as Record<ModulKey, string>;
    expect(() => getAllModulPagesProps(makeSnapshot(), template)).toThrow(
      /worum_es_geht missing for m7/,
    );
  });

  it("throws when worum_es_geht is empty-string for a Modul", () => {
    const template = makeTemplate();
    (template.metadata.worum_es_geht as Record<ModulKey, string>).m2 = "   ";
    expect(() => getAllModulPagesProps(makeSnapshot(), template)).toThrow(
      /worum_es_geht missing for m2/,
    );
  });

  it("throws when template.metadata.worum_es_geht is undefined", () => {
    const template = makeTemplate();
    template.metadata.worum_es_geht = undefined;
    expect(() => getAllModulPagesProps(makeSnapshot(), template)).toThrow(
      /worum_es_geht is required/,
    );
  });

  it("propagates resolveStufenInfo Error (stufe outside 1..5)", () => {
    const snapshot = makeSnapshot();
    snapshot.stufenMapping = { ...snapshot.stufenMapping, m3: 9 };
    expect(() => getAllModulPagesProps(snapshot, makeTemplate())).toThrow(
      /invalid stufe 9 for m3/,
    );
  });
});
