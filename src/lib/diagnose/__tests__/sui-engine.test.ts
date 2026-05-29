// V8 SLC-148 MT-4 — Vitest fuer Pure-Function-Library `sui-engine`.
//
// Deterministische Tests gegen ein Mock-Template (kein DB-Touch). Alle 7
// Funktionen werden gegen die FEAT-065 Acceptance-Criteria der Slice-Spec
// MT-4 verifiziert (SLC-148 Z. 257-275).

import { describe, it, expect } from "vitest";

import {
  computeModuleScores,
  computeSui,
  classifySui,
  mapModuleScoreToStufe,
  aggregateHausaufgaben,
  aggregateReflexion,
  selectThreeHebel,
} from "../sui-engine";
import type {
  Answer,
  ModulKey,
  ModuleScores,
  V8StufenLookup,
  V8Template,
  V8TemplateBlock,
} from "../types";

// ---------------------------------------------------------------------------
// Test-Fixtures
// ---------------------------------------------------------------------------

const SCORE_MAPPING = { "1": 0, "2": 2, "3": 5, "4": 8, "5": 10 } as const;

function skalaBlock(
  modulId: string,
  name: string,
  fragePrefix: string,
  count: number
): V8TemplateBlock {
  return {
    modul_id: modulId,
    name,
    answer_schema_kind: "reife_skala_5",
    score_mapping: { ...SCORE_MAPPING },
    questions: Array.from({ length: count }, (_, i) => ({
      frage_id: `${fragePrefix}.${i + 1}`,
      text: `${fragePrefix}.${i + 1} Frage-Text`,
    })),
  };
}

const TEST_TEMPLATE: V8Template = {
  slug: "exit-readiness-teaser-v1",
  version: 1,
  name: "Test-Template",
  description: "",
  metadata: {
    usage_kind: "mandanten_report_teaser_v1",
    scoring_kind: "sui_weighted",
    report_renderer: "mandanten_report_v2",
    gewichtung: {
      m1: 10,
      m2: 10,
      m3: 10,
      m4: 10,
      m5: 10,
      m6: 10,
      m7: 10,
      m8: 10,
      m9: 20,
    },
    stufen_lookup: buildStufenLookup(),
  },
  blocks: [
    {
      modul_id: "M0",
      name: "Vor-Verkauf-Hygiene",
      answer_schema_kind: "hygiene_yes_partial_no",
      questions: [
        { frage_id: "M0.1", text: "M0.1 Vertraege" },
        { frage_id: "M0.2", text: "M0.2 Buergschaften" },
        { frage_id: "M0.3", text: "M0.3 Geistiges Eigentum" },
        { frage_id: "M0.4", text: "M0.4 Anstellung" },
        { frage_id: "M0.5", text: "M0.5 Compliance" },
      ],
    },
    skalaBlock("M1", "Skalierbares Produkt", "F1", 2),
    skalaBlock("M2", "Kunden-Fokus", "F2", 2),
    skalaBlock("M3", "Liquiditaet", "F3", 2),
    skalaBlock("M4", "Vertrieb", "F4", 2),
    skalaBlock("M5", "Recurring", "F5", 2),
    skalaBlock("M6", "Datenbasis", "F6", 2),
    skalaBlock("M7", "Wissenssystem", "F7", 2),
    skalaBlock("M8", "Fuehrung", "F8", 2),
    skalaBlock("M9", "Strukturiertes Wertschaffen", "F9", 2),
    {
      modul_id: "M10",
      name: "Vermaechtnis",
      answer_schema_kind: "reflexion_freitext",
      questions: [
        { frage_id: "R10.1.1", text: "R10.1.1 Reputation" },
        { frage_id: "R10.1.2", text: "R10.1.2 Werte" },
        { frage_id: "R10.1.3", text: "R10.1.3 Spiegel" },
        { frage_id: "R10.2.1", text: "R10.2.1 Nachher" },
        { frage_id: "R10.2.2", text: "R10.2.2 Dienstag" },
      ],
    },
  ],
};

function buildStufenLookup(): V8StufenLookup {
  const modules: ModulKey[] = [
    "m1",
    "m2",
    "m3",
    "m4",
    "m5",
    "m6",
    "m7",
    "m8",
    "m9",
  ];
  const stufen = ["s1", "s2", "s3", "s4", "s5"] as const;
  const lookup = {} as V8StufenLookup;
  for (const m of modules) {
    lookup[m] = {} as V8StufenLookup[ModulKey];
    for (const s of stufen) {
      lookup[m][s] = {
        was_es_bedeutet: `${m}/${s} bedeutet`,
        unsere_empfehlung: `${m}/${s} Empfehlung`,
      };
    }
  }
  return lookup;
}

const MODUL_NAMES: Record<ModulKey, string> = {
  m1: "Skalierbares Produkt",
  m2: "Kunden-Fokus",
  m3: "Liquiditaet",
  m4: "Vertrieb",
  m5: "Recurring",
  m6: "Datenbasis",
  m7: "Wissenssystem",
  m8: "Fuehrung",
  m9: "Strukturiertes Wertschaffen",
};

function uniformSkalaAnswers(stufe: "1" | "2" | "3" | "4" | "5"): Answer[] {
  const answers: Answer[] = [];
  for (let m = 1; m <= 9; m++) {
    for (let q = 1; q <= 2; q++) {
      answers.push({ frage_id: `F${m}.${q}`, value: stufe });
    }
  }
  return answers;
}

// ---------------------------------------------------------------------------
// computeModuleScores
// ---------------------------------------------------------------------------

describe("computeModuleScores", () => {
  it("alle Antworten Stufe 1 -> alle m1..m9 = 0", () => {
    const scores = computeModuleScores(uniformSkalaAnswers("1"), TEST_TEMPLATE);
    expect(scores).toEqual({
      m1: 0,
      m2: 0,
      m3: 0,
      m4: 0,
      m5: 0,
      m6: 0,
      m7: 0,
      m8: 0,
      m9: 0,
    });
  });

  it("alle Antworten Stufe 3 -> alle m1..m9 = 5", () => {
    const scores = computeModuleScores(uniformSkalaAnswers("3"), TEST_TEMPLATE);
    expect(scores).toEqual({
      m1: 5,
      m2: 5,
      m3: 5,
      m4: 5,
      m5: 5,
      m6: 5,
      m7: 5,
      m8: 5,
      m9: 5,
    });
  });

  it("alle Antworten Stufe 5 -> alle m1..m9 = 10", () => {
    const scores = computeModuleScores(uniformSkalaAnswers("5"), TEST_TEMPLATE);
    expect(scores).toEqual({
      m1: 10,
      m2: 10,
      m3: 10,
      m4: 10,
      m5: 10,
      m6: 10,
      m7: 10,
      m8: 10,
      m9: 10,
    });
  });

  it("mixed answers within module -> Durchschnitt der Frage-Scores", () => {
    const answers: Answer[] = [
      { frage_id: "F1.1", value: "1" }, // score 0
      { frage_id: "F1.2", value: "5" }, // score 10
      // Rest leer
    ];
    const scores = computeModuleScores(answers, TEST_TEMPLATE);
    expect(scores.m1).toBe(5); // (0 + 10) / 2
  });

  it("missing answers excluded from average (nur antwort-counts zaehlen)", () => {
    const answers: Answer[] = [
      { frage_id: "F2.1", value: "5" }, // score 10
      // F2.2 fehlt
    ];
    const scores = computeModuleScores(answers, TEST_TEMPLATE);
    expect(scores.m2).toBe(10); // einziger answered = 10
  });

  it("Modul ohne Antworten -> 0", () => {
    const scores = computeModuleScores([], TEST_TEMPLATE);
    expect(scores).toEqual({
      m1: 0,
      m2: 0,
      m3: 0,
      m4: 0,
      m5: 0,
      m6: 0,
      m7: 0,
      m8: 0,
      m9: 0,
    });
  });

  it("ignoriert M0 + M10 Antworten", () => {
    // Reine M0 + M10 Antworten, kein Skala-Answer -> alle scores 0
    const answers: Answer[] = [
      { frage_id: "M0.1", value: "ja" },
      { frage_id: "M0.2", value: "nein" },
      { frage_id: "R10.1.1", value: "Reputation-Antwort" },
    ];
    const scores = computeModuleScores(answers, TEST_TEMPLATE);
    expect(scores.m1).toBe(0);
    expect(scores.m9).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeSui
// ---------------------------------------------------------------------------

describe("computeSui", () => {
  function zeroScores(): ModuleScores {
    return {
      m1: 0,
      m2: 0,
      m3: 0,
      m4: 0,
      m5: 0,
      m6: 0,
      m7: 0,
      m8: 0,
      m9: 0,
    };
  }

  it("alle Module 0 -> SUI 0", () => {
    expect(computeSui(zeroScores())).toBe(0);
  });

  it("alle Module 5 -> SUI 50", () => {
    const scores: ModuleScores = {
      m1: 5,
      m2: 5,
      m3: 5,
      m4: 5,
      m5: 5,
      m6: 5,
      m7: 5,
      m8: 5,
      m9: 5,
    };
    expect(computeSui(scores)).toBe(50);
  });

  it("alle Module 10 -> SUI 100", () => {
    const scores: ModuleScores = {
      m1: 10,
      m2: 10,
      m3: 10,
      m4: 10,
      m5: 10,
      m6: 10,
      m7: 10,
      m8: 10,
      m9: 10,
    };
    expect(computeSui(scores)).toBe(100);
  });

  it("AC-2: m1..m8 alle 10, m9 = 0 -> SUI 80 (Gewichtungs-Effekt)", () => {
    const scores: ModuleScores = {
      m1: 10,
      m2: 10,
      m3: 10,
      m4: 10,
      m5: 10,
      m6: 10,
      m7: 10,
      m8: 10,
      m9: 0,
    };
    expect(computeSui(scores)).toBe(80); // (8*10*10 + 0*20)/100 = 800/100 = 80
  });

  it("AC-2 inverse: m1..m8 alle 0, m9 = 10 -> SUI 20 (m9 Doppel-Gewicht sichtbar)", () => {
    const scores: ModuleScores = {
      m1: 0,
      m2: 0,
      m3: 0,
      m4: 0,
      m5: 0,
      m6: 0,
      m7: 0,
      m8: 0,
      m9: 10,
    };
    expect(computeSui(scores)).toBe(20); // (0 + 10*20)/100 = 200/100 = 20
  });
});

// ---------------------------------------------------------------------------
// classifySui
// ---------------------------------------------------------------------------

describe("classifySui", () => {
  it("SUI 0 -> strukturluecke/rot", () => {
    const c = classifySui(0);
    expect(c.kind).toBe("strukturluecke");
    expect(c.color).toBe("rot");
    expect(c.label).toBe("Strukturluecke");
    expect(c.meaning).toContain("Vorarbeit");
  });

  it("SUI 29 -> strukturluecke", () => {
    expect(classifySui(29).kind).toBe("strukturluecke");
  });

  it("SUI 30 -> strukturluecke (obere Grenze inklusiv)", () => {
    expect(classifySui(30).kind).toBe("strukturluecke");
  });

  it("SUI 31 -> teil_reife/amber", () => {
    const c = classifySui(31);
    expect(c.kind).toBe("teil_reife");
    expect(c.color).toBe("amber");
    expect(c.label).toBe("Teil-Reife");
  });

  it("SUI 55 -> teil_reife (obere Grenze inklusiv)", () => {
    expect(classifySui(55).kind).toBe("teil_reife");
  });

  it("SUI 56 -> tragbar/gruen", () => {
    const c = classifySui(56);
    expect(c.kind).toBe("tragbar");
    expect(c.color).toBe("gruen");
    expect(c.label).toBe("Tragbar");
  });

  it("SUI 100 -> tragbar", () => {
    expect(classifySui(100).kind).toBe("tragbar");
  });
});

// ---------------------------------------------------------------------------
// mapModuleScoreToStufe
// ---------------------------------------------------------------------------

describe("mapModuleScoreToStufe", () => {
  it("AC-4: Exakt-Stufen-Scores 0/2/5/8/10 -> 1/2/3/4/5", () => {
    expect(mapModuleScoreToStufe(0)).toBe(1);
    expect(mapModuleScoreToStufe(2)).toBe(2);
    expect(mapModuleScoreToStufe(5)).toBe(3);
    expect(mapModuleScoreToStufe(8)).toBe(4);
    expect(mapModuleScoreToStufe(10)).toBe(5);
  });

  it("AC-4: Bereichs-Mitten 1/4/7 -> 2/3/4 (Tie-Up bei Midpoint)", () => {
    expect(mapModuleScoreToStufe(1)).toBe(2);
    expect(mapModuleScoreToStufe(4)).toBe(3);
    expect(mapModuleScoreToStufe(7)).toBe(4);
  });

  it("Edge cases: Werte unter 1 -> 1", () => {
    expect(mapModuleScoreToStufe(0.5)).toBe(1);
    expect(mapModuleScoreToStufe(0.99)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// aggregateHausaufgaben
// ---------------------------------------------------------------------------

describe("aggregateHausaufgaben", () => {
  it("AC-5: 5 Antworten (2 ja + 2 nein + 1 teilweise) -> 3 Items", () => {
    const answers: Answer[] = [
      { frage_id: "M0.1", value: "ja" },
      { frage_id: "M0.2", value: "nein" },
      { frage_id: "M0.3", value: "ja" },
      { frage_id: "M0.4", value: "teilweise" },
      { frage_id: "M0.5", value: "nein" },
    ];
    const items = aggregateHausaufgaben(answers, TEST_TEMPLATE);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.frage_id)).toEqual(["M0.2", "M0.4", "M0.5"]);
    expect(items.map((i) => i.status)).toEqual(["nein", "teilweise", "nein"]);
  });

  it("preserves Template-Reihenfolge der M0-Fragen", () => {
    const answers: Answer[] = [
      // Antworten in zufaelliger Reihenfolge eingegeben
      { frage_id: "M0.5", value: "nein" },
      { frage_id: "M0.1", value: "teilweise" },
      { frage_id: "M0.3", value: "nein" },
    ];
    const items = aggregateHausaufgaben(answers, TEST_TEMPLATE);
    expect(items.map((i) => i.frage_id)).toEqual(["M0.1", "M0.3", "M0.5"]);
  });

  it("frage_text aus Template gefuellt", () => {
    const answers: Answer[] = [{ frage_id: "M0.1", value: "nein" }];
    const items = aggregateHausaufgaben(answers, TEST_TEMPLATE);
    expect(items[0]?.frage_text).toBe("M0.1 Vertraege");
  });

  it("'ja' wird gefiltert (kein Hausaufgaben-Eintrag)", () => {
    const answers: Answer[] = [
      { frage_id: "M0.1", value: "ja" },
      { frage_id: "M0.2", value: "ja" },
    ];
    expect(aggregateHausaufgaben(answers, TEST_TEMPLATE)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateReflexion
// ---------------------------------------------------------------------------

describe("aggregateReflexion", () => {
  it("AC-6: 5 Antworten (3 ausgefuellt + 2 leer) -> 3 Items", () => {
    const answers: Answer[] = [
      { frage_id: "R10.1.1", value: "Reputation-Antwort" },
      { frage_id: "R10.1.2", value: "" },
      { frage_id: "R10.1.3", value: "Spiegel-Antwort" },
      { frage_id: "R10.2.1", value: "Nachher-Antwort" },
      { frage_id: "R10.2.2", value: "" },
    ];
    const items = aggregateReflexion(answers, TEST_TEMPLATE);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.frage_id)).toEqual([
      "R10.1.1",
      "R10.1.3",
      "R10.2.1",
    ]);
  });

  it("Whitespace-only text wird wie leer behandelt", () => {
    const answers: Answer[] = [
      { frage_id: "R10.1.1", value: "   \n  " },
      { frage_id: "R10.1.2", value: "echte Antwort" },
    ];
    const items = aggregateReflexion(answers, TEST_TEMPLATE);
    expect(items).toHaveLength(1);
    expect(items[0]?.frage_id).toBe("R10.1.2");
  });

  it("antwort_text wird aus Answer-Value uebernommen", () => {
    const answers: Answer[] = [
      { frage_id: "R10.1.1", value: "Mein Vermaechtnis" },
    ];
    const items = aggregateReflexion(answers, TEST_TEMPLATE);
    expect(items[0]?.antwort_text).toBe("Mein Vermaechtnis");
    expect(items[0]?.frage_text).toBe("R10.1.1 Reputation");
  });
});

// ---------------------------------------------------------------------------
// selectThreeHebel
// ---------------------------------------------------------------------------

describe("selectThreeHebel", () => {
  const stufenLookup = buildStufenLookup();

  it("AC-7: Score-Profil m1=8/m2=2/m3=5/m4=2/m5=9/m6=3/m7=7/m8=4/m9=6 -> [m2, m4, m6]", () => {
    const scores: ModuleScores = {
      m1: 8,
      m2: 2,
      m3: 5,
      m4: 2,
      m5: 9,
      m6: 3,
      m7: 7,
      m8: 4,
      m9: 6,
    };
    const hebel = selectThreeHebel(scores, stufenLookup, MODUL_NAMES);
    expect(hebel.map((h) => h.modul_id)).toEqual(["m2", "m4", "m6"]);
  });

  it("Tie-Break: bei gleichen Scores -> m1 < m2 < ... < m9 Reihenfolge", () => {
    const scores: ModuleScores = {
      m1: 3,
      m2: 3,
      m3: 3,
      m4: 10,
      m5: 10,
      m6: 10,
      m7: 10,
      m8: 10,
      m9: 10,
    };
    const hebel = selectThreeHebel(scores, stufenLookup, MODUL_NAMES);
    expect(hebel.map((h) => h.modul_id)).toEqual(["m1", "m2", "m3"]);
  });

  it("Empfehlung wird aus stufenLookup[modul_id][stufe] gezogen", () => {
    const scores: ModuleScores = {
      m1: 0, // -> Stufe 1
      m2: 2, // -> Stufe 2
      m3: 5, // -> Stufe 3
      m4: 10,
      m5: 10,
      m6: 10,
      m7: 10,
      m8: 10,
      m9: 10,
    };
    const hebel = selectThreeHebel(scores, stufenLookup, MODUL_NAMES);
    expect(hebel[0]?.modul_id).toBe("m1");
    expect(hebel[0]?.stufe).toBe(1);
    expect(hebel[0]?.empfehlung).toBe("m1/s1 Empfehlung");
    expect(hebel[1]?.modul_id).toBe("m2");
    expect(hebel[1]?.stufe).toBe(2);
    expect(hebel[1]?.empfehlung).toBe("m2/s2 Empfehlung");
    expect(hebel[2]?.modul_id).toBe("m3");
    expect(hebel[2]?.stufe).toBe(3);
    expect(hebel[2]?.empfehlung).toBe("m3/s3 Empfehlung");
  });

  it("modul_name wird aus modulNames-Lookup gefuellt", () => {
    const scores: ModuleScores = {
      m1: 0,
      m2: 10,
      m3: 10,
      m4: 10,
      m5: 10,
      m6: 10,
      m7: 10,
      m8: 10,
      m9: 10,
    };
    const hebel = selectThreeHebel(scores, stufenLookup, MODUL_NAMES);
    expect(hebel[0]?.modul_name).toBe("Skalierbares Produkt");
  });

  it("liefert genau 3 Items", () => {
    const scores: ModuleScores = {
      m1: 5,
      m2: 5,
      m3: 5,
      m4: 5,
      m5: 5,
      m6: 5,
      m7: 5,
      m8: 5,
      m9: 5,
    };
    const hebel = selectThreeHebel(scores, stufenLookup, MODUL_NAMES);
    expect(hebel).toHaveLength(3);
  });
});
