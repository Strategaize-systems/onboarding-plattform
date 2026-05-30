#!/usr/bin/env node
// V8 SLC-150 + SLC-151 MT-2/MT-3 — Visual-Smoke-Skript fuer
// Mandanten-Report-V2-Renderer (Pages 1-13 aktuell).
//
// Aufruf-Pfad: `npx vite-node scripts/spike-v8-renderer-smoke.ts`
// Output: `temp/v8-mandanten-report-phase-a-smoke-v4.pdf`
//
// Test-Fixture: SUI=44 ("Teil-Reife", amber) mit asymmetrischem 9-Modul-
// Score-Profil. Mandant "Mueller Praezisionstechnik GmbH" analog
// MANDANTEN_REPORT_PROTOTYP.html.
//
// SLC-151 MT-2/MT-3: Template-Fixture wird inline gebaut (stufen_lookup +
// worum_es_geht + hausaufgaben_lookup + blocks). Reicht fuer Smoke, ist
// kein 1:1-Replay der Migration-102-Texte. Live-Smoke gegen DB-Template
// kommt in MT-7 / SLC-152.

import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";

import { renderMandantenReportV2Pdf } from "../src/lib/pdf/mandanten-report-v2";
import type { RendererInput } from "../src/lib/pdf/mandanten-report-v2";
import type {
  HausaufgabeItem,
  ModulKey,
  V8ReportSnapshot,
  V8StufenLookup,
  V8Template,
} from "../src/lib/diagnose/types";

const MODUL_KEYS: ModulKey[] = [
  "m1",
  "m2",
  "m3",
  "m4",
  "m5",
  "m6",
  "m7",
  "m8",
  "m9",
];

const MOCK_HAUSAUFGABEN: HausaufgabeItem[] = [
  {
    frage_id: "M0.4",
    frage_text: "Persoenliche Buergschaften nicht uebertragbar",
    status: "nein",
  },
  {
    frage_id: "M0.3",
    frage_text: "Schluessel-Mitarbeiter-Vertraege veraltet",
    status: "teilweise",
  },
  {
    frage_id: "M0.2",
    frage_text: "Markenrecht privat angemeldet",
    status: "teilweise",
  },
];

const MOCK_SNAPSHOT: V8ReportSnapshot = {
  schemaVersion: 1,
  finalizedAt: "2026-05-15T14:30:00Z",
  moduleScores: {
    m1: 8,
    m2: 2,
    m3: 5,
    m4: 2,
    m5: 9,
    m6: 3,
    m7: 7,
    m8: 4,
    m9: 6,
  },
  sui: 44, // entspricht Prototyp-Vorlage
  classification: {
    kind: "teil_reife",
    color: "amber",
    label: "Teil-Reife",
    meaning:
      "Erste Substanz da, aber wesentliche Luecken. 6-12 Monate gezielte Verbesserung in den Schwach-Modulen.",
  },
  stufenMapping: { m1: 4, m2: 2, m3: 3, m4: 2, m5: 5, m6: 2, m7: 4, m8: 3, m9: 3 },
  hausaufgaben: MOCK_HAUSAUFGABEN,
  reflexionen: [],
  hebel: [],
};

const MOCK_MODULE_NAMES: Record<ModulKey, string> = {
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
      s1: {
        was_es_bedeutet: `Modul ${key.toUpperCase()} ist heute auf Stufe 1 — kritischer Befund mit deutlichem Handlungsbedarf in den naechsten Monaten.`,
        unsere_empfehlung: `Erste strukturelle Schritte fuer ${key.toUpperCase()} jetzt anstossen — Inhaber-Stunden konsequent in den Hebel-Bereich verlagern.`,
      },
      s2: {
        was_es_bedeutet: `Erste Ansaetze sichtbar, aber wesentliche Themen fehlen. Im Folgegespraech praezisieren wir die 2-3 wichtigsten Hebel fuer ${key.toUpperCase()}.`,
        unsere_empfehlung: `Substanz aufbauen — die naechsten 6 Monate koennen ${key.toUpperCase()} entscheidend nach vorne bringen.`,
      },
      s3: {
        was_es_bedeutet: `Teilweise etabliert, aber noch nicht belastbar. Bei einer Uebergabe waere ${key.toUpperCase()} noch ein Diskussionsthema mit dem Kaeufer.`,
        unsere_empfehlung: `Restliche Luecken in ${key.toUpperCase()} systematisch schliessen — wir empfehlen Quartals-Reviews mit fixem Owner.`,
      },
      s4: {
        was_es_bedeutet: `Weitgehend etabliert — ${key.toUpperCase()} ist eine Staerke Ihrer Firma und wird bei einer Uebergabe als positives Signal wahrgenommen.`,
        unsere_empfehlung: `Niveau halten — ${key.toUpperCase()} braucht jetzt kein neues Projekt, sondern Pflege und Routine.`,
      },
      s5: {
        was_es_bedeutet: `Vollstaendig etabliert und belastbar — ${key.toUpperCase()} laeuft auch ohne Inhaber-Einsatz stabil weiter.`,
        unsere_empfehlung: `Vorbild-Status — die hier etablierten Routinen koennen ein Muster fuer andere Module sein.`,
      },
    };
  }
  return lookup as V8StufenLookup;
}

function makeWorumEsGeht(): Record<ModulKey, string> {
  const m: Partial<Record<ModulKey, string>> = {};
  for (const key of MODUL_KEYS) {
    m[key] =
      `Worum es in Modul ${key.toUpperCase()} (${MOCK_MODULE_NAMES[key]}) geht: Die Faehigkeit, diesen Geschaeftsbereich auch ohne Inhaber wiederholbar zu betreiben — von anderen Menschen, in anderen Situationen, ohne Genie-Abhaengigkeit.`;
  }
  return m as Record<ModulKey, string>;
}

const MOCK_TEMPLATE: V8Template = {
  slug: "exit-readiness-teaser-v1",
  version: 1,
  name: "Exit-Readiness-Teaser V1",
  description: "Mandanten-Report-Template",
  metadata: {
    usage_kind: "mandanten_report_teaser_v1",
    scoring_kind: "sui_weighted",
    report_renderer: "mandanten_report_v2",
    gewichtung: { m1: 1, m2: 1, m3: 1, m4: 1, m5: 1, m6: 1, m7: 1, m8: 1, m9: 2 },
    stufen_lookup: makeStufenLookup(),
    worum_es_geht: makeWorumEsGeht(),
    hausaufgaben_lookup: {
      "M0.1": {
        nein: "Anwalt-Mandat fuer Vertrags-Inventur in den naechsten 30 Tagen, 12-18 Monate Bearbeitungs-Zeitraum einplanen.",
        teilweise:
          "Top-20-Vertraege in 90 Tagen durchgehen, abgelaufene Klauseln aktualisieren.",
      },
      "M0.2": {
        nein: "IP-Anwalt-Mandat in den naechsten 30 Tagen anstossen, vollstaendige Uebertragung in 6-12 Monaten — mit steuerlicher Begleitung.",
        teilweise:
          "Marken/Patente/Domains-Inventur in den naechsten 6 Monaten, ueberschreibbare Positionen erfassen.",
      },
      "M0.3": {
        nein: "Anwalt-Vorlagen erstellen lassen, Top-5-Positionen in 12 Monaten neu aufsetzen.",
        teilweise:
          "3-5 Schluessel-Mitarbeiter pruefen, Klauseln in den naechsten 90 Tagen aktualisieren.",
      },
      "M0.4": {
        nein: "Bank-Termin in den naechsten 30 Tagen, Reduktions-Plan ueber 12-24 Monate, Umstellung auf gewerbliche Sicherheiten.",
        teilweise:
          "Buergschaften-Inventur mit der Bank in 3 Monaten, ueberpruefen welche reduziert werden koennen.",
      },
      "M0.5": {
        nein: "Compliance-Beratungs-Termin in den naechsten 60 Tagen, 12-Monats-Hausaufgaben-Plan parallel zu rechtlichen Themen.",
        teilweise:
          "Compliance-Aufraeum-Termin in 6 Monaten, Datenschutz-Konzept + Branchen-Vorgaben aktualisieren.",
      },
    },
  },
  blocks: MODUL_KEYS.map((key) => ({
    modul_id: key.toUpperCase(),
    name: MOCK_MODULE_NAMES[key],
    answer_schema_kind: "reife_skala_5",
    questions: [],
  })),
};

const INPUT: RendererInput = {
  snapshot: MOCK_SNAPSHOT,
  mandant: {
    name: "Mueller Praezisionstechnik GmbH",
    datum: "2026-05-15",
    branche: "Maschinenbau",
    umsatz: "35 Mio EUR",
  },
  stb: {
    firma: "StB Wagner & Partner",
    standort: "Duesseldorf",
  },
  moduleNames: MOCK_MODULE_NAMES,
  template: MOCK_TEMPLATE,
};

const OUTPUT_PATH = resolve(__dirname, "..", "temp", "v8-mandanten-report-phase-a-smoke-v4.pdf");

async function main() {
  console.log("[smoke] Rendering V8 Mandanten-Report-V2 Phase-A PDF...");
  const start = Date.now();
  const buffer = await renderMandantenReportV2Pdf(INPUT);
  const renderMs = Date.now() - start;

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, buffer);

  const stats = statSync(OUTPUT_PATH);
  const kb = (stats.size / 1024).toFixed(1);
  console.log(`[smoke] PDF written: ${OUTPUT_PATH}`);
  console.log(`[smoke] Size: ${kb} KB (${stats.size} bytes)`);
  console.log(`[smoke] Render time: ${renderMs} ms`);
  console.log("");
  console.log("[smoke] Founder-Verdict checklist:");
  console.log("  Page 1  (Cover):         Fraunces Hero + Mandant-Card + Footer");
  console.log("  Page 2  (SUI-Hero):      Score 44/100 + Teil-Reife Badge (amber)");
  console.log("  Page 3  (Modul-Profil):  Wheel + 3x3 Legende");
  console.log("  Page 4..12 (Modul-Pages): m1..m9 mit fokussiertem Wheel + 3 Text-Sektionen");
  console.log("  Page 13 (Hausaufgaben):   3 Cards (1 nein, 2 teilweise) + Footer");
  console.log("");
  console.log("[smoke] Compare against:");
  console.log("  c:/strategaize/strategaize-dev-system/docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html");
}

main().catch((err) => {
  console.error("[smoke] FAIL:", err);
  process.exit(1);
});
