// V10.5 SLC-191 MT-4 — Renderer-Smoke: renderToBuffer liefert non-empty PDF-Buffer
// aus einer Fixture (Muster fahrplan-report/renderer.test.ts, node-env, kein jsdom).

import { describe, it, expect } from "vitest";

import { renderExitReportPdf } from "./renderer";
import type { ExitReportInput } from "./types";

const fixture: ExitReportInput = {
  sessionId: "s1",
  fahrplan: {
    sessionId: "s1",
    blocks: [
      {
        block_key: "A",
        block_title: "Markt & Modell",
        subtopics: [{ key: "a1", name: "Grundverstaendnis", fields: { ampel: "red", risiko: 8 } }],
      },
    ],
    todos: [
      {
        subtopic: "a1",
        subtopicName: "Grundverstaendnis",
        blockTitle: "Markt & Modell",
        title: "Geschaeftsmodell nicht dokumentiert",
        context: "",
        priority: "required",
        source: "gap",
        ampel: "red",
        reifegrad: 2,
        risiko: 9,
        hebel: 8,
        relevanz90d: "high",
        empfehlung: "Modell schriftlich fixieren",
        aufwand: "M",
        owner: null,
        naechsterSchritt: null,
      },
    ],
    missingSubtopics: [],
    counts: { blocks: 1, requiredGaps: 1, niceToHaveGaps: 0, missingSubtopics: 0 },
  },
  ownerDepQuestions: [{ blockKey: "A", questionId: "q1", frageId: "F-BP-001", answered: false }],
  diagnosisSubtopics: [{ blockKey: "A", key: "a1", name: "Grundverstaendnis", questionKeys: ["F-BP-001"] }],
  answers: {},
  blockTitles: { A: "Markt & Modell" },
};

describe("renderExitReportPdf", () => {
  it("liefert einen non-empty PDF-Buffer (renderToBuffer ohne Throw)", async () => {
    const buf = await renderExitReportPdf(fixture);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("rendert auch bei leerer Diagnose ohne Throw", async () => {
    const empty: ExitReportInput = {
      sessionId: "s2",
      fahrplan: {
        sessionId: "s2",
        blocks: [],
        todos: [],
        missingSubtopics: [],
        counts: { blocks: 0, requiredGaps: 0, niceToHaveGaps: 0, missingSubtopics: 0 },
      },
      ownerDepQuestions: [],
      diagnosisSubtopics: [],
      answers: {},
      blockTitles: {},
    };
    const buf = await renderExitReportPdf(empty);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("rendert Spur-/Disclaimer- + Coverage-Seiten mit einem missing_subtopic (SLC-192)", async () => {
    const withMissing: ExitReportInput = {
      ...fixture,
      fahrplan: {
        ...fixture.fahrplan,
        todos: [
          ...fixture.fahrplan.todos,
          {
            subtopic: "b2",
            subtopicName: "Nachfolge-Regelung",
            blockTitle: "Governance",
            title: "Nicht erfasst: Nachfolge-Regelung",
            context: "",
            priority: "required",
            source: "missing_subtopic",
            ampel: null,
            reifegrad: null,
            risiko: null,
            hebel: null,
            relevanz90d: null,
            empfehlung: null,
            aufwand: null,
            owner: null,
            naechsterSchritt: null,
          },
        ],
        missingSubtopics: ["b2"],
        counts: { blocks: 1, requiredGaps: 1, niceToHaveGaps: 0, missingSubtopics: 1 },
      },
    };
    const buf = await renderExitReportPdf(withMissing);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
