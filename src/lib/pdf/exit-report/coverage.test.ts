// V10.5 SLC-192 MT-2 — TDD fuer die Coverage-/Ehrlichkeits-Sektion (PURE, 0 LLM).
// Deckt: missing_subtopics + required gap_questions gemappt, dedup, required zuerst,
// leerer/fehlender quality_report → definierter Hinweis statt irrefuehrend leer (R-V10.5-4).

import { describe, it, expect } from "vitest";

import { buildCoverageSection } from "./coverage";
import type { ExitReportInput } from "./types";
import type { FahrplanInput, FahrplanTodo } from "../fahrplan-report/types";

function todo(p: Partial<FahrplanTodo>): FahrplanTodo {
  return {
    subtopic: "s",
    subtopicName: "Subtopic",
    blockTitle: "Block",
    title: "Titel",
    context: "",
    priority: "required",
    source: "gap",
    ampel: null,
    reifegrad: null,
    risiko: null,
    hebel: null,
    relevanz90d: null,
    empfehlung: null,
    aufwand: null,
    owner: null,
    naechsterSchritt: null,
    ...p,
  };
}

function input(fahrplan: Partial<FahrplanInput>): ExitReportInput {
  return {
    sessionId: "s1",
    fahrplan: {
      sessionId: "s1",
      blocks: [],
      todos: [],
      missingSubtopics: [],
      counts: { blocks: 0, requiredGaps: 0, niceToHaveGaps: 0, missingSubtopics: 0 },
      ...fahrplan,
    },
    ownerDepQuestions: [],
    diagnosisSubtopics: [],
    answers: {},
    blockTitles: {},
  };
}

describe("buildCoverageSection", () => {
  it("mappt fehlende Subtopics + required Gaps und schließt nice_to_have aus", () => {
    const sec = buildCoverageSection(
      input({
        blocks: [{ block_key: "A", block_title: "Markt", subtopics: [] }],
        todos: [
          todo({ source: "missing_subtopic", subtopicName: "Nachfolge-Regelung", blockTitle: "Governance", priority: "required" }),
          todo({ source: "gap", title: "Wer führt bei Ausfall?", blockTitle: "Governance", priority: "required" }),
          todo({ source: "gap", title: "Optional-Detail", priority: "nice_to_have" }),
        ],
      }),
    );
    expect(sec.status).toBe("assessed");
    expect(sec.items).toHaveLength(2);
    const reasons = sec.items.map((i) => i.reason);
    expect(reasons).toContain("missing_subtopic");
    expect(reasons).toContain("required_gap");
    // nice_to_have darf nicht in der Ehrlichkeits-Sektion auftauchen.
    expect(sec.items.some((i) => i.label.includes("Optional-Detail"))).toBe(false);
  });

  it("sortiert fehlende Subtopics vor required Gaps (schwerster Blind Spot zuerst)", () => {
    const sec = buildCoverageSection(
      input({
        blocks: [{ block_key: "A", block_title: "Markt", subtopics: [] }],
        todos: [
          todo({ source: "gap", title: "Gap zuerst im Array", priority: "required" }),
          todo({ source: "missing_subtopic", subtopicName: "Nicht erfasstes Thema", priority: "required" }),
        ],
      }),
    );
    expect(sec.items[0].reason).toBe("missing_subtopic");
    expect(sec.items[1].reason).toBe("required_gap");
  });

  it("dedupliziert gleiche Einträge (Reason + Label + Block)", () => {
    const sec = buildCoverageSection(
      input({
        blocks: [{ block_key: "A", block_title: "Markt", subtopics: [] }],
        todos: [
          todo({ source: "missing_subtopic", subtopicName: "Doppelt", blockTitle: "Markt" }),
          todo({ source: "missing_subtopic", subtopicName: "Doppelt", blockTitle: "Markt" }),
        ],
      }),
    );
    expect(sec.items).toHaveLength(1);
  });

  it("meldet volle Coverage, wenn Diagnose vorliegt aber keine Lücken bestehen", () => {
    const sec = buildCoverageSection(
      input({
        blocks: [{ block_key: "A", block_title: "Markt", subtopics: [] }],
        todos: [todo({ source: "gap", priority: "nice_to_have" })],
      }),
    );
    expect(sec.status).toBe("full");
    expect(sec.items).toHaveLength(0);
    expect(sec.headline.length).toBeGreaterThan(0);
  });

  it("meldet 'nicht ermittelbar', wenn gar keine Diagnose-/Coverage-Daten vorliegen (R-V10.5-4)", () => {
    const sec = buildCoverageSection(input({}));
    expect(sec.status).toBe("undetermined");
    expect(sec.items).toHaveLength(0);
    expect(sec.headline.toLowerCase()).toContain("nicht ermittelbar");
  });
});
