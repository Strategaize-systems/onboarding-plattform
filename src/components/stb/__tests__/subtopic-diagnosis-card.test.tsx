// SLC-172 MT-3 — Smoke-Test fuer SubtopicDiagnosisCard via renderToString
// (vermeidet @testing-library/react als neue Dep; Pattern wie V8OutroSection-Test).

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { SubtopicDiagnosisCard } from "../SubtopicDiagnosisCard";
import type { DiagnosisSubtopic } from "@/workers/diagnosis/types";

const SUBTOPICS: DiagnosisSubtopic[] = [
  {
    key: "a1_selbststeuerung",
    name: "Eigene Kanzlei-Steuerung",
    fields: {
      ampel: "red",
      reifegrad: 3,
      ist_situation: "Zahlen werden nur sporadisch betrachtet.",
      empfehlung: "Monatliches Kanzlei-Reporting etablieren.",
      naechster_schritt: "BWA-Termin für die eigene Kanzlei ansetzen.",
    },
  },
  {
    key: "a2_erloesmix_marge",
    name: "Erlös-Mix & Marge",
    fields: {
      ampel: "green",
      reifegrad: 8,
      empfehlung: "Beibehalten.",
    },
  },
];

describe("SubtopicDiagnosisCard", () => {
  it("rendert Block-Titel, Ampel-Label, Reifegrad und Empfehlung", () => {
    // SSR fuegt zwischen statischem Text + interpoliertem Wert ein <!-- -->-Marker
    // ein ("Block <!-- -->A"). Fuer die Text-Asserts normalisieren.
    const html = renderToString(
      <SubtopicDiagnosisCard
        blockKey="A"
        blockIndex={0}
        blockTitle="Kanzlei-Steuerung & Geschäftsmodell"
        subtopics={SUBTOPICS}
      />
    ).replace(/<!-- -->/g, "");
    expect(html).toContain("Block A");
    expect(html).toContain("Kanzlei-Steuerung &amp; Geschäftsmodell");
    expect(html).toContain("Eigene Kanzlei-Steuerung");
    expect(html).toContain("Rot");
    expect(html).toContain("Grün");
    expect(html).toContain("3/10");
    expect(html).toContain("Monatliches Kanzlei-Reporting etablieren.");
    expect(html).toContain("BWA-Termin");
  });

  it("zeigt 'nicht bewertet' bei fehlender/ungueltiger Ampel", () => {
    const html = renderToString(
      <SubtopicDiagnosisCard
        blockKey="G"
        blockIndex={6}
        blockTitle="Zukunfts-Standort"
        subtopics={[
          { key: "g1", name: "Zukunftsstandort", fields: { ampel: "n/a" } },
        ]}
      />
    );
    expect(html).toContain("nicht bewertet");
  });

  it("rendert leere-Subtopics-Hinweis ohne Crash", () => {
    const html = renderToString(
      <SubtopicDiagnosisCard
        blockKey="B"
        blockIndex={1}
        blockTitle="Personal"
        subtopics={[]}
      />
    );
    expect(html).toContain("Keine Unterthema-Diagnosen");
  });
});
