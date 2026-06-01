// V8.1 SLC-162 MT-6 + SLC-163 MT-9 — Smoke-Test fuer V8OutroSection.
//
// Verifiziert Component-Rendering ohne Errors + Presence der 4 Bloecke
// via renderToString (vermeidet @testing-library/react als neue Dep).
//
// Mockt ./actions damit der Test-Bootstrap nicht supabase-admin laedt
// (feedback_vitest_split_pure_logic_from_db_adapter / IMP-880).

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

vi.mock("../actions", () => ({
  triggerStrategaizeFreigabe: vi.fn(),
  sendDiagnoseReportByEmail: vi.fn(),
}));

import {
  V8OutroSection,
  V8_OUTRO_WEB_CTA_PLACEHOLDER_URL,
} from "../V8OutroSection";
import type { HebelItem } from "@/lib/diagnose/types";

const FIXTURE_HEBEL: HebelItem[] = [
  {
    modul_id: "m4",
    modul_name: "Finanzen & Controlling",
    score: 2,
    stufe: 2,
    empfehlung: "Wir holen die Finanz-Transparenz dahin, wo Uebergabefaehigkeit beginnt.",
  },
  {
    modul_id: "m2",
    modul_name: "Fuehrung & Nachfolge",
    score: 2,
    stufe: 2,
    empfehlung: "Wir bauen Fuehrung schrittweise unabhaengig vom Inhaber auf.",
  },
  {
    modul_id: "m6",
    modul_name: "Produkt & Innovation",
    score: 3,
    stufe: 2,
    empfehlung: "Wir staerken Produkt-Klarheit und Innovationspipeline.",
  },
];

/** React-renderToString fuegt HTML-Comments zwischen JSX-Interpolations ein. */
function stripReactBoundaries(html: string): string {
  return html.replace(/<!--\s*-->/g, "");
}

describe("V8OutroSection", () => {
  it("renders 4 blocks (Vorstellung + 3 Cards + Video + CTA) to HTML string", () => {
    const html = stripReactBoundaries(
      renderToString(
        React.createElement(V8OutroSection, { hebel: FIXTURE_HEBEL }),
      ),
    );

    // Block 1: Strategaize-Vorstellung
    expect(html).toContain("Ueber Strategaize");
    expect(html).toContain("Wir holen Sie ab");

    // Block 2: 3 Verkaufs-Cards
    expect(html).toContain("Drei Bewegungen");
    expect(html).toContain("Finanzen &amp; Controlling");
    expect(html).toContain("Fuehrung &amp; Nachfolge");
    expect(html).toContain("Produkt &amp; Innovation");
    expect(html).toContain("Aktuelle Stufe: 2/5");

    // Block 3: Video-Box
    expect(html).toContain("Wie wir arbeiten");
    expect(html).toContain("Video folgt in Kuerze");

    // Block 4: CTA via form action
    expect(html).toContain("Naechster Schritt");
    expect(html).toContain("Mit Strategaize sprechen");
    expect(html).toContain("innerhalb von 2 Werktagen");
    // Form submit-button (SLC-163 MT-9 — kein Link mehr)
    expect(html).toMatch(/<form[^>]*>[\s\S]*?<button[^>]*type="submit"/);
  });

  it("CTA-button is disabled when no captureSessionId provided", () => {
    const html = renderToString(
      React.createElement(V8OutroSection, { hebel: FIXTURE_HEBEL }),
    );
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it("CTA-Magic-Link-Placeholder constant remains exported for compatibility", () => {
    expect(V8_OUTRO_WEB_CTA_PLACEHOLDER_URL).toBe(
      "#cta-magic-link-token-replaced-in-slc163",
    );
  });

  it("throws when hebel.length !== 3 (V8.1-Outro invariant)", () => {
    expect(() => {
      renderToString(
        React.createElement(V8OutroSection, {
          hebel: [FIXTURE_HEBEL[0]],
        }),
      );
    }).toThrow(/expected exactly 3 hebel/);
  });

  it("touch-target: CTA-Button hat min-h 44px (Style-Guide V2)", () => {
    const html = renderToString(
      React.createElement(V8OutroSection, { hebel: FIXTURE_HEBEL }),
    );
    expect(html).toMatch(/min-h-\[44px\]/);
  });
});
