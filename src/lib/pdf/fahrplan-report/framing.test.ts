// V9.75 SLC-V9.75-B MT-2 — Tests fuer die deterministischen Framing-Helfer.

import { describe, it, expect } from "vitest";
import { exitCoupling, ownerOrFallback, prioritize, scopeEstimate } from "./framing";
import type { FahrplanTodo } from "./types";

function todo(p: Partial<FahrplanTodo>): FahrplanTodo {
  return {
    subtopic: "s",
    subtopicName: "S",
    blockTitle: "B",
    title: "t",
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

describe("ownerOrFallback", () => {
  it("liefert den Owner, wenn gesetzt", () => {
    expect(ownerOrFallback("GF")).toBe("GF");
  });
  it("faellt auf Platzhalter zurueck bei leer/null/whitespace", () => {
    expect(ownerOrFallback(null)).toBe("GF / noch zu benennen");
    expect(ownerOrFallback("")).toBe("GF / noch zu benennen");
    expect(ownerOrFallback("   ")).toBe("GF / noch zu benennen");
  });
});

describe("exitCoupling — Band-Grenzen, deterministisch", () => {
  it("hohes Risiko (>=7) + hoher Hebel (>=7)", () => {
    const s = exitCoupling({ risiko: 8, hebel: 7, relevanz90d: "high", empfehlung: "X tun" });
    expect(s).toContain("Hohes Due-Diligence-Risiko (8/10)");
    expect(s).toContain("Hoher Wert-Hebel (7/10)");
    expect(s).toContain("90 Tagen prioritär");
    expect(s).toContain("Empfehlung: X tun");
  });
  it("mittleres Risiko (4–6), mittlerer Hebel (4–6)", () => {
    const s = exitCoupling({ risiko: 5, hebel: 4, relevanz90d: "medium", empfehlung: null });
    expect(s).toContain("Mittleres Due-Diligence-Risiko (5/10)");
    expect(s).toContain("Mittlerer Wert-Hebel (4/10)");
    expect(s).toContain("Mittelfristig");
    expect(s).not.toContain("Empfehlung:");
  });
  it("Band-Grenze 7 ist high, 6 ist medium, 3 ist low", () => {
    expect(exitCoupling({ risiko: 7, hebel: null, relevanz90d: null, empfehlung: null })).toContain("Hohes");
    expect(exitCoupling({ risiko: 6, hebel: null, relevanz90d: null, empfehlung: null })).toContain("Mittleres");
    expect(exitCoupling({ risiko: 3, hebel: null, relevanz90d: null, empfehlung: null })).toContain("Geringes");
  });
  it("unbekanntes Risiko → 'noch nicht bewertet', unbekannter Hebel → kein Satz", () => {
    const s = exitCoupling({ risiko: null, hebel: null, relevanz90d: null, empfehlung: null });
    expect(s).toContain("noch nicht bewertet");
    expect(s).not.toContain("Hebel");
  });
  it("gleiche Eingabe → gleicher Text (deterministisch)", () => {
    const a = exitCoupling({ risiko: 8, hebel: 7, relevanz90d: "high", empfehlung: "Y" });
    const b = exitCoupling({ risiko: 8, hebel: 7, relevanz90d: "high", empfehlung: "Y" });
    expect(a).toBe(b);
  });
});

describe("prioritize — Sort + Stabilitaet", () => {
  it("required vor nice_to_have", () => {
    const out = prioritize([
      todo({ title: "nth", priority: "nice_to_have", risiko: 10, hebel: 10 }),
      todo({ title: "req", priority: "required", risiko: 1, hebel: 1 }),
    ]);
    expect(out[0]!.title).toBe("req");
  });
  it("innerhalb required: risiko*hebel absteigend", () => {
    const out = prioritize([
      todo({ title: "low", risiko: 2, hebel: 2 }), // 4
      todo({ title: "high", risiko: 8, hebel: 7 }), // 56
    ]);
    expect(out.map((t) => t.title)).toEqual(["high", "low"]);
  });
  it("tie-break per relevanz_90d (high>medium>low)", () => {
    const out = prioritize([
      todo({ title: "med", risiko: 5, hebel: 2, relevanz90d: "medium" }),
      todo({ title: "hi", risiko: 5, hebel: 2, relevanz90d: "high" }),
    ]);
    expect(out.map((t) => t.title)).toEqual(["hi", "med"]);
  });
  it("mutiert die Eingabe nicht", () => {
    const inp = [todo({ title: "a", priority: "nice_to_have" }), todo({ title: "b", priority: "required" })];
    const snapshot = inp.map((t) => t.title);
    prioritize(inp);
    expect(inp.map((t) => t.title)).toEqual(snapshot);
  });
});

describe("scopeEstimate — Heuristik-Baender", () => {
  it("0 kritisch → vollstaendig", () => {
    expect(scopeEstimate({ requiredGaps: 0, niceToHaveGaps: 5, missingSubtopics: 0 })).toContain("Keine kritischen");
  });
  it("1–3 → Tage", () => {
    expect(scopeEstimate({ requiredGaps: 2, niceToHaveGaps: 0, missingSubtopics: 1 })).toContain("1–2 Tage");
  });
  it("4–8 → Wochen", () => {
    expect(scopeEstimate({ requiredGaps: 4, niceToHaveGaps: 0, missingSubtopics: 2 })).toContain("1–2 Wochen");
  });
  it(">8 → mehrere Wochen", () => {
    expect(scopeEstimate({ requiredGaps: 7, niceToHaveGaps: 0, missingSubtopics: 5 })).toContain("mehrere Wochen");
  });
});
