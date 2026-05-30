// V8.1 SLC-162 MT-2 — Smoke + Snapshot-Tests fuer OutroPage Page 16.
//
// MT-2 verifiziert: 1-Page-Render mit Strategaize-Vorstellungs-Block (3
// Placeholder-Absaetze, MT-3 ersetzt) + 3 Verkaufs-Style-Cards mit
// LLM-augmentierten Texten + Akzent-Border-Bottom.
//
// MT-4 erweitert dieses Test-File um Page-17-Cases.

import { describe, it, expect } from "vitest";
import React from "react";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

import { OutroPage } from "../outro";
import "../../fonts"; // Fraunces + JetBrains Mono fuer @react-pdf
import type { AugmentOutput } from "@/lib/llm/v8-1-augmentation";
import type { RendererInput } from "../../types";
import type {
  V8ReportSnapshot,
  V8Template,
} from "@/lib/diagnose/types";

// ─── Fixture-Helpers ───

function makeAugmentedHebel(): AugmentOutput[] {
  return [
    {
      modulName: "Modul 4 — Operative Skalierbarkeit",
      modulId: 4,
      aktuelleStufe: 2,
      text: "Strategaize unterstuetzt dabei, die operative Skalierbarkeit substantiell zu staerken — gemeinsam mit dem Fuehrungsteam, ohne klassische Beraterlogik.",
      isLlmAugmented: true,
    },
    {
      modulName: "Modul 7 — Finanzielle Transparenz",
      modulId: 7,
      aktuelleStufe: 2,
      text: "Strategaize bringt die Finanz-Transparenz dahin, wo sie Uebergabefaehigkeit stuetzt — von monatlicher Kennzahlen-Klarheit bis zur belastbaren Mehrjahres-Planung.",
      isLlmAugmented: true,
    },
    {
      modulName: "Modul 2 — Vertrieb & Kunden",
      modulId: 2,
      aktuelleStufe: 3,
      text: "Strategaize hilft, Vertriebs-Reife und Kunden-Konzentration so zu entwickeln, dass Unternehmens-Wert unabhaengig vom Inhaber wird.",
      isLlmAugmented: true,
    },
  ];
}

function makeMinimalSnapshot(): V8ReportSnapshot {
  return {
    moduleScores: { m1: 5, m2: 5, m3: 5, m4: 5, m5: 5, m6: 5, m7: 5, m8: 5, m9: 5 },
    sui: 50,
    classification: { color: "amber", label: "Teil-Reife" },
    hebel: [],
    hausaufgaben: [],
    reflexionen: [],
    stufenMapping: { m1: 3, m2: 3, m3: 3, m4: 3, m5: 3, m6: 3, m7: 3, m8: 3, m9: 3 },
  } as unknown as V8ReportSnapshot;
}

function makeMinimalTemplate(): V8Template {
  return {
    blocks: [],
    metadata: {
      stufen_lookup: {},
      worum_es_geht: {},
    },
  } as unknown as V8Template;
}

function makeRendererInput(): RendererInput {
  return {
    snapshot: makeMinimalSnapshot(),
    mandant: {
      name: "Mustermann GmbH",
      datum: "2026-05-30",
    },
    moduleNames: {
      m1: "Modul 1",
      m2: "Modul 2",
      m3: "Modul 3",
      m4: "Modul 4",
      m5: "Modul 5",
      m6: "Modul 6",
      m7: "Modul 7",
      m8: "Modul 8",
      m9: "Modul 9",
    },
    template: makeMinimalTemplate(),
  };
}

// ─── Tests ───

describe("OutroPage Page 16 — Smoke-Render", () => {
  it("renders 1 Page (only Page 16, Page 17 kommt in MT-4) to valid PDF Buffer", async () => {
    const element = React.createElement(
      Document,
      {},
      React.createElement(OutroPage, {
        input: makeRendererInput(),
        augmentedHebel: makeAugmentedHebel(),
      }),
    );

    const buf = await renderToBuffer(element);

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // Page-Count = 1 via /Type /Page-Occurrences (vereinfacht). /Type /Pages
    // ist der Parent-Container, NICHT zaehlbar.
    const pdfText = buf.toString("latin1");
    const pageMatches = pdfText.match(/\/Type\s*\/Page(?!s)/g) || [];
    expect(pageMatches.length).toBe(1);
  }, 15_000);

  it("renders all 3 Modul-Namen + Stufe-Badges via pdf-parse text extraction", async () => {
    const element = React.createElement(
      Document,
      {},
      React.createElement(OutroPage, {
        input: makeRendererInput(),
        augmentedHebel: makeAugmentedHebel(),
      }),
    );

    const buf = await renderToBuffer(element);
    const parsed = await pdfParse(buf);
    const text = parsed.text;

    expect(text).toContain("UEBER STRATEGAIZE");
    expect(text).toContain("Wir holen Sie ab");
    expect(text).toContain("Drei Bewegungen");
    expect(text).toContain("Operative Skalierbarkeit");
    expect(text).toContain("Finanzielle Transparenz");
    expect(text).toContain("Vertrieb & Kunden");
    expect(text).toContain("AKTUELLE STUFE: 2/5");
    expect(text).toContain("AKTUELLE STUFE: 3/5");
  }, 15_000);
});
