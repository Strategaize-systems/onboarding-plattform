// V9.75 SLC-V9.75-B MT-1 — Fixture-Tests fuer den Fahrplan-Daten-Loader.
//
// Reine Transform-Logik (kein DB-Zugriff): buildFahrplanInput gegen Fixtures mit
// (a) vollstaendigen Feldern und (b) Null-/Fehl-Feldern (R-B-1 defensives Default).

import { describe, it, expect } from "vitest";
import { buildFahrplanInput } from "./data";
import type { DiagnosisRow, QualityReportRow } from "./types";

const fullDiagnosis: DiagnosisRow[] = [
  {
    block_key: "fuehrung",
    content: {
      block_key: "fuehrung",
      block_title: "Führung & Organisation",
      subtopics: [
        {
          key: "delegation",
          name: "Delegation",
          fields: {
            ampel: "red",
            reifegrad: 3,
            risiko: 8,
            hebel: 7,
            relevanz_90d: "high",
            empfehlung: "Verantwortlichkeiten dokumentieren",
            aufwand: "M",
            owner: "GF",
            naechster_schritt: "Rollen-Workshop ansetzen",
          },
        },
      ],
    },
  },
];

const fullQualityReports: QualityReportRow[] = [
  {
    quality_report: {
      overall_score: 42,
      coverage: { covered_subtopics: ["delegation"], missing_subtopics: ["nachfolge"], coverage_ratio: "1/2" },
      gap_questions: [
        { question_text: "Wer vertritt die GF im Urlaub?", context: "Vertretungsregel offen", subtopic: "delegation", priority: "required" },
        { question_text: "Gibt es ein Org-Chart?", context: "", subtopic: "delegation", priority: "nice_to_have" },
      ],
    },
  },
];

describe("buildFahrplanInput — vollstaendige Felder", () => {
  it("baut Reifegrad-Profil aus block_diagnosis.content", () => {
    const input = buildFahrplanInput("sess-1", fullDiagnosis, fullQualityReports);
    expect(input.sessionId).toBe("sess-1");
    expect(input.blocks).toHaveLength(1);
    expect(input.blocks[0]!.block_title).toBe("Führung & Organisation");
    expect(input.blocks[0]!.subtopics[0]!.fields.reifegrad).toBe(3);
  });

  it("joint Gap-Fragen mit den Diagnose-Feldern des passenden Subtopics", () => {
    const input = buildFahrplanInput("sess-1", fullDiagnosis, fullQualityReports);
    const gapTodo = input.todos.find((t) => t.title.startsWith("Wer vertritt"));
    expect(gapTodo).toBeDefined();
    expect(gapTodo!.priority).toBe("required");
    expect(gapTodo!.source).toBe("gap");
    expect(gapTodo!.aufwand).toBe("M");
    expect(gapTodo!.owner).toBe("GF");
    expect(gapTodo!.naechsterSchritt).toBe("Rollen-Workshop ansetzen");
    expect(gapTodo!.risiko).toBe(8);
    expect(gapTodo!.hebel).toBe(7);
    expect(gapTodo!.blockTitle).toBe("Führung & Organisation");
  });

  it("erzeugt einen To-Do fuer ein fehlendes Subtopic ohne Gap-Frage", () => {
    const input = buildFahrplanInput("sess-1", fullDiagnosis, fullQualityReports);
    const missingTodo = input.todos.find((t) => t.source === "missing_subtopic");
    expect(missingTodo).toBeDefined();
    expect(missingTodo!.subtopic).toBe("nachfolge");
    expect(missingTodo!.priority).toBe("required");
    expect(missingTodo!.title).toContain("Nicht erfasst");
  });

  it("zaehlt counts korrekt", () => {
    const input = buildFahrplanInput("sess-1", fullDiagnosis, fullQualityReports);
    expect(input.counts.blocks).toBe(1);
    expect(input.counts.requiredGaps).toBe(1);
    expect(input.counts.niceToHaveGaps).toBe(1);
    expect(input.counts.missingSubtopics).toBe(1);
  });
});

describe("buildFahrplanInput — Null-/Fehl-Felder (R-B-1)", () => {
  const sparseDiagnosis: DiagnosisRow[] = [
    {
      block_key: "finanzen",
      content: {
        block_key: "finanzen",
        block_title: "Finanzen",
        subtopics: [
          {
            key: "reporting",
            name: "Reporting",
            // owner/aufwand/naechster_schritt FEHLEN; empfehlung leer.
            fields: { ampel: "yellow", reifegrad: 5, empfehlung: "" },
          },
        ],
      },
    },
  ];
  const sparseQr: QualityReportRow[] = [
    {
      quality_report: {
        gap_questions: [
          { question_text: "Monatliches Reporting?", context: "", subtopic: "reporting", priority: "required" },
        ],
        coverage: { missing_subtopics: [] },
      },
    },
  ];

  it("defaultet fehlende Felder auf null statt zu werfen", () => {
    const input = buildFahrplanInput("sess-2", sparseDiagnosis, sparseQr);
    const todo = input.todos[0]!;
    expect(todo.owner).toBeNull();
    expect(todo.aufwand).toBeNull();
    expect(todo.naechsterSchritt).toBeNull();
    expect(todo.empfehlung).toBeNull(); // leerer String → null
    expect(todo.ampel).toBe("yellow");
    expect(todo.reifegrad).toBe(5);
  });

  it("ueberlebt komplett leere/kaputte Eingaben", () => {
    expect(() => buildFahrplanInput("sess-3", [], [])).not.toThrow();
    const empty = buildFahrplanInput("sess-3", [], []);
    expect(empty.blocks).toEqual([]);
    expect(empty.todos).toEqual([]);
    expect(empty.counts.blocks).toBe(0);

    const garbage = buildFahrplanInput(
      "sess-4",
      [{ block_key: null, content: null }, { block_key: "x", content: "not-an-object" }],
      [{ quality_report: 42 }, { quality_report: null }],
    );
    expect(garbage.blocks).toEqual([]);
    expect(garbage.todos).toEqual([]);
  });
});

describe("buildFahrplanInput — Dedup ueber mehrere Checkpoints", () => {
  it("dedupliziert identische Gap-Fragen + missing_subtopics", () => {
    const dupQr: QualityReportRow[] = [
      {
        quality_report: {
          gap_questions: [{ question_text: "Frage A", context: "", subtopic: "s1", priority: "required" }],
          coverage: { missing_subtopics: ["s2"] },
        },
      },
      {
        quality_report: {
          gap_questions: [{ question_text: "Frage A", context: "", subtopic: "s1", priority: "required" }],
          coverage: { missing_subtopics: ["s2"] },
        },
      },
    ];
    const input = buildFahrplanInput("sess-5", [], dupQr);
    expect(input.counts.requiredGaps).toBe(1);
    // s2 ist missing UND nicht als Gap-Subtopic abgedeckt → genau 1 missing-To-Do.
    expect(input.todos.filter((t) => t.source === "missing_subtopic")).toHaveLength(1);
    expect(input.missingSubtopics).toEqual(["s2"]);
  });
});
