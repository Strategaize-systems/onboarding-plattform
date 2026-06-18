// V9.75 SLC-V9.75-B MT-3 — Render-Smoke (renderToBuffer liefert valides PDF, kein Throw).

import { describe, it, expect } from "vitest";
import { renderFahrplanReportPdf } from "./renderer";
import type { FahrplanInput, FahrplanTodo } from "./types";

function todo(p: Partial<FahrplanTodo>): FahrplanTodo {
  return {
    subtopic: "s", subtopicName: "S", blockTitle: "B", title: "t", context: "",
    priority: "required", source: "gap", ampel: null, reifegrad: null, risiko: null,
    hebel: null, relevanz90d: null, empfehlung: null, aufwand: null, owner: null,
    naechsterSchritt: null, ...p,
  };
}

const fullInput: FahrplanInput = {
  sessionId: "sess-1",
  blocks: [
    {
      block_key: "fuehrung",
      block_title: "Führung & Organisation",
      subtopics: [
        {
          key: "delegation",
          name: "Delegation",
          fields: { ampel: "red", reifegrad: 3, risiko: 8, hebel: 7, relevanz_90d: "high", empfehlung: "Rollen dokumentieren", aufwand: "M", owner: "GF", naechster_schritt: "Workshop" },
        },
        { key: "kultur", name: "Kultur", fields: { ampel: "green", reifegrad: 9 } },
      ],
    },
  ],
  todos: [
    todo({ title: "Wer vertritt die GF?", risiko: 8, hebel: 7, relevanz90d: "high", aufwand: "M", owner: "GF", naechsterSchritt: "Workshop", empfehlung: "Rollen dokumentieren" }),
    todo({ title: "Org-Chart?", priority: "nice_to_have", risiko: 3, hebel: 2 }),
    todo({ title: "Nicht erfasst: Nachfolge", source: "missing_subtopic", subtopic: "nachfolge", subtopicName: "Nachfolge" }),
  ],
  missingSubtopics: ["nachfolge"],
  counts: { blocks: 1, requiredGaps: 2, niceToHaveGaps: 1, missingSubtopics: 1 },
};

const emptyInput: FahrplanInput = {
  sessionId: "sess-empty",
  blocks: [],
  todos: [],
  missingSubtopics: [],
  counts: { blocks: 0, requiredGaps: 0, niceToHaveGaps: 0, missingSubtopics: 0 },
};

describe("renderFahrplanReportPdf", () => {
  it("rendert ein valides, nicht-leeres PDF aus vollem Input", async () => {
    const buf = await renderFahrplanReportPdf(fullInput);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);

  it("wirft nicht bei leerem Input (0 Blöcke, 0 To-Dos)", async () => {
    const buf = await renderFahrplanReportPdf(emptyInput);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);

  it("wirft nicht bei Null-Feld-Fixture (alle Felder null)", async () => {
    const nullInput: FahrplanInput = {
      sessionId: "sess-null",
      blocks: [{ block_key: "x", block_title: "X", subtopics: [{ key: "y", name: "Y", fields: {} }] }],
      todos: [todo({ title: "Lücke ohne Felder" })],
      missingSubtopics: [],
      counts: { blocks: 1, requiredGaps: 1, niceToHaveGaps: 0, missingSubtopics: 0 },
    };
    const buf = await renderFahrplanReportPdf(nullInput);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);
});
