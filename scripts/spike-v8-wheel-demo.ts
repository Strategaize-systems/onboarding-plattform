#!/usr/bin/env node
// V8 SLC-150 MT-1 — PDF-Engine-Spike fuer @react-pdf Wheel-Render.
//
// Standalone-Skript fuer Founder-Visual-Verdict per DEC-157 Spike-Klausel:
// rendert eine einzelne A4-Seite mit dem Wheel-Component aus
// `src/lib/pdf/mandanten-report-v2/wheel.tsx`, schreibt das PDF lokal in
// `temp/v8-spike-wheel.pdf` und gibt Pfad + Dateigroesse aus.
//
// Founder oeffnet das PDF und vergleicht visuell gegen
// `docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html` Page 3
// (Modul-Profil-Wheel).
//
// Pivot-Trigger (DEC-157):
//   - PASS: Wheel rendert sauber, Sektoren visuell korrekt, Farben passen
//           -> Plan A continue (MT-2..MT-7 mit @react-pdf weitermachen)
//   - FAIL: @react-pdf kann pathD nicht zuverlaessig zeichnen
//           (Parse-Fehler, broken Sektoren, fundamentale Layout-Fehler)
//           -> Pivot zu Plan B (Hybrid satori+sharp), siehe Slice-File
//           Spike-Klausel-Sektion
//
// Run: npx vite-node scripts/spike-v8-wheel-demo.ts

import React from "react";
import { Document, Page, View, Text, renderToBuffer } from "@react-pdf/renderer";
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";

import { Wheel } from "../src/lib/pdf/mandanten-report-v2/wheel";
import { COLOR, PAGE } from "../src/lib/pdf/mandanten-report-v2/theme";
import type { ModuleScores } from "../src/lib/diagnose/types";

// Asymmetrisches Mock-Score-Profil: alle 3 Klassifizierungs-Farben sichtbar.
// rot (score < 4): m2=2, m4=2, m6=3
// amber (4 <= score < 7): m3=5, m8=4, m9=6
// gruen (score >= 7): m1=8, m5=9, m7=7
const MOCK_SCORES: ModuleScores = {
  m1: 8,
  m2: 2,
  m3: 5,
  m4: 2,
  m5: 9,
  m6: 3,
  m7: 7,
  m8: 4,
  m9: 6,
};

const OUTPUT_PATH = resolve(__dirname, "..", "temp", "v8-spike-wheel.pdf");

interface SpikeDocumentProps {
  scores: ModuleScores;
}

function SpikeDocument({ scores }: SpikeDocumentProps) {
  return React.createElement(
    Document,
    {
      title: "V8 SLC-150 MT-1 Wheel-Spike",
      author: "StrategAIze",
      creator: "V8 Renderer Spike",
    },
    React.createElement(
      Page,
      {
        size: "A4",
        style: {
          padding: PAGE.marginPt,
          fontFamily: "Helvetica",
          backgroundColor: COLOR.bgWhite,
          color: COLOR.textDark,
        },
      },
      React.createElement(
        Text,
        { style: { fontSize: 22, fontWeight: "bold", marginBottom: 4 } },
        "Spike — V8 Mandanten-Report-Wheel",
      ),
      React.createElement(
        Text,
        { style: { fontSize: 10, color: COLOR.textMuted, marginBottom: 18 } },
        "Founder-Visual-Vergleich gegen MANDANTEN_REPORT_PROTOTYP.html Page 3",
      ),
      // Wheel 1: alle 9 Module sichtbar (Modul-Profil-Page Phase A)
      React.createElement(
        View,
        { style: { alignItems: "center", marginBottom: 18 } },
        React.createElement(
          Text,
          { style: { fontSize: 12, fontWeight: "bold", marginBottom: 6 } },
          "Variante 1: Alle 9 Module sichtbar (Page 3 Modul-Profil)",
        ),
        React.createElement(Wheel, { moduleScores: scores, size: 280 }),
      ),
      // Wheel 2: focusIdx=4 (m5 fokussiert) — Phase-B Modul-Page-Variante
      React.createElement(
        View,
        { style: { alignItems: "center" } },
        React.createElement(
          Text,
          { style: { fontSize: 12, fontWeight: "bold", marginBottom: 6 } },
          "Variante 2: focusIdx=4 (m5 fokussiert, andere gedimmt)",
        ),
        React.createElement(Wheel, { moduleScores: scores, size: 220, focusIdx: 4 }),
      ),
      // Score-Liste als Validierung der Wheel-Farben
      React.createElement(
        View,
        { style: { marginTop: 18, fontSize: 9, color: COLOR.textMuted } },
        React.createElement(Text, null, `Score-Profil (asymmetrisch):`),
        ...(Object.entries(scores) as [keyof ModuleScores, number][]).map(
          ([key, score]) =>
            React.createElement(
              Text,
              { key, style: { marginTop: 2 } },
              `${key.toUpperCase()}: ${score}/10`,
            ),
        ),
      ),
    ),
  );
}

async function main() {
  console.log("[spike] Rendering V8 wheel demo PDF...");
  const element = SpikeDocument({ scores: MOCK_SCORES });
  // @ts-expect-error — renderToBuffer types expect a DocumentElement; runtime accepts our wrapper
  const buffer = await renderToBuffer(element);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, buffer);

  const stats = statSync(OUTPUT_PATH);
  const kb = (stats.size / 1024).toFixed(1);
  console.log(`[spike] PDF written: ${OUTPUT_PATH}`);
  console.log(`[spike] Size: ${kb} KB (${stats.size} bytes)`);
  console.log("");
  console.log("[spike] Next steps for Founder-Visual-Verdict:");
  console.log("  1. Open PDF in PDF viewer");
  console.log("  2. Compare against:");
  console.log("     c:/strategaize/strategaize-dev-system/docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html");
  console.log("     (specifically Page 3 — Modul-Profil-Wheel)");
  console.log("  3. Decide per DEC-157 Spike-Klausel:");
  console.log("     - PASS (Wheel renders cleanly) -> Plan A continue with MT-2..MT-7");
  console.log("     - FAIL (broken paths / fundamental layout error) -> Pivot to Plan B");
}

main().catch((err) => {
  console.error("[spike] FAIL:", err);
  process.exit(1);
});
