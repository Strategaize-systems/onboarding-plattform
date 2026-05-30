// V8.1 SLC-162 MT-6 — Smoke-Test fuer V8OutroSection (Web-Bericht-Outro).
//
// Verifiziert Component-Rendering ohne Errors + Presence der 4 Bloecke
// via renderToString (vermeidet @testing-library/react als neue Dep).

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

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

    // Block 4: CTA
    expect(html).toContain("Naechster Schritt");
    expect(html).toContain("Mit Strategaize sprechen");
    expect(html).toContain("innerhalb von 2 Werktagen");
    // Magic-Link-Placeholder bis SLC-163
    expect(html).toContain(V8_OUTRO_WEB_CTA_PLACEHOLDER_URL);
  });

  it("CTA-Magic-Link defaults to SLC-163-placeholder", () => {
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
