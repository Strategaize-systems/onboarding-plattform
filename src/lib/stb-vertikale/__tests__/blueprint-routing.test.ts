// SLC-172 MT-3 — hermetische Tests fuer das deterministische Blueprint-Modul-Routing.
// Keine DB/LLM-Abhaengigkeit (pure Helfer).

import { describe, it, expect } from "vitest";
import {
  coerceAmpel,
  deriveSubtopicAmpel,
  computeModuleRouting,
  parseRoutingMeta,
  type BlueprintRoutingTarget,
} from "../blueprint-routing";
import type { DiagnosisContent } from "@/workers/diagnosis/types";

describe("coerceAmpel", () => {
  it("akzeptiert gueltige Ampeln (case/whitespace-tolerant)", () => {
    expect(coerceAmpel("green")).toBe("green");
    expect(coerceAmpel(" YELLOW ")).toBe("yellow");
    expect(coerceAmpel("Red")).toBe("red");
  });

  it("liefert null fuer Unbekanntes/Nicht-Strings", () => {
    expect(coerceAmpel("orange")).toBeNull();
    expect(coerceAmpel("")).toBeNull();
    expect(coerceAmpel(5)).toBeNull();
    expect(coerceAmpel(null)).toBeNull();
    expect(coerceAmpel(undefined)).toBeNull();
  });
});

function diag(
  block_key: string,
  subs: Array<{ key: string; name: string; ampel: string | number | null }>
): DiagnosisContent {
  return {
    block_key,
    block_title: `Block ${block_key}`,
    subtopics: subs.map((s) => ({
      key: s.key,
      name: s.name,
      fields: { ampel: s.ampel, reifegrad: 4, empfehlung: "x" },
    })),
  };
}

describe("deriveSubtopicAmpel", () => {
  it("flacht A–G zu subtopic.key -> {ampel,name} ab", () => {
    const map = deriveSubtopicAmpel([
      diag("A", [
        { key: "a1", name: "A1", ampel: "green" },
        { key: "a2", name: "A2", ampel: "red" },
      ]),
      diag("B", [{ key: "b1", name: "B1", ampel: "weird" }]),
    ]);
    expect(map.a1).toEqual({ ampel: "green", name: "A1" });
    expect(map.a2).toEqual({ ampel: "red", name: "A2" });
    expect(map.b1.ampel).toBeNull(); // unbekannte Ampel -> null
    expect(map.b1.name).toBe("B1");
  });
});

const ROUTING: BlueprintRoutingTarget[] = [
  {
    block: "A",
    subtopic: "a1",
    activate_when: { ampel: ["yellow", "red"] },
    primary_modul_key: "m07",
    secondary_modul_key: "m06",
  },
  {
    block: "A",
    subtopic: "a2",
    activate_when: { ampel: ["yellow", "red"] },
    primary_modul_key: "m01",
    secondary_modul_key: null,
  },
];

describe("computeModuleRouting", () => {
  it("aktiviert nur Ziele mit gelb/rot, ueberspringt gruen + nicht bewertet", () => {
    const recs = computeModuleRouting(ROUTING, {
      a1: { ampel: "red", name: "Selbststeuerung" },
      a2: { ampel: "green", name: "Erloesmix" }, // gruen -> kein Modul
      // a3 fehlt -> kein Routing-Ziel
    });
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      block: "A",
      subtopic: "a1",
      subtopicName: "Selbststeuerung",
      ampel: "red",
      primaryModulKey: "m07",
      secondaryModulKey: "m06",
    });
  });

  it("liefert leeres Array wenn alles gruen/unbewertet ist", () => {
    expect(
      computeModuleRouting(ROUTING, {
        a1: { ampel: "green", name: "A1" },
        a2: { ampel: null, name: "A2" },
      })
    ).toEqual([]);
  });

  it("ist deterministisch in Routing-Reihenfolge", () => {
    const recs = computeModuleRouting(ROUTING, {
      a1: { ampel: "yellow", name: "A1" },
      a2: { ampel: "red", name: "A2" },
    });
    expect(recs.map((r) => r.subtopic)).toEqual(["a1", "a2"]);
  });
});

describe("parseRoutingMeta", () => {
  it("parst gueltige routing[]-Eintraege", () => {
    const parsed = parseRoutingMeta({
      routing: [
        {
          block: "A",
          subtopic: "a1",
          activate_when: { ampel: ["yellow", "red"] },
          primary_modul_key: "m07",
          secondary_modul_key: "m06",
        },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].activate_when.ampel).toEqual(["yellow", "red"]);
    expect(parsed[0].secondary_modul_key).toBe("m06");
  });

  it("verwirft fehlerhafte Eintraege still (Drift-tolerant)", () => {
    const parsed = parseRoutingMeta({
      routing: [
        { subtopic: "a1", primary_modul_key: "m07" }, // block fehlt
        { block: "B", subtopic: "b1" }, // primary fehlt
        {
          block: "C",
          subtopic: "c1",
          activate_when: { ampel: ["nope"] }, // keine gueltige Ampel
          primary_modul_key: "m08",
        },
        {
          block: "D",
          subtopic: "d1",
          activate_when: { ampel: ["red"] },
          primary_modul_key: "m36",
          // secondary fehlt -> null
        },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      block: "D",
      subtopic: "d1",
      primary_modul_key: "m36",
      secondary_modul_key: null,
    });
  });

  it("liefert [] fuer Nicht-Objekte / fehlendes routing", () => {
    expect(parseRoutingMeta(null)).toEqual([]);
    expect(parseRoutingMeta({})).toEqual([]);
    expect(parseRoutingMeta({ routing: "x" })).toEqual([]);
    expect(parseRoutingMeta("string")).toEqual([]);
  });
});
