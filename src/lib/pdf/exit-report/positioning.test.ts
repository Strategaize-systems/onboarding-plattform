// V10.5 SLC-192 MT-1 — Struktur-/Content-Assert der Positionierungs-Copy.
// Copy = Wording-Review (MT-4); dieser Test sichert nur, dass beide Spur-Seiten
// und der Disclaimer-Kernsatz strukturell vorhanden sind (Regressions-Schutz).

import { describe, it, expect } from "vitest";

import { EXIT_SPUR_COPY, MAKLER_DISCLAIMER_COPY } from "./positioning";

describe("EXIT_SPUR_COPY", () => {
  it("nennt die bewertete Spur mit konkreten operativen Dimensionen", () => {
    expect(EXIT_SPUR_COPY.wasWirBewerten.items.length).toBeGreaterThanOrEqual(3);
    const joined = EXIT_SPUR_COPY.wasWirBewerten.items.join(" ").toLowerCase();
    expect(joined).toContain("owner-dependence");
    expect(joined).toContain("übertragbarkeit");
  });

  it("grenzt die NICHT bewertete Spur (Finanz/Steuer/Recht) ausdrücklich ab", () => {
    const joined = EXIT_SPUR_COPY.wasWirNichtBewerten.items.join(" ").toLowerCase();
    expect(joined).toContain("due diligence");
    expect(joined).toContain("steuer");
    expect(joined).toContain("recht");
    // Verweis auf die zustaendigen Fachspuren (Pruefer/Anwalt).
    const all = joined + EXIT_SPUR_COPY.hinweis.toLowerCase();
    expect(all).toContain("wirtschaftsprüfer");
    expect(all).toContain("anwalt");
  });

  it("hat beide Seiten (was / was-nicht) nicht-leer", () => {
    expect(EXIT_SPUR_COPY.wasWirBewerten.items.length).toBeGreaterThan(0);
    expect(EXIT_SPUR_COPY.wasWirNichtBewerten.items.length).toBeGreaterThan(0);
    expect(EXIT_SPUR_COPY.wasWirBewerten.label.trim().length).toBeGreaterThan(0);
    expect(EXIT_SPUR_COPY.wasWirNichtBewerten.label.trim().length).toBeGreaterThan(0);
  });
});

describe("MAKLER_DISCLAIMER_COPY", () => {
  it("enthält den Kernsatz zur Datengrundlage (Angaben des Eigentümers, ungeprüft)", () => {
    const t = MAKLER_DISCLAIMER_COPY.text.toLowerCase();
    expect(t).toContain("angaben des eigentümers");
    expect(t).toContain("nicht unabhängig geprüft");
    expect(MAKLER_DISCLAIMER_COPY.title.trim().length).toBeGreaterThan(0);
  });
});
