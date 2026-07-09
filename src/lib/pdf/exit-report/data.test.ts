// V10.5 SLC-191 MT-1 — Fixture-Tests fuer den Exit-Report-Loader (PURE Transform).
// Fixtures modellieren die reale Live-Struktur (MT-0-Spike, RPT-625):
// diagnosis_schema.blocks = OBJEKT keyed by Block-Letter; answers-Key = `${block.key}.${q.id}`.

import { describe, it, expect } from "vitest";

import { answerKey, buildExitReportInput } from "./data";
import type { FahrplanInput } from "../fahrplan-report/types";

const fahrplan: FahrplanInput = {
  sessionId: "s1",
  blocks: [
    {
      block_key: "A",
      block_title: "Markt & Modell",
      subtopics: [
        { key: "a1_grund", name: "Grundverstaendnis", fields: { ampel: "red", risiko: 8 } },
      ],
    },
    // Block C hat einen block_title in der Diagnose, aber (unten) keinen Template-Titel:
    { block_key: "C", block_title: "Prozesse", subtopics: [] },
  ],
  todos: [],
  missingSubtopics: [],
  counts: { blocks: 2, requiredGaps: 0, niceToHaveGaps: 0, missingSubtopics: 0 },
};

const templateBlocks = [
  {
    key: "A",
    title: { de: "Markt & Modell", en: "Market & Model" },
    questions: [
      { id: "q-a1", frage_id: "F-BP-001", owner_dependency: true },
      { id: "q-a2", frage_id: "F-BP-003", owner_dependency: true },
      { id: "q-a3", frage_id: "F-BP-004", owner_dependency: false },
    ],
  },
  {
    key: "B",
    title: { de: "Fuehrung" },
    questions: [{ id: "q-b1", frage_id: "F-BP-015", owner_dependency: true }],
  },
  // Block C ohne Template-Titel → Fallback auf fahrplan block_title:
  { key: "C", questions: [] },
];

const diagnosisSchema = {
  blocks: {
    A: {
      subtopics: [
        { key: "a1_grund", name: "Grundverstaendnis", question_keys: ["F-BP-001", "F-BP-003"] },
        { key: "a2_leistung", name: "Leistung", question_keys: ["F-BP-004"] },
      ],
    },
    B: {
      subtopics: [{ key: "b1_fuehrung", name: "Fuehrungsstruktur", question_keys: ["F-BP-015"] }],
    },
  },
  fields: {},
};

// q-a1 beantwortet, q-a2 leer (blank) → answered=false, q-b1 gar nicht beantwortet.
const answers = { "A.q-a1": "Ja, dokumentiert", "A.q-a2": "   " };

describe("answerKey", () => {
  it("baut den Key als `${blockKey}.${questionId}`", () => {
    expect(answerKey("A", "q-a1")).toBe("A.q-a1");
  });
});

describe("buildExitReportInput", () => {
  const input = buildExitReportInput(fahrplan, templateBlocks, diagnosisSchema, answers);

  it("bettet den Fahrplan-Input ein + uebernimmt sessionId", () => {
    expect(input.sessionId).toBe("s1");
    expect(input.fahrplan).toBe(fahrplan);
  });

  it("extrahiert nur owner_dependency=true Fragen (q-a1,q-a2,q-b1; nicht q-a3)", () => {
    const ids = input.ownerDepQuestions.map((q) => q.questionId).sort();
    expect(ids).toEqual(["q-a1", "q-a2", "q-b1"]);
  });

  it("traegt blockKey/questionId/frageId je owner-dep-Frage korrekt", () => {
    const qa2 = input.ownerDepQuestions.find((q) => q.questionId === "q-a2");
    expect(qa2).toMatchObject({ blockKey: "A", questionId: "q-a2", frageId: "F-BP-003" });
  });

  it("setzt answered korrekt (a1 beantwortet, a2 blank=false, b1 fehlt=false)", () => {
    const byId = Object.fromEntries(input.ownerDepQuestions.map((q) => [q.questionId, q.answered]));
    expect(byId["q-a1"]).toBe(true);
    expect(byId["q-a2"]).toBe(false);
    expect(byId["q-b1"]).toBe(false);
  });

  it("flacht diagnosis_schema.blocks als OBJEKT ab (Object.entries, nicht .map)", () => {
    const a1 = input.diagnosisSubtopics.find((s) => s.key === "a1_grund");
    expect(a1).toMatchObject({
      blockKey: "A",
      key: "a1_grund",
      name: "Grundverstaendnis",
      questionKeys: ["F-BP-001", "F-BP-003"],
    });
    // 3 Subtopics gesamt (A:2 + B:1):
    expect(input.diagnosisSubtopics).toHaveLength(3);
  });

  it("baut blockTitles aus template.title.de + Fallback auf fahrplan block_title", () => {
    expect(input.blockTitles["A"]).toBe("Markt & Modell");
    expect(input.blockTitles["B"]).toBe("Fuehrung");
    expect(input.blockTitles["C"]).toBe("Prozesse"); // Fallback aus fahrplan.blocks
  });

  it("traegt answers unveraendert durch", () => {
    expect(input.answers).toEqual(answers);
  });
});

describe("buildExitReportInput — defensiv", () => {
  it("liefert leere Listen bei null-Template/Schema/Answers", () => {
    const input = buildExitReportInput(fahrplan, null, null, null);
    expect(input.ownerDepQuestions).toEqual([]);
    expect(input.diagnosisSubtopics).toEqual([]);
    expect(input.answers).toEqual({});
    // blockTitles kommen dann nur aus dem Fahrplan-Fallback:
    expect(input.blockTitles["A"]).toBe("Markt & Modell");
    expect(input.blockTitles["C"]).toBe("Prozesse");
  });

  it("ignoriert diagnosis_schema.blocks in falscher (Array-)Form ohne Crash", () => {
    const wrongShape = { blocks: [{ subtopics: [{ key: "x", question_keys: ["F-BP-001"] }] }] };
    const input = buildExitReportInput(fahrplan, templateBlocks, wrongShape, answers);
    expect(input.diagnosisSubtopics).toEqual([]);
  });

  it("ueberspringt kaputte Block-/Frage-Eintraege ohne Crash", () => {
    const messy = [null, { key: "A", questions: [null, { owner_dependency: true }, { id: "q-x", frage_id: "F-X", owner_dependency: true }] }];
    const input = buildExitReportInput(fahrplan, messy, null, {});
    // nur q-x hat eine id → genau 1 owner-dep-Frage:
    expect(input.ownerDepQuestions.map((q) => q.questionId)).toEqual(["q-x"]);
  });
});
