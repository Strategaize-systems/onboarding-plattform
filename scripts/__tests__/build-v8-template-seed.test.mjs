import { describe, it, expect } from "vitest";
import {
  parseLevelsMandant,
  validateParseResult,
  buildMigrationSql,
  STUFEN_MODULES,
  STUFEN_KEYS,
  HYGIENE_KEYS,
} from "../build-v8-template-seed.mjs";

// Helper: build a complete parsed object so the validator passes.
function makeValidParsed() {
  const stufen_lookup = {};
  for (const m of STUFEN_MODULES) {
    stufen_lookup[m] = {};
    for (const s of STUFEN_KEYS) {
      stufen_lookup[m][s] = {
        was_es_bedeutet: `wb-${m}-${s}`,
        unsere_empfehlung: `ue-${m}-${s}`,
      };
    }
  }
  const worum_es_geht = {};
  for (const m of STUFEN_MODULES) worum_es_geht[m] = `worum-${m}`;
  const hausaufgaben_lookup = {};
  for (const h of HYGIENE_KEYS) {
    hausaufgaben_lookup[h] = { teilweise: `t-${h}`, nein: `n-${h}` };
  }
  return { stufen_lookup, worum_es_geht, hausaufgaben_lookup };
}

describe("parseLevelsMandant", () => {
  it("parst Modul-Header, Worum-es-geht und zwei Stufen mit beiden Feldern", () => {
    const md = `# Title

## Modul 1 — Skalierbares Produkt

### Worum es geht

Eine Firma wird verkaufbar, wenn ihre Kernleistung wiederholbar ist.

### Stufe 1 — Noch gar nicht vorhanden

**Was es bedeutet:**
Jedes Mandat ist eine Sonderloesung.

**Unsere Empfehlung:**
Das ist Ihr groesster strategischer Engpass.

### Stufe 2 — Erste Ansaetze

**Was es bedeutet:**
Es gibt erste Ideen.

**Unsere Empfehlung:**
Sie sind auf dem richtigen Weg.

---
`;
    const r = parseLevelsMandant(md);
    expect(r.worum_es_geht).toEqual({
      m1: "Eine Firma wird verkaufbar, wenn ihre Kernleistung wiederholbar ist.",
    });
    expect(r.stufen_lookup.m1.s1).toEqual({
      was_es_bedeutet: "Jedes Mandat ist eine Sonderloesung.",
      unsere_empfehlung: "Das ist Ihr groesster strategischer Engpass.",
    });
    expect(r.stufen_lookup.m1.s2).toEqual({
      was_es_bedeutet: "Es gibt erste Ideen.",
      unsere_empfehlung: "Sie sind auf dem richtigen Weg.",
    });
  });

  it("parst Module 0 Hygiene-Fragen mit Teilweise + Nein", () => {
    const md = `## Modul 0 — Vor-Verkauf-Hygiene

### Worum es geht

Hygiene-Themen.

### M0.1 — Vertraege

**Frage:** Sind Ihre Vertraege digital erfasst?

**Antwort: Teilweise — Hausaufgabe:**
Klaeren Sie Top-20-Vertraege in 90 Tagen.

**Antwort: Nein — Hausaufgabe:**
Anwalt-Mandat in den naechsten 30 Tagen.

### M0.2 — IP

**Frage:** Ist Ihr IP registriert?

**Antwort: Teilweise — Hausaufgabe:**
IP-Anwalt-Termin.

**Antwort: Nein — Hausaufgabe:**
IP-Anwalt-Mandat sofort.

---
`;
    const r = parseLevelsMandant(md);
    expect(r.hausaufgaben_lookup["M0.1"]).toEqual({
      teilweise: "Klaeren Sie Top-20-Vertraege in 90 Tagen.",
      nein: "Anwalt-Mandat in den naechsten 30 Tagen.",
    });
    expect(r.hausaufgaben_lookup["M0.2"]).toEqual({
      teilweise: "IP-Anwalt-Termin.",
      nein: "IP-Anwalt-Mandat sofort.",
    });
    // Modul 0 wird absichtlich NICHT in worum_es_geht aufgenommen (Spec m1..m9).
    expect(r.worum_es_geht.m0).toBeUndefined();
  });

  it("ueberspringt Modul 10 (keine Stufen, kein worum_es_geht)", () => {
    const md = `## Modul 10 — Vermaechtnis

Freitext-Reflexion ohne Stufen-Texte.

---
`;
    const r = parseLevelsMandant(md);
    expect(r.stufen_lookup.m10).toBeUndefined();
    expect(r.worum_es_geht.m10).toBeUndefined();
  });

  it("ignoriert Blockquote-Hinweise (Modul-9-Pattern)", () => {
    const md = `## Modul 9 — Strukturiertes Wertschaffen

> **Hinweis:** Modul 9 ist im SUI doppelt gewichtet (20% statt 10%).

### Worum es geht

Eine Firma verkaufsbereit zu machen ist kein Drei-Monats-Projekt.

### Stufe 1 — Noch gar nicht vorhanden

**Was es bedeutet:**
Veraenderungen werden geplant, aber nicht beendet.

**Unsere Empfehlung:**
Das ist der wichtigste Engpass.

---
`;
    const r = parseLevelsMandant(md);
    expect(r.worum_es_geht.m9).toBe(
      "Eine Firma verkaufsbereit zu machen ist kein Drei-Monats-Projekt.",
    );
    expect(r.stufen_lookup.m9.s1.was_es_bedeutet).toBe(
      "Veraenderungen werden geplant, aber nicht beendet.",
    );
  });

  it("erhaelt mehrere Module nebeneinander", () => {
    const md = `## Modul 1 — A

### Worum es geht

Worum-m1.

### Stufe 1 — X

**Was es bedeutet:**
wb-m1-s1.

**Unsere Empfehlung:**
ue-m1-s1.

---

## Modul 2 — B

### Worum es geht

Worum-m2.

### Stufe 1 — Y

**Was es bedeutet:**
wb-m2-s1.

**Unsere Empfehlung:**
ue-m2-s1.

---
`;
    const r = parseLevelsMandant(md);
    expect(r.worum_es_geht.m1).toBe("Worum-m1.");
    expect(r.worum_es_geht.m2).toBe("Worum-m2.");
    expect(r.stufen_lookup.m1.s1.was_es_bedeutet).toBe("wb-m1-s1.");
    expect(r.stufen_lookup.m2.s1.was_es_bedeutet).toBe("wb-m2-s1.");
  });
});

describe("validateParseResult", () => {
  it("liefert leeres Array bei vollstaendigem Input", () => {
    const errors = validateParseResult(makeValidParsed());
    expect(errors).toEqual([]);
  });

  it("meldet fehlendes worum_es_geht", () => {
    const parsed = makeValidParsed();
    delete parsed.worum_es_geht.m3;
    const errors = validateParseResult(parsed);
    expect(errors).toContain("worum_es_geht.m3 fehlt oder leer");
  });

  it("meldet fehlende Unsere-Empfehlung pro Stufe", () => {
    const parsed = makeValidParsed();
    delete parsed.stufen_lookup.m4.s2.unsere_empfehlung;
    const errors = validateParseResult(parsed);
    expect(errors).toContain("stufen_lookup.m4.s2.unsere_empfehlung fehlt");
  });

  it("meldet fehlendes komplettes Modul", () => {
    const parsed = makeValidParsed();
    delete parsed.stufen_lookup.m5;
    const errors = validateParseResult(parsed);
    expect(errors).toContain("stufen_lookup.m5 fehlt");
  });

  it("meldet fehlende Hygiene-Hausaufgaben", () => {
    const parsed = makeValidParsed();
    delete parsed.hausaufgaben_lookup["M0.3"].nein;
    const errors = validateParseResult(parsed);
    expect(errors).toContain("hausaufgaben_lookup.M0.3.nein fehlt");
  });

  it("integration: Markdown ohne Unsere-Empfehlung wird vom Validator markiert", () => {
    const md = `## Modul 1 — A

### Worum es geht

Worum.

### Stufe 1 — X

**Was es bedeutet:**
wb.

---
`;
    const parsed = parseLevelsMandant(md);
    const errors = validateParseResult(parsed);
    expect(errors.some((e) => e.includes("stufen_lookup.m1.s1.unsere_empfehlung"))).toBe(true);
  });
});

describe("buildMigrationSql", () => {
  it("escaped Single-Quotes in JSONB-Literalen", () => {
    const parsed = {
      stufen_lookup: {
        m1: {
          s1: {
            was_es_bedeutet: "it's complex",
            unsere_empfehlung: "do it now",
          },
        },
      },
      worum_es_geht: { m1: "doesn't matter" },
      hausaufgaben_lookup: { "M0.1": { teilweise: "t", nein: "n" } },
    };
    const sql = buildMigrationSql(parsed);
    expect(sql).toContain("it''s complex");
    expect(sql).toContain("doesn''t matter");
  });

  it("enthaelt alle Pflicht-Metadata-Felder und Idempotenz-Klausel", () => {
    const sql = buildMigrationSql({
      stufen_lookup: {},
      worum_es_geht: {},
      hausaufgaben_lookup: {},
    });
    expect(sql).toContain("INSERT INTO public.template");
    expect(sql).toContain("ON CONFLICT (slug, version) DO UPDATE");
    expect(sql).toContain("'usage_kind'");
    expect(sql).toContain("'mandanten_report_teaser_v1'");
    expect(sql).toContain("'scoring_kind'");
    expect(sql).toContain("'sui_weighted'");
    expect(sql).toContain("'report_renderer'");
    expect(sql).toContain("'mandanten_report_v2'");
    expect(sql).toContain("'gewichtung'");
    expect(sql).toContain("'stufen_lookup'");
    expect(sql).toContain("'worum_es_geht'");
    expect(sql).toContain("'hausaufgaben_lookup'");
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });

  it("setzt Gewichtungs-Werte m1..m8 = 10 und m9 = 20", () => {
    const sql = buildMigrationSql({
      stufen_lookup: {},
      worum_es_geht: {},
      hausaufgaben_lookup: {},
    });
    expect(sql).toMatch(/"m1":10/);
    expect(sql).toMatch(/"m8":10/);
    expect(sql).toMatch(/"m9":20/);
  });

  it("enthaelt einen blocks-Platzhalter fuer MT-2", () => {
    const sql = buildMigrationSql({
      stufen_lookup: {},
      worum_es_geht: {},
      hausaufgaben_lookup: {},
    });
    expect(sql).toContain("'[]'::jsonb");
    expect(sql).toContain("TODO MT-2");
  });
});
