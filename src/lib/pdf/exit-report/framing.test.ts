// V10.5 SLC-191 MT-3 — TDD fuer das Kaeufer-Framing (3-Spalten, deterministisch, 0 LLM).

import { describe, it, expect } from "vitest";

import { buildBuyerFindings } from "./framing";
import type { FahrplanTodo } from "../fahrplan-report/types";

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

describe("buildBuyerFindings", () => {
  it("priorisiert required vor nice_to_have (reuse prioritize)", () => {
    const findings = buildBuyerFindings([
      todo({ title: "N", priority: "nice_to_have", risiko: 9, hebel: 9 }),
      todo({ title: "R", priority: "required", risiko: 1, hebel: 1 }),
    ]);
    expect(findings.map((f) => f.title)).toEqual(["R", "N"]);
  });

  it("befuellt alle 3 Spalten pro Finding", () => {
    const [f] = buildBuyerFindings([todo({ risiko: 5, hebel: 5 })]);
    expect(f.kaeuferSicht.length).toBeGreaterThan(0);
    expect(f.ddAnsatz.length).toBeGreaterThan(0);
    expect(f.abmilderung.length).toBeGreaterThan(0);
  });

  it("high-risiko → Deal-Breaker-Sprache in ddAnsatz", () => {
    const [f] = buildBuyerFindings([todo({ risiko: 9, ampel: "red" })]);
    expect(f.ddAnsatz).toMatch(/Deal-Breaker/i);
    expect(f.kaeuferSicht).toMatch(/Risiko/i);
  });

  it("empfehlung → abmilderung beginnt mit 'Vor dem Verkauf:'", () => {
    const [f] = buildBuyerFindings([todo({ empfehlung: "Prozessdoku erstellen" })]);
    expect(f.abmilderung).toBe("Vor dem Verkauf: Prozessdoku erstellen");
  });

  it("ist band-stabil (gleiche Eingabe → identischer Output)", () => {
    const t = todo({ risiko: 6, hebel: 7, relevanz90d: "high", ampel: "yellow" });
    expect(buildBuyerFindings([t])[0]).toEqual(buildBuyerFindings([t])[0]);
  });

  it("defensiv bei komplett leeren Feldern (keine Crashes, Default-Texte)", () => {
    const [f] = buildBuyerFindings([todo({})]);
    expect(f.kaeuferSicht.length).toBeGreaterThan(0);
    expect(f.ddAnsatz.length).toBeGreaterThan(0);
    expect(f.abmilderung.length).toBeGreaterThan(0);
    expect(f.ampel).toBeNull();
  });

  it("uebernimmt Titel/Subtopic/Block/priority/ampel aus dem Todo", () => {
    const [f] = buildBuyerFindings([
      todo({ title: "T", subtopicName: "Sub", blockTitle: "Blk", ampel: "green" }),
    ]);
    expect(f).toMatchObject({ title: "T", subtopicName: "Sub", blockTitle: "Blk", priority: "required", ampel: "green" });
  });

  it("green/low → unkritische Kaeufer-Sicht, geringe DD-Angriffsflaeche", () => {
    const [f] = buildBuyerFindings([todo({ ampel: "green", risiko: 2 })]);
    expect(f.kaeuferSicht).toMatch(/unkritisch/i);
    expect(f.ddAnsatz).toMatch(/[Gg]ering/);
  });
});
