// V8 SLC-150 MT-6 — Vitest fuer computeWheelPathsV2 (Annulus-Sectoren).
// Verifiziert: 9-Sector-Output, Score->Stufe-Color-Mapping, Annulus-Geometrie
// (Inner=90, Outer=90+score*16.5), focusIdx-Dim-Verhalten (Pastel via lightenColor),
// M9-Label-Suffix "★".

import { describe, it, expect } from "vitest";

import type { ModuleScores } from "@/lib/diagnose/types";
import { computeWheelPathsV2 } from "../wheel-paths-v2";
import { COLOR, WHEEL_V2 } from "../theme";

const allFives: ModuleScores = {
  m1: 5,
  m2: 5,
  m3: 5,
  m4: 5,
  m5: 5,
  m6: 5,
  m7: 5,
  m8: 5,
  m9: 5,
};

// asymmetrisch — eine Score pro Stufen-Klasse
const fiveStufenSpread: ModuleScores = {
  m1: 0, // Stufe 1 (kritisch)
  m2: 2, // Stufe 2 (Ansaetze)
  m3: 5, // Stufe 3 (teilweise)
  m4: 8, // Stufe 4 (etabliert)
  m5: 10, // Stufe 5 (belastbar)
  m6: 0,
  m7: 5,
  m8: 8,
  m9: 10,
};

describe("computeWheelPathsV2 — Struktur", () => {
  it("returns 9 sector entries", () => {
    const paths = computeWheelPathsV2(allFives);
    expect(paths).toHaveLength(9);
  });

  it("preserves modulId-Reihenfolge m1..m9", () => {
    const paths = computeWheelPathsV2(allFives);
    expect(paths.map((p) => p.modulId)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
      "m8",
      "m9",
    ]);
  });

  it("pathD has SVG-Arc-Pattern (M..A..L..A..Z)", () => {
    const paths = computeWheelPathsV2(allFives);
    paths.forEach((p) => {
      expect(p.pathD).toMatch(/^M /);
      expect(p.pathD).toContain(" A ");
      expect(p.pathD).toContain(" L ");
      expect(p.pathD.trim().endsWith("Z")).toBe(true);
    });
  });

  it("scoreText is integer string ohne Dezimalstellen", () => {
    const paths = computeWheelPathsV2(allFives);
    paths.forEach((p) => expect(p.scoreText).toBe("5"));
  });
});

describe("computeWheelPathsV2 — Stufen-Color-Mapping", () => {
  it("score 0 -> s1 (kritisch, danger #dc2626)", () => {
    const paths = computeWheelPathsV2(fiveStufenSpread);
    expect(paths[0]!.stufe).toBe(1);
    expect(paths[0]!.fillColor).toBe(COLOR.stufen.s1);
  });

  it("score 2 -> s2 (Ansaetze, warning #f59e0b)", () => {
    const paths = computeWheelPathsV2(fiveStufenSpread);
    expect(paths[1]!.stufe).toBe(2);
    expect(paths[1]!.fillColor).toBe(COLOR.stufen.s2);
  });

  it("score 5 -> s3 (teilweise, brand-primary #4454b8)", () => {
    const paths = computeWheelPathsV2(fiveStufenSpread);
    expect(paths[2]!.stufe).toBe(3);
    expect(paths[2]!.fillColor).toBe(COLOR.stufen.s3);
  });

  it("score 8 -> s4 (etabliert, brand-accent #4dcb8b)", () => {
    const paths = computeWheelPathsV2(fiveStufenSpread);
    expect(paths[3]!.stufe).toBe(4);
    expect(paths[3]!.fillColor).toBe(COLOR.stufen.s4);
  });

  it("score 10 -> s5 (belastbar, success #00a84f)", () => {
    const paths = computeWheelPathsV2(fiveStufenSpread);
    expect(paths[4]!.stufe).toBe(5);
    expect(paths[4]!.fillColor).toBe(COLOR.stufen.s5);
  });
});

describe("computeWheelPathsV2 — Annulus-Geometrie", () => {
  it("Inner-Radius ist konstant 90 (alle Sectoren teilen Inner-Hole)", () => {
    const paths = computeWheelPathsV2(fiveStufenSpread);
    // Inner-Arc-Radius in pathD ist Annulus-Inner: " A 90.00 90.00 ..."
    paths.forEach((p) => {
      expect(p.pathD).toContain(`A ${WHEEL_V2.innerRadius.toFixed(2)} ${WHEEL_V2.innerRadius.toFixed(2)}`);
    });
  });

  it("Outer-Radius linear 90 -> 255 per Score 0..10 (score=5 -> 172.5)", () => {
    const paths = computeWheelPathsV2(allFives);
    // 90 + (5/10) * (255-90) = 90 + 82.5 = 172.5
    paths.forEach((p) => {
      expect(p.pathD).toContain("A 172.50 172.50");
    });
  });

  it("Score 0 collabiert Outer auf Inner (90.00) — Sector unsichtbar", () => {
    const allZeros: ModuleScores = {
      m1: 0,
      m2: 0,
      m3: 0,
      m4: 0,
      m5: 0,
      m6: 0,
      m7: 0,
      m8: 0,
      m9: 0,
    };
    const paths = computeWheelPathsV2(allZeros);
    paths.forEach((p) => {
      // Beide Arc-Radien sind 90 (Outer = Inner) → degenerierter Sektor
      const matches = p.pathD.match(/A 90\.00 90\.00/g) ?? [];
      expect(matches.length).toBe(2);
    });
  });

  it("Score 10 erreicht maxOuterRadius 255.00", () => {
    const allTens: ModuleScores = {
      m1: 10,
      m2: 10,
      m3: 10,
      m4: 10,
      m5: 10,
      m6: 10,
      m7: 10,
      m8: 10,
      m9: 10,
    };
    const paths = computeWheelPathsV2(allTens);
    paths.forEach((p) => {
      expect(p.pathD).toContain("A 255.00 255.00");
    });
  });

  it("Score-Position liegt zwischen Inner und Outer-Radius (Mid-Radius)", () => {
    const paths = computeWheelPathsV2(allFives);
    // Mid-Radius bei score=5 = (90+172.5)/2 = 131.25
    // M1 = idx 0 -> midAngle = (-90 + -50)/2 = -70° -> Vektor (cos(-70°), sin(-70°))
    // Vorzeichen: cos(-70°) > 0, sin(-70°) < 0 -> M1-Score-Text rechts und oben vom Zentrum
    const p1 = paths[0]!;
    expect(p1.scoreX).toBeGreaterThan(WHEEL_V2.centerX);
    expect(p1.scoreY).toBeLessThan(WHEEL_V2.centerY);
  });
});

describe("computeWheelPathsV2 — Label-Position (aussen am Wheel)", () => {
  it("Label-Radius = outerCircleRadius + 12 (ausserhalb des outer-circles)", () => {
    const paths = computeWheelPathsV2(allFives);
    const targetRadius = WHEEL_V2.outerCircleRadius + 12;
    paths.forEach((p) => {
      const dx = p.labelX - WHEEL_V2.centerX;
      const dy = p.labelY - WHEEL_V2.centerY;
      const r = Math.sqrt(dx * dx + dy * dy);
      expect(r).toBeCloseTo(targetRadius, 1);
    });
  });

  it("M1-Label oben (12-Uhr-Sektor mitte), y deutlich unter centerY", () => {
    const paths = computeWheelPathsV2(allFives);
    const m1 = paths[0]!;
    expect(m1.labelY).toBeLessThan(WHEEL_V2.centerY);
  });
});

describe("computeWheelPathsV2 — M-Label (M9-Suffix)", () => {
  it("M1..M8 erhalten 'M{n}' Label ohne Suffix", () => {
    const paths = computeWheelPathsV2(allFives);
    for (let i = 0; i < 8; i++) {
      expect(paths[i]!.label).toBe(`M${i + 1}`);
    }
  });

  it("M9 erhaelt Suffix ' ★'", () => {
    const paths = computeWheelPathsV2(allFives);
    expect(paths[8]!.label).toBe("M9 ★");
  });
});

describe("computeWheelPathsV2 — focusIdx-Dim-Verhalten", () => {
  it("ohne focusIdx: alle Sectoren behalten Base-Stufe-Color", () => {
    const paths = computeWheelPathsV2(fiveStufenSpread);
    expect(paths[0]!.fillColor).toBe(COLOR.stufen.s1);
    expect(paths[4]!.fillColor).toBe(COLOR.stufen.s5);
  });

  it("focusIdx=0 behaelt M1 Base-Color, andere werden gedimmt (rgb(...))", () => {
    const paths = computeWheelPathsV2(fiveStufenSpread, { focusIdx: 0 });
    // Focused
    expect(paths[0]!.fillColor).toBe(COLOR.stufen.s1);
    // Gedimmt → lightenColor mix 70% weiss → rgb(...)-String
    expect(paths[1]!.fillColor).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(paths[4]!.fillColor).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });

  it("focusIdx=4 behaelt M5 Base, andere Pastel-Mix (deterministische rgb)", () => {
    const paths = computeWheelPathsV2(fiveStufenSpread, { focusIdx: 4 });
    expect(paths[4]!.fillColor).toBe(COLOR.stufen.s5);

    // s1=#dc2626 → r=220,g=38,b=38 → 70% white mix:
    // 220*0.3 + 255*0.7 = 66 + 178.5 = 244.5 → 245 (Math.round)
    // 38*0.3 + 255*0.7 = 11.4 + 178.5 = 189.9 → 190
    expect(paths[0]!.fillColor).toBe("rgb(245, 190, 190)");
  });

  it("gedimmte Pastel-Farbe ist heller (jeder Channel >= original)", () => {
    const paths = computeWheelPathsV2(fiveStufenSpread, { focusIdx: 4 });
    const dimmed = paths[0]!.fillColor; // s1 dimmed
    const match = dimmed.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
    expect(match).not.toBeNull();
    const [, r, g, b] = match!;
    // s1=#dc2626 → 220,38,38 — Pastel muss >= sein
    expect(Number(r)).toBeGreaterThanOrEqual(220);
    expect(Number(g)).toBeGreaterThanOrEqual(38);
    expect(Number(b)).toBeGreaterThanOrEqual(38);
  });
});
