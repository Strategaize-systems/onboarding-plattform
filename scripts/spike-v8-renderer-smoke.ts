#!/usr/bin/env node
// V8 SLC-150 MT-2..MT-7 — Visual-Smoke-Skript fuer vollstaendigen
// Mandanten-Report-V2-Renderer.
//
// Aufruf-Pfad: `npx vite-node scripts/spike-v8-renderer-smoke.ts`
// Output: `temp/v8-mandanten-report-phase-a-smoke.pdf` (3 Seiten A4)
//
// Test-Fixture: SUI=44 ("Teil-Reife", amber) mit asymmetrischem 9-Modul-
// Score-Profil. Mandant "Mueller Praezisionstechnik GmbH" analog
// MANDANTEN_REPORT_PROTOTYP.html. Founder-Verdict-Pfad nach MT-5 fuer
// Pages 1-3 vs. Master.

import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";

import { renderMandantenReportV2Pdf } from "../src/lib/pdf/mandanten-report-v2";
import type { RendererInput } from "../src/lib/pdf/mandanten-report-v2";
import type { V8ReportSnapshot } from "../src/lib/diagnose/types";

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
  hausaufgaben: [],
  reflexionen: [],
  hebel: [],
};

const MOCK_MODULE_NAMES = {
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
};

const OUTPUT_PATH = resolve(__dirname, "..", "temp", "v8-mandanten-report-phase-a-smoke.pdf");

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
  console.log("  Page 1 (Cover): Fraunces Hero + Mandant-Card + Footer");
  console.log("  Page 2 (SUI-Hero): Score 44/100 + Teil-Reife Badge (amber)");
  console.log("  Page 3 (Modul-Profil): Wheel + 3x3 Legende");
  console.log("");
  console.log("[smoke] Compare against:");
  console.log("  c:/strategaize/strategaize-dev-system/docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html");
}

main().catch((err) => {
  console.error("[smoke] FAIL:", err);
  process.exit(1);
});
