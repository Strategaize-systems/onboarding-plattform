// V8 SLC-151 MT-3 — Vitest fuer hausaufgaben-resolvers.

import { describe, it, expect } from "vitest";

import type { HausaufgabeItem, V8Template } from "@/lib/diagnose/types";
import { getHausaufgabenItemsWithErlaeuterung } from "../hausaufgaben-resolvers";

function makeTemplate(
  hausaufgabenLookup: Record<
    string,
    Record<"nein" | "teilweise", string>
  > | undefined,
): V8Template {
  return {
    slug: "exit-readiness-teaser-v1",
    version: 1,
    name: "Mock",
    description: "Mock",
    metadata: {
      usage_kind: "mandanten_report_teaser_v1",
      scoring_kind: "sui_weighted",
      report_renderer: "mandanten_report_v2",
      gewichtung: { m1: 1, m2: 1, m3: 1, m4: 1, m5: 1, m6: 1, m7: 1, m8: 1, m9: 2 },
      stufen_lookup: {} as never,
      hausaufgaben_lookup: hausaufgabenLookup,
    },
    blocks: [],
  };
}

const MOCK_LOOKUP = {
  buergschaften: {
    nein: "Anwaltliche Pruefung + Abloesungs-Strategie 4-6 Monate.",
    teilweise: "Restliche Buergschaften erfassen + Plan finalisieren.",
  },
  schluesselvertraege: {
    nein: "Neu-Aufsetzen in 2-3 Terminen mit dem Anwalt.",
    teilweise: "Aktuelle Klauseln pruefen + ergaenzen.",
  },
  markenrecht: {
    nein: "Umschreibung beim DPMA in 1 Termin.",
    teilweise: "Bestehende Marken inventarisieren + ueberschreiben.",
  },
};

describe("getHausaufgabenItemsWithErlaeuterung — happy path", () => {
  it("returns empty array for empty input", () => {
    const result = getHausaufgabenItemsWithErlaeuterung(
      [],
      makeTemplate(MOCK_LOOKUP),
    );
    expect(result).toEqual([]);
  });

  it("resolves was_zu_tun for nein-status item", () => {
    const items: HausaufgabeItem[] = [
      {
        frage_id: "buergschaften",
        frage_text: "Persoenliche Buergschaften nicht uebertragbar",
        status: "nein",
      },
    ];
    const result = getHausaufgabenItemsWithErlaeuterung(
      items,
      makeTemplate(MOCK_LOOKUP),
    );
    expect(result).toHaveLength(1);
    expect(result[0].was_zu_tun).toBe(
      "Anwaltliche Pruefung + Abloesungs-Strategie 4-6 Monate.",
    );
    expect(result[0].status).toBe("nein");
    expect(result[0].frage_id).toBe("buergschaften");
    expect(result[0].frage_text).toBe(
      "Persoenliche Buergschaften nicht uebertragbar",
    );
  });

  it("resolves was_zu_tun for teilweise-status item", () => {
    const items: HausaufgabeItem[] = [
      {
        frage_id: "buergschaften",
        frage_text: "Buergschaften teils geklaert",
        status: "teilweise",
      },
    ];
    const result = getHausaufgabenItemsWithErlaeuterung(
      items,
      makeTemplate(MOCK_LOOKUP),
    );
    expect(result[0].was_zu_tun).toBe(
      "Restliche Buergschaften erfassen + Plan finalisieren.",
    );
  });

  it("preserves order of input items", () => {
    const items: HausaufgabeItem[] = [
      { frage_id: "markenrecht", frage_text: "Marke", status: "nein" },
      { frage_id: "buergschaften", frage_text: "Buergschaft", status: "nein" },
      { frage_id: "schluesselvertraege", frage_text: "Vertraege", status: "teilweise" },
    ];
    const result = getHausaufgabenItemsWithErlaeuterung(
      items,
      makeTemplate(MOCK_LOOKUP),
    );
    expect(result.map((r) => r.frage_id)).toEqual([
      "markenrecht",
      "buergschaften",
      "schluesselvertraege",
    ]);
  });
});

describe("getHausaufgabenItemsWithErlaeuterung — defensive", () => {
  it("throws when hausaufgaben_lookup is undefined", () => {
    const items: HausaufgabeItem[] = [
      { frage_id: "buergschaften", frage_text: "X", status: "nein" },
    ];
    expect(() =>
      getHausaufgabenItemsWithErlaeuterung(items, makeTemplate(undefined)),
    ).toThrow(/hausaufgaben_lookup is required/);
  });

  it("throws when no lookup entry exists for the frage_id", () => {
    const items: HausaufgabeItem[] = [
      { frage_id: "unknown_frage", frage_text: "X", status: "nein" },
    ];
    expect(() =>
      getHausaufgabenItemsWithErlaeuterung(items, makeTemplate(MOCK_LOOKUP)),
    ).toThrow(/missing entry for frage_id "unknown_frage"/);
  });

  it("throws when status variant is missing in lookup", () => {
    const items: HausaufgabeItem[] = [
      { frage_id: "buergschaften", frage_text: "X", status: "teilweise" },
    ];
    const partialLookup = {
      buergschaften: {
        nein: "Nein-Text",
        teilweise: "",
      },
    };
    expect(() =>
      getHausaufgabenItemsWithErlaeuterung(
        items,
        makeTemplate(partialLookup as never),
      ),
    ).toThrow(/missing fix-text for buergschaften\.teilweise/);
  });
});
