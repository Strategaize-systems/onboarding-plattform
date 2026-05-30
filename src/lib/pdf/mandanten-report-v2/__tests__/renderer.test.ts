// V8 SLC-162 MT-5 — Smoke-Render-Test fuer renderMandantenReportV2Pdf
// nach CtaPage → OutroPage Replacement.
//
// Verifiziert AC-SLC-162-1 (PDF-Output exakt 17 Seiten), AC-SLC-162-3
// (kein Doppel-CTA, kein V8.0-CtaPage-Wording im V8.1-Pfad) und
// AC-SLC-162-9 (V8.0-Pages 1-15 unveraendert).
//
// Test laeuft ohne LLM-Augmentation (deterministischer Fallback-Pfad).
// LLM-augmentierter Pfad wird via Mock-Bedrock-Caller separat geprueft.

import { describe, it, expect } from "vitest";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

import { renderMandantenReportV2Pdf } from "../renderer";
import type { RendererInput } from "../types";
import type {
  HebelItem,
  ModulKey,
  V8ReportSnapshot,
  V8StufenLookup,
  V8Template,
} from "@/lib/diagnose/types";

const MODUL_KEYS: ModulKey[] = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"];

const VALID_HEBEL: HebelItem[] = [
  {
    modul_id: "m4",
    modul_name: "Finanzen & Controlling",
    score: 2,
    stufe: 2,
    empfehlung: "Modul-4 deterministische V8.0-Empfehlung — wir holen die Finanz-Transparenz dahin, wo Uebergabefaehigkeit beginnt.",
  },
  {
    modul_id: "m2",
    modul_name: "Fuehrung & Nachfolge",
    score: 2,
    stufe: 2,
    empfehlung: "Modul-2 deterministische V8.0-Empfehlung — wir bauen Fuehrung schrittweise unabhaengig vom Inhaber auf.",
  },
  {
    modul_id: "m6",
    modul_name: "Produkt & Innovation",
    score: 3,
    stufe: 2,
    empfehlung: "Modul-6 deterministische V8.0-Empfehlung — wir staerken Produkt-Klarheit und Innovationspipeline.",
  },
];

const VALID_SNAPSHOT: V8ReportSnapshot = {
  schemaVersion: 1,
  finalizedAt: "2026-05-30T08:37:00Z",
  moduleScores: { m1: 6, m2: 2, m3: 5, m4: 2, m5: 6, m6: 3, m7: 5, m8: 4, m9: 5 },
  sui: 42,
  classification: {
    kind: "teil_reife",
    color: "amber",
    label: "Teil-Reife",
    meaning: "Substanz vorhanden, mehrere zentrale Punkte offen.",
  },
  stufenMapping: { m1: 3, m2: 2, m3: 3, m4: 2, m5: 3, m6: 2, m7: 3, m8: 2, m9: 3 },
  hausaufgaben: [],
  reflexionen: [],
  hebel: VALID_HEBEL,
};

const VALID_MODULE_NAMES: Record<ModulKey, string> = {
  m1: "Strategie & Vision",
  m2: "Fuehrung & Nachfolge",
  m3: "Organisation & Prozesse",
  m4: "Finanzen & Controlling",
  m5: "Vertrieb & Kunden",
  m6: "Produkt & Innovation",
  m7: "Personal & Kultur",
  m8: "IT & Daten",
  m9: "Recht & Compliance",
};

function makeStufenLookup(): V8StufenLookup {
  const lookup: Partial<V8StufenLookup> = {};
  for (const key of MODUL_KEYS) {
    lookup[key] = {
      s1: { was_es_bedeutet: `${key}-s1-bedeutet`, unsere_empfehlung: `${key}-s1-empfehlung` },
      s2: { was_es_bedeutet: `${key}-s2-bedeutet`, unsere_empfehlung: `${key}-s2-empfehlung` },
      s3: { was_es_bedeutet: `${key}-s3-bedeutet`, unsere_empfehlung: `${key}-s3-empfehlung` },
      s4: { was_es_bedeutet: `${key}-s4-bedeutet`, unsere_empfehlung: `${key}-s4-empfehlung` },
      s5: { was_es_bedeutet: `${key}-s5-bedeutet`, unsere_empfehlung: `${key}-s5-empfehlung` },
    };
  }
  return lookup as V8StufenLookup;
}

function makeWorumEsGeht(): Record<ModulKey, string> {
  const m: Partial<Record<ModulKey, string>> = {};
  for (const key of MODUL_KEYS) m[key] = `${key} worum es geht`;
  return m as Record<ModulKey, string>;
}

const VALID_TEMPLATE: V8Template = {
  slug: "exit-readiness-teaser-v1",
  version: 1,
  name: "Mock",
  description: "Mock",
  metadata: {
    usage_kind: "mandanten_report_teaser_v1",
    scoring_kind: "sui_weighted",
    report_renderer: "mandanten_report_v2",
    gewichtung: { m1: 1, m2: 1, m3: 1, m4: 1, m5: 1, m6: 1, m7: 1, m8: 1, m9: 2 },
    stufen_lookup: makeStufenLookup(),
    worum_es_geht: makeWorumEsGeht(),
    hausaufgaben_lookup: {
      "M0.1": { nein: "Tun bei nein 1", teilweise: "Tun bei teilweise 1" },
      "M0.2": { nein: "Tun bei nein 2", teilweise: "Tun bei teilweise 2" },
      "M0.3": { nein: "Tun bei nein 3", teilweise: "Tun bei teilweise 3" },
      "M0.4": { nein: "Tun bei nein 4", teilweise: "Tun bei teilweise 4" },
      "M0.5": { nein: "Tun bei nein 5", teilweise: "Tun bei teilweise 5" },
    },
  },
  blocks: MODUL_KEYS.map((key) => ({
    modul_id: key.toUpperCase(),
    name: VALID_MODULE_NAMES[key],
    answer_schema_kind: "reife_skala_5",
    questions: [],
  })),
};

const VALID_INPUT: RendererInput = {
  snapshot: VALID_SNAPSHOT,
  mandant: { name: "Mueller Praezisionstechnik GmbH", datum: "2026-05-30" },
  moduleNames: VALID_MODULE_NAMES,
  template: VALID_TEMPLATE,
};

function normalize(text: string): string {
  const merged = text.replace(/\b[A-Z](?: [A-Z])+\b/g, (m) => m.replace(/ /g, ""));
  return merged.replace(/\s+/g, " ");
}

describe("renderMandantenReportV2Pdf — SLC-162 MT-5 OutroPage replaces CtaPage", () => {
  it("produces exactly 17 pages (V8.0 Pages 1-15 + V8.1 Outro 16-17)", async () => {
    const buf = await renderMandantenReportV2Pdf(VALID_INPUT);

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const pdfText = buf.toString("latin1");
    const pageMatches = pdfText.match(/\/Type\s*\/Page(?!s)/g) || [];
    expect(pageMatches.length).toBe(17);
  }, 30_000);

  it("renders V8.1-Outro wording on Pages 16-17 (no V8.0-CtaPage duplicate)", async () => {
    const buf = await renderMandantenReportV2Pdf(VALID_INPUT);
    const parsed = await pdfParse(buf);
    const text = normalize(parsed.text);

    // V8.1-Outro markers
    expect(text).toContain("UEBER STRATEGAIZE");
    expect(text).toContain("Wir holen Sie ab");
    expect(text).toContain("Drei Bewegungen");
    expect(text).toContain("MIT STRATEGAIZE SPRECHEN");
    expect(text).toContain("Uebergabefaehigkeits-Diagnose V8.1");
    // 3 augmented hebel-cards
    expect(text).toContain("Finanzen & Controlling");
    expect(text).toContain("Fuehrung & Nachfolge");
    expect(text).toContain("Produkt & Innovation");

    // NO V8.0-CtaPage-specific Wording (no Doppel-CTA). Hinweis: "Folgegespraech"
    // als Wort erscheint auf V8.0-Modul-Pages ("UNSERE EMPFEHLUNG FUER DAS
    // FOLGEGESPRAECH") + Hebel-Page ("ersten Schritten im Folgegespraech") —
    // das ist normales V8.0-Wording. Hier blacklisten wir nur die CtaPage-
    // exklusiven Phrasen.
    expect(text).not.toContain("Bereit fuer das Folgegespraech");
    expect(text).not.toContain("Diese Diagnose ist ein Anfang");
    expect(text).not.toContain("60-Min-Folgegespraech");
    // Strategaize-Footer zeigt V8.1, nicht V8.0
    expect(text).not.toContain("Uebergabefaehigkeits-Diagnose V8.0");
  }, 30_000);

  it("preserves V8.0 Pages 1-15 content unchanged (Cover + SUI + Modul + Reflexion)", async () => {
    const buf = await renderMandantenReportV2Pdf(VALID_INPUT);
    const parsed = await pdfParse(buf);
    const text = normalize(parsed.text);

    // Cover-Page Marker
    expect(text).toContain("Mueller Praezisionstechnik GmbH");
    // SUI-Hero-Page (Klassifizierung)
    expect(text).toContain("Teil-Reife");
    // Hebel-Page Page 14 (V8.0)
    expect(text).toContain("Drei Hebel fuer die naechsten 12 Monate");
  }, 30_000);

  it("uses deterministic fallback (snapshot.hebel.empfehlung 1:1) when augmentConfig not provided", async () => {
    const buf = await renderMandantenReportV2Pdf(VALID_INPUT);
    const parsed = await pdfParse(buf);
    const text = normalize(parsed.text);

    // V8.0-Empfehlungs-Text aus snapshot.hebel[i].empfehlung soll in
    // den Outro-Cards erscheinen (deterministic fallback).
    expect(text).toContain("Modul-4 deterministische V8.0-Empfehlung");
    expect(text).toContain("Modul-2 deterministische V8.0-Empfehlung");
    expect(text).toContain("Modul-6 deterministische V8.0-Empfehlung");
  }, 30_000);
});
