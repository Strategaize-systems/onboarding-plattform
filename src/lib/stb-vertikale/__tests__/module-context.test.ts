// V10 SLC-174 MT-1 — Pure-Tests fuer module-context (Extraktion + Q&A-Assembly).

import { describe, it, expect } from "vitest";
import {
  extractModuleContext,
  assembleQaPairs,
  moduleFrageIds,
  type TemplateLike,
  type CheckpointSnapshot,
} from "../module-context";
import type { TemplateBlock } from "@/lib/db/template-queries";

const Q1_ID = "36f54958-d613-5342-bb38-baa71240a085";
const Q2_ID = "eb4f5173-cbeb-557f-8fb9-862aa632765e";
const Q3_ID = "0c9cd76a-b96a-5f5c-8cc7-6768b4ac40e5";

function makeBlocks(): TemplateBlock[] {
  return [
    {
      id: "b1",
      key: "stufe1_kern",
      title: { de: "Stufe 1 – Kern" },
      description: null,
      order: 1,
      required: true,
      weight: 1,
      questions: [
        {
          id: Q1_ID,
          frage_id: "F-M04-001",
          text: "Woran erkennen Sie, ob es gut läuft?",
          ebene: "Kern",
          unterbereich: "Block D / D1",
          position: 1,
          owner_dependency: false,
          deal_blocker: false,
          sop_trigger: false,
          ko_hart: false,
          ko_soft: false,
        },
        {
          id: Q2_ID,
          frage_id: "F-M04-002",
          text: "Welche Zahlen schauen Sie regelmäßig an?",
          ebene: "Kern",
          unterbereich: "Block D / D1",
          position: 2,
          owner_dependency: false,
          deal_blocker: false,
          sop_trigger: false,
          ko_hart: false,
          ko_soft: false,
        },
      ],
    },
    {
      id: "b2",
      key: "stufe2_vertiefung",
      title: { de: "Stufe 2 – Vertiefung" },
      description: null,
      order: 2,
      required: false,
      weight: 1,
      questions: [
        {
          id: Q3_ID,
          frage_id: "F-M04-006",
          text: "Verstehen Sie, wo Geld verdient wird?",
          ebene: "Workspace",
          unterbereich: "Block D / D4",
          position: 11,
          owner_dependency: false,
          deal_blocker: false,
          sop_trigger: false,
          ko_hart: false,
          ko_soft: false,
        },
      ],
    },
  ];
}

function makeTemplate(): TemplateLike {
  return {
    name: "M-04 – Grundlegende Finanzsteuerung",
    description: "Test-Modul",
    blocks: makeBlocks(),
    metadata: {
      modul_id: "M-04",
      modul_key: "m04",
      output_contract: {
        kinds: ["entscheidung", "standard", "implementierungsschritt"],
        ki_hebel_kind: "ki_hebel",
        reifegrad_range: [1, 4],
        beschreibung: "…",
      },
      themenmodell: [{ key: "2.1", name: "Orientierung", unterpunkte: ["a", "b"] }],
      dod: "Monatszahlen liegen vor.",
      output_artefakte: ["KPI-Set"],
      ki_hebel: [
        {
          hebel_id: "H-M04-001",
          name: "Monatsreport-Autokommentar",
          beschreibung: "…",
          reifegrad: 2,
          referenz: "2.3",
        },
      ],
    },
  };
}

describe("extractModuleContext", () => {
  it("parses metadata + output_contract + ki_hebel catalog", () => {
    const ctx = extractModuleContext(makeTemplate());
    expect(ctx.modulKey).toBe("m04");
    expect(ctx.name).toContain("M-04");
    expect(ctx.metadata.output_contract.kinds).toContain("entscheidung");
    expect(ctx.metadata.ki_hebel[0].reifegrad).toBe(2);
    expect(ctx.blocks).toHaveLength(2);
  });

  it("throws when metadata.modul_key is missing", () => {
    const t = makeTemplate();
    t.metadata = { output_contract: { kinds: [] } };
    expect(() => extractModuleContext(t)).toThrow();
  });
});

describe("assembleQaPairs", () => {
  it("pairs answered questions with frage_id + text, sorted by block/position", () => {
    const checkpoints: CheckpointSnapshot[] = [
      {
        block_key: "stufe1_kern",
        content: { answers: { [Q1_ID]: "Wachstum + Marge", [Q2_ID]: "  " } },
      },
      { block_key: "stufe2_vertiefung", content: { answers: { [Q3_ID]: "Ja, je Projekt" } } },
    ];
    const pairs = assembleQaPairs(makeBlocks(), checkpoints);
    // Q2 is blank -> skipped; Q1 + Q3 remain, in block/position order.
    expect(pairs.map((p) => p.frageId)).toEqual(["F-M04-001", "F-M04-006"]);
    expect(pairs[0].answer).toBe("Wachstum + Marge");
    expect(pairs[0].blockTitle).toBe("Stufe 1 – Kern");
    expect(pairs[1].unterbereich).toBe("Block D / D4");
  });

  it("appends evidence.<block>.<qid> answers to their question", () => {
    const checkpoints: CheckpointSnapshot[] = [
      {
        block_key: "stufe1_kern",
        content: {
          answers: {
            [Q1_ID]: "Marge",
            [`evidence.stufe1_kern.${Q1_ID}`]: "Auszug aus GuV",
          },
        },
      },
    ];
    const pairs = assembleQaPairs(makeBlocks(), checkpoints);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].answer).toContain("Marge");
    expect(pairs[0].answer).toContain("[Beleg] Auszug aus GuV");
  });

  it("returns empty when no answers", () => {
    expect(assembleQaPairs(makeBlocks(), [])).toEqual([]);
    expect(
      assembleQaPairs(makeBlocks(), [{ block_key: "stufe1_kern", content: {} }]),
    ).toEqual([]);
  });
});

describe("moduleFrageIds", () => {
  it("collects all frage_id across blocks", () => {
    const ids = moduleFrageIds(makeBlocks());
    expect(ids.has("F-M04-001")).toBe(true);
    expect(ids.has("F-M04-006")).toBe(true);
    expect(ids.size).toBe(3);
  });
});
