// SLC-051 MT-1 — Tests fuer pickActiveId (pure Auswahl-Logik des Scroll-Spy).
//
// Die DOM-Integration des Hooks (IntersectionObserver-Verdrahtung +
// useEffect-Cleanup) wird im Browser-Smoke verifiziert (Pflicht-Gate
// 1280×800/375×667). Hier nur die Auswahl-Logik.

import { describe, it, expect } from "vitest";
import { pickActiveId, type ScrollSpyEntry } from "../use-scroll-spy";

function entry(
  id: string,
  documentOrder: number,
  isIntersecting: boolean,
  intersectionRatio = isIntersecting ? 0.5 : 0,
): ScrollSpyEntry {
  return { id, documentOrder, isIntersecting, intersectionRatio };
}

describe("pickActiveId", () => {
  it("returns null wenn kein Heading sichtbar ist", () => {
    const entries = [
      entry("h-1", 0, false),
      entry("h-2", 1, false),
      entry("h-3", 2, false),
    ];
    expect(pickActiveId(entries)).toBeNull();
  });

  it("returns die ID wenn genau ein Heading sichtbar ist", () => {
    const entries = [
      entry("h-1", 0, false),
      entry("h-2", 1, true),
      entry("h-3", 2, false),
    ];
    expect(pickActiveId(entries)).toBe("h-2");
  });

  it("returns die oberste ID wenn mehrere Headings sichtbar sind (DOM-Order zaehlt)", () => {
    const entries = [
      entry("h-3", 2, true, 0.9),
      entry("h-1", 0, true, 0.3),
      entry("h-2", 1, true, 0.5),
    ];
    // Sichtbar sind h-1, h-2, h-3 — h-1 hat documentOrder=0, also gewinnt h-1
    // unabhaengig von intersectionRatio. Reading-Position-Akzent: oberer
    // Lese-Anker bestimmt die Active-Section.
    expect(pickActiveId(entries)).toBe("h-1");
  });

  it("ist robust bei leerem Eingabe-Array", () => {
    expect(pickActiveId([])).toBeNull();
  });
});
