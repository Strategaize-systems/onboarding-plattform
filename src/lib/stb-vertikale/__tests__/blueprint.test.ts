// V10 SLC-172 MT-1 — Tests fuer die pure Blueprint-Adaptiv-Logik (DEC-249, AC-172-6).

import { describe, it, expect } from "vitest";
import type { TemplateBlock } from "@/lib/db/template-queries";
import {
  deriveVertiefungCouplings,
  surfacedVertiefungFrageIds,
  coupledKernFrageIds,
  filterAdaptiveBlocks,
  isYellowOrRed,
  parseAmpel,
} from "../blueprint";

// Minimal-Fixture nach dem Seed-Shape (MIG-126): Kern in stufe1, Vertiefung in
// stufe2, gekoppelt ueber gemeinsames `unterbereich`. Enthaelt die 5 echten
// Paare + eine ungekoppelte Kern-Frage (g1) ohne Vertiefung.
function q(
  frage_id: string,
  ebene: string,
  unterbereich: string
): TemplateBlock["questions"][number] {
  return {
    id: `uuid-${frage_id}`,
    frage_id,
    text: `Frage ${frage_id}`,
    ebene,
    unterbereich,
    position: 1,
    owner_dependency: false,
    deal_blocker: false,
    sop_trigger: false,
    ko_hart: false,
    ko_soft: false,
  };
}

const BLOCKS: TemplateBlock[] = [
  {
    id: "b-stufe1",
    key: "stufe1_kern",
    title: { de: "Stufe 1" },
    order: 1,
    required: true,
    weight: 1,
    questions: [
      q("F-BP-004", "Kern", "a2_erloesmix_marge"),
      q("F-BP-005", "Kern", "b1_personalengpass"),
      q("F-BP-007", "Kern", "c1_beratungsverschiebung"),
      q("F-BP-009", "Kern", "d1_ki_einsatz"),
      q("F-BP-013", "Kern", "f1_inhaberabhaengigkeit"),
      q("F-BP-015", "Kern", "g1_zukunftsstandort"), // ungekoppelt (keine Vertiefung)
    ],
  },
  {
    id: "b-stufe2",
    key: "stufe2_vertiefung",
    title: { de: "Stufe 2" },
    order: 2,
    required: false,
    weight: 1,
    questions: [
      q("F-BP-016", "Vertiefung", "a2_erloesmix_marge"),
      q("F-BP-017", "Vertiefung", "b1_personalengpass"),
      q("F-BP-018", "Vertiefung", "c1_beratungsverschiebung"),
      q("F-BP-019", "Vertiefung", "d1_ki_einsatz"),
      q("F-BP-020", "Vertiefung", "f1_inhaberabhaengigkeit"),
    ],
  },
];

describe("deriveVertiefungCouplings", () => {
  it("leitet genau die 5 Kern->Vertiefung-Paare aus dem Template ab", () => {
    const couplings = deriveVertiefungCouplings(BLOCKS);
    expect(couplings).toHaveLength(5);
    const pairs = couplings
      .map((c) => `${c.kernFrageId}->${c.vertiefungFrageId}`)
      .sort();
    expect(pairs).toEqual([
      "F-BP-004->F-BP-016",
      "F-BP-005->F-BP-017",
      "F-BP-007->F-BP-018",
      "F-BP-009->F-BP-019",
      "F-BP-013->F-BP-020",
    ]);
  });

  it("koppelt keine Vertiefung ohne Kern-Anker", () => {
    const orphan: TemplateBlock[] = [
      {
        ...BLOCKS[1],
        questions: [q("F-BP-099", "Vertiefung", "x_unbekannt")],
      },
    ];
    expect(deriveVertiefungCouplings(orphan)).toHaveLength(0);
  });

  it("vergleicht ebene case-insensitiv", () => {
    const mixed: TemplateBlock[] = [
      {
        ...BLOCKS[0],
        questions: [q("F-BP-004", "KERN", "a2_erloesmix_marge")],
      },
      {
        ...BLOCKS[1],
        questions: [q("F-BP-016", "vertiefung", "a2_erloesmix_marge")],
      },
    ];
    expect(deriveVertiefungCouplings(mixed)).toHaveLength(1);
  });
});

describe("coupledKernFrageIds", () => {
  it("liefert die distinkten triggernden Kern-Fragen", () => {
    const ids = coupledKernFrageIds(deriveVertiefungCouplings(BLOCKS)).sort();
    expect(ids).toEqual([
      "F-BP-004",
      "F-BP-005",
      "F-BP-007",
      "F-BP-009",
      "F-BP-013",
    ]);
  });
});

describe("surfacedVertiefungFrageIds", () => {
  const couplings = deriveVertiefungCouplings(BLOCKS);

  it("blendet bei gruen keine Vertiefung ein (Gratis-Test bleibt bei 15)", () => {
    const surfaced = surfacedVertiefungFrageIds(couplings, {
      "F-BP-004": "green",
      "F-BP-013": "green",
    });
    expect(surfaced).toEqual([]);
  });

  it("blendet bei gelb/rot genau die gekoppelte Vertiefung ein", () => {
    const surfaced = surfacedVertiefungFrageIds(couplings, {
      "F-BP-004": "yellow",
      "F-BP-013": "red",
      "F-BP-005": "green",
    }).sort();
    expect(surfaced).toEqual(["F-BP-016", "F-BP-020"]);
  });

  it("ignoriert fehlende/unbekannte Kern-Ampeln", () => {
    expect(surfacedVertiefungFrageIds(couplings, {})).toEqual([]);
    expect(
      surfacedVertiefungFrageIds(couplings, { "F-BP-999": "red" })
    ).toEqual([]);
  });
});

describe("filterAdaptiveBlocks", () => {
  const couplings = deriveVertiefungCouplings(BLOCKS);

  it("entfernt den Vertiefungs-Block komplett, solange keine Kern-Antwort gelb/rot ist", () => {
    const surfaced = surfacedVertiefungFrageIds(couplings, {
      "F-BP-004": "green",
    });
    const filtered = filterAdaptiveBlocks(BLOCKS, surfaced);
    expect(filtered.map((b) => b.key)).toEqual(["stufe1_kern"]);
    // Kern-Block bleibt vollstaendig (inkl. ungekoppelter g1-Frage).
    expect(filtered[0].questions).toHaveLength(6);
  });

  it("blendet nur die gekoppelte Vertiefungsfrage ein, Kern bleibt voll", () => {
    const surfaced = surfacedVertiefungFrageIds(couplings, {
      "F-BP-004": "yellow",
      "F-BP-013": "red",
    });
    const filtered = filterAdaptiveBlocks(BLOCKS, surfaced);
    expect(filtered.map((b) => b.key)).toEqual([
      "stufe1_kern",
      "stufe2_vertiefung",
    ]);
    expect(filtered[0].questions).toHaveLength(6); // Kern unveraendert
    expect(
      filtered[1].questions.map((q) => q.frage_id).sort()
    ).toEqual(["F-BP-016", "F-BP-020"]);
  });

  it("haelt alle Vertiefungsfragen, wenn alle gekoppelten Kern-Fragen gelb/rot sind", () => {
    const surfaced = surfacedVertiefungFrageIds(couplings, {
      "F-BP-004": "red",
      "F-BP-005": "yellow",
      "F-BP-007": "red",
      "F-BP-009": "yellow",
      "F-BP-013": "red",
    });
    const filtered = filterAdaptiveBlocks(BLOCKS, surfaced);
    expect(filtered[1].questions).toHaveLength(5);
  });
});

describe("isYellowOrRed", () => {
  it("nur yellow/red triggern", () => {
    expect(isYellowOrRed("green")).toBe(false);
    expect(isYellowOrRed("yellow")).toBe(true);
    expect(isYellowOrRed("red")).toBe(true);
  });
});

describe("parseAmpel", () => {
  it("parst sauberes JSON", () => {
    expect(parseAmpel('{"ampel":"red"}')).toBe("red");
    expect(parseAmpel('{"ampel": "green"}')).toBe("green");
    expect(parseAmpel('{"ampel":"yellow"}')).toBe("yellow");
  });

  it("parst blanke Woerter (de/en)", () => {
    expect(parseAmpel("red")).toBe("red");
    expect(parseAmpel("Die Ampel ist GREEN.")).toBe("green");
    expect(parseAmpel("rot")).toBe("red");
    expect(parseAmpel("grün")).toBe("green");
    expect(parseAmpel("gelb")).toBe("yellow");
  });

  it("priorisiert red > yellow > green bei Mehrdeutigkeit", () => {
    expect(parseAmpel("nicht green, eher red")).toBe("red");
    expect(parseAmpel("zwischen green und yellow")).toBe("yellow");
  });

  it("fail-open auf yellow bei unparsebarem Output", () => {
    expect(parseAmpel("")).toBe("yellow");
    expect(parseAmpel("keine ahnung")).toBe("yellow");
  });
});
