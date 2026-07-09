// V10.5 SLC-191 MT-2 — TDD fuer den Owner-Dependence-Index (DEC-273).
// Fixiert die Q-V10.5-G-Gewichtung: red=2/yellow=1/green=0, headline=round(Σ/(2·nDim)·10),
// level hoch≥7 / mittel 4–6 / gering ≤3, 0 owner-dep-Dimensionen → nicht_ermittelbar.

import { describe, it, expect } from "vitest";

import { computeOwnerDependenceIndex } from "./owner-dependence";
import type { ExitReportInput } from "./types";

function mkInput(cfg: {
  blocks: Array<{
    key: string;
    ownerDeps: Array<{ frageId: string; answered: boolean }>;
    subtopics?: Array<{ key: string; questionKeys: string[]; ampel?: string; risiko?: number }>;
  }>;
}): ExitReportInput {
  const fahrplanBlocks = cfg.blocks.map((b) => ({
    block_key: b.key,
    block_title: `Block ${b.key}`,
    subtopics: (b.subtopics ?? []).map((s) => ({
      key: s.key,
      name: s.key,
      fields: {
        ...(s.ampel !== undefined ? { ampel: s.ampel } : {}),
        ...(s.risiko !== undefined ? { risiko: s.risiko } : {}),
      } as Record<string, string | number | null>,
    })),
  }));
  const ownerDepQuestions = cfg.blocks.flatMap((b, bi) =>
    b.ownerDeps.map((o, qi) => ({
      blockKey: b.key,
      questionId: `q-${bi}-${qi}`,
      frageId: o.frageId,
      answered: o.answered,
    })),
  );
  const diagnosisSubtopics = cfg.blocks.flatMap((b) =>
    (b.subtopics ?? []).map((s) => ({
      blockKey: b.key,
      key: s.key,
      name: s.key,
      questionKeys: s.questionKeys,
    })),
  );
  return {
    sessionId: "s1",
    fahrplan: {
      sessionId: "s1",
      blocks: fahrplanBlocks,
      todos: [],
      missingSubtopics: [],
      counts: { blocks: fahrplanBlocks.length, requiredGaps: 0, niceToHaveGaps: 0, missingSubtopics: 0 },
    },
    ownerDepQuestions,
    diagnosisSubtopics,
    answers: {},
    blockTitles: Object.fromEntries(cfg.blocks.map((b) => [b.key, `Block ${b.key}`])),
  };
}

const dim = (idx: ReturnType<typeof computeOwnerDependenceIndex>, key: string) =>
  idx.dimensions.find((d) => d.blockKey === key)!;

describe("computeOwnerDependenceIndex — Per-Dimension-Ampel", () => {
  it("green: alle owner-dep beantwortet, verlinktes Subtopic green, risiko niedrig", () => {
    const idx = computeOwnerDependenceIndex(
      mkInput({
        blocks: [
          {
            key: "A",
            ownerDeps: [{ frageId: "F-BP-001", answered: true }],
            subtopics: [{ key: "a1", questionKeys: ["F-BP-001"], ampel: "green", risiko: 2 }],
          },
        ],
      }),
    );
    expect(dim(idx, "A").ampel).toBe("green");
  });

  it("red: verlinktes owner-dep-Subtopic ampel=red", () => {
    const idx = computeOwnerDependenceIndex(
      mkInput({
        blocks: [
          {
            key: "B",
            ownerDeps: [{ frageId: "F-BP-015", answered: true }],
            subtopics: [{ key: "b1", questionKeys: ["F-BP-015"], ampel: "red", risiko: 3 }],
          },
        ],
      }),
    );
    expect(dim(idx, "B").ampel).toBe("red");
    expect(dim(idx, "B").worstAmpel).toBe("red");
  });

  it("red: risiko>=7 (auch bei ampel green)", () => {
    const idx = computeOwnerDependenceIndex(
      mkInput({
        blocks: [
          {
            key: "C",
            ownerDeps: [{ frageId: "F-BP-020", answered: true }],
            subtopics: [{ key: "c1", questionKeys: ["F-BP-020"], ampel: "green", risiko: 8 }],
          },
        ],
      }),
    );
    expect(dim(idx, "C").ampel).toBe("red");
    expect(dim(idx, "C").maxRisiko).toBe(8);
  });

  it("yellow: risiko 4–6", () => {
    const idx = computeOwnerDependenceIndex(
      mkInput({
        blocks: [
          {
            key: "D",
            ownerDeps: [{ frageId: "F-BP-030", answered: true }],
            subtopics: [{ key: "d1", questionKeys: ["F-BP-030"], ampel: "green", risiko: 5 }],
          },
        ],
      }),
    );
    expect(dim(idx, "D").ampel).toBe("yellow");
  });

  it("yellow: unbeantwortete owner-dep-Frage (Blind Spot), kein red", () => {
    const idx = computeOwnerDependenceIndex(
      mkInput({
        blocks: [
          {
            key: "E",
            ownerDeps: [{ frageId: "F-BP-040", answered: false }],
            subtopics: [{ key: "e1", questionKeys: ["F-BP-040"], ampel: "green", risiko: 1 }],
          },
        ],
      }),
    );
    const e = dim(idx, "E");
    expect(e.ampel).toBe("yellow");
    expect(e.blindSpot).toBe(true);
  });
});

describe("computeOwnerDependenceIndex — Fallback / Block-Granularitaet", () => {
  it("leere diagnosis_schema: unbeantwortete owner-dep → yellow (Block-Fallback)", () => {
    const idx = computeOwnerDependenceIndex(
      mkInput({ blocks: [{ key: "A", ownerDeps: [{ frageId: "F-BP-001", answered: false }] }] }),
    );
    expect(dim(idx, "A").ampel).toBe("yellow"); // blindSpot ohne Subtopic-Verlinkung
    expect(dim(idx, "A").maxRisiko).toBeNull();
  });

  it("leere diagnosis_schema + alle beantwortet → green", () => {
    const idx = computeOwnerDependenceIndex(
      mkInput({ blocks: [{ key: "A", ownerDeps: [{ frageId: "F-BP-001", answered: true }] }] }),
    );
    expect(dim(idx, "A").ampel).toBe("green");
  });

  it("0 owner-dep-Flags → nicht_ermittelbar, headline null", () => {
    const idx = computeOwnerDependenceIndex(mkInput({ blocks: [] }));
    expect(idx.level).toBe("nicht_ermittelbar");
    expect(idx.headline).toBeNull();
    expect(idx.dimensions).toEqual([]);
  });
});

describe("computeOwnerDependenceIndex — Aggregat (Q-V10.5-G)", () => {
  it("A green / B red / C yellow → headline 5, level mittel", () => {
    const idx = computeOwnerDependenceIndex(
      mkInput({
        blocks: [
          {
            key: "A",
            ownerDeps: [
              { frageId: "F-BP-001", answered: true },
              { frageId: "F-BP-002", answered: true },
            ],
            subtopics: [{ key: "a1", questionKeys: ["F-BP-001"], ampel: "green", risiko: 2 }],
          },
          {
            key: "B",
            ownerDeps: [{ frageId: "F-BP-015", answered: true }],
            subtopics: [{ key: "b1", questionKeys: ["F-BP-015"], ampel: "red", risiko: 3 }],
          },
          { key: "C", ownerDeps: [{ frageId: "F-BP-020", answered: false }] },
        ],
      }),
    );
    expect(dim(idx, "A").ampel).toBe("green");
    expect(dim(idx, "B").ampel).toBe("red");
    expect(dim(idx, "C").ampel).toBe("yellow");
    // score = 0 + 2 + 1 = 3; headline = round(3/(2*3)*10) = 5
    expect(idx.headline).toBe(5);
    expect(idx.level).toBe("mittel");
  });

  it("alle red → headline 10, level hoch", () => {
    const idx = computeOwnerDependenceIndex(
      mkInput({
        blocks: [
          { key: "A", ownerDeps: [{ frageId: "F1", answered: true }], subtopics: [{ key: "a1", questionKeys: ["F1"], ampel: "red" }] },
          { key: "B", ownerDeps: [{ frageId: "F2", answered: true }], subtopics: [{ key: "b1", questionKeys: ["F2"], ampel: "red" }] },
        ],
      }),
    );
    expect(idx.headline).toBe(10);
    expect(idx.level).toBe("hoch");
  });

  it("alle green → headline 0, level gering", () => {
    const idx = computeOwnerDependenceIndex(
      mkInput({
        blocks: [
          { key: "A", ownerDeps: [{ frageId: "F1", answered: true }], subtopics: [{ key: "a1", questionKeys: ["F1"], ampel: "green", risiko: 1 }] },
        ],
      }),
    );
    expect(idx.headline).toBe(0);
    expect(idx.level).toBe("gering");
  });

  it("Dimensionen sind nach blockKey sortiert + Titel gesetzt", () => {
    const idx = computeOwnerDependenceIndex(
      mkInput({
        blocks: [
          { key: "C", ownerDeps: [{ frageId: "F3", answered: true }] },
          { key: "A", ownerDeps: [{ frageId: "F1", answered: true }] },
        ],
      }),
    );
    expect(idx.dimensions.map((d) => d.blockKey)).toEqual(["A", "C"]);
    expect(dim(idx, "A").blockTitle).toBe("Block A");
  });
});
