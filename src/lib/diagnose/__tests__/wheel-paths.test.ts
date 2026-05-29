// V8 SLC-148 MT-5 — Vitest fuer Pure-Function `computeWheelPaths`.
//
// Wird in SLC-150 (Renderer FEAT-066) konsumiert. Vorgezogen fuer
// Determinismus + Vitest-Coverage VOR PDF-Engine-Spike.

import { describe, it, expect } from "vitest";

import { computeWheelPaths } from "../wheel-paths";
import type { ModuleScores } from "../types";

function uniformScores(score: number): ModuleScores {
  return {
    m1: score,
    m2: score,
    m3: score,
    m4: score,
    m5: score,
    m6: score,
    m7: score,
    m8: score,
    m9: score,
  };
}

describe("computeWheelPaths", () => {
  it("liefert genau 9 Pfade (1 pro Modul M1..M9)", () => {
    const paths = computeWheelPaths(uniformScores(5));
    expect(paths).toHaveLength(9);
  });

  it("jeder Pfad hat modulId m1..m9 in Reihenfolge", () => {
    const paths = computeWheelPaths(uniformScores(5));
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

  it("jeder Pfad hat label M1..M9 (uppercase)", () => {
    const paths = computeWheelPaths(uniformScores(5));
    expect(paths.map((p) => p.label)).toEqual([
      "M1",
      "M2",
      "M3",
      "M4",
      "M5",
      "M6",
      "M7",
      "M8",
      "M9",
    ]);
  });

  it("AC-Verification: Alles Score 5 -> radiusFactor 0.5, alle amber", () => {
    const paths = computeWheelPaths(uniformScores(5));
    for (const p of paths) {
      expect(p.radiusFactor).toBeCloseTo(0.5, 5);
      // Amber-Color, kein alpha (kein focusIdx -> alle full-color)
      expect(p.fillColor).toMatch(/^rgb\(/);
      expect(p.fillColor).toBe("rgb(245, 158, 11)"); // #f59e0b
    }
  });

  it("AC-Verification: Score-Profil 0/2/4/6/8/10/3/5/7 -> korrekte Farb-Klassifizierung", () => {
    const scores: ModuleScores = {
      m1: 0,
      m2: 2,
      m3: 4,
      m4: 6,
      m5: 8,
      m6: 10,
      m7: 3,
      m8: 5,
      m9: 7,
    };
    const paths = computeWheelPaths(scores);
    const expectedColors = [
      "rgb(220, 38, 38)", // m1=0 rot
      "rgb(220, 38, 38)", // m2=2 rot
      "rgb(245, 158, 11)", // m3=4 amber
      "rgb(245, 158, 11)", // m4=6 amber
      "rgb(16, 185, 129)", // m5=8 gruen
      "rgb(16, 185, 129)", // m6=10 gruen
      "rgb(220, 38, 38)", // m7=3 rot
      "rgb(245, 158, 11)", // m8=5 amber
      "rgb(16, 185, 129)", // m9=7 gruen
    ];
    expect(paths.map((p) => p.fillColor)).toEqual(expectedColors);
  });

  it("Color-Grenzen: 3.99 -> rot, 4.0 -> amber, 6.99 -> amber, 7.0 -> gruen", () => {
    const scores: ModuleScores = {
      m1: 3.99,
      m2: 4.0,
      m3: 6.99,
      m4: 7.0,
      m5: 5,
      m6: 5,
      m7: 5,
      m8: 5,
      m9: 5,
    };
    const paths = computeWheelPaths(scores);
    expect(paths[0]?.fillColor).toBe("rgb(220, 38, 38)"); // 3.99 rot
    expect(paths[1]?.fillColor).toBe("rgb(245, 158, 11)"); // 4.0 amber
    expect(paths[2]?.fillColor).toBe("rgb(245, 158, 11)"); // 6.99 amber
    expect(paths[3]?.fillColor).toBe("rgb(16, 185, 129)"); // 7.0 gruen
  });

  it("AC-Verification: focusIdx=4 -> 8/9 Pfade dimmed (pastel), m5 full-color", () => {
    // Pre-multiplied alpha fix (SLC-150 MT-1 Spike): kein rgba() mehr,
    // dimmed-Pfade sind pre-multiplied Pastel-Variante gegen weiss.
    const paths = computeWheelPaths(uniformScores(5), { focusIdx: 4 });
    const fullAmber = "rgb(245, 158, 11)";
    const pastelAmber = "rgb(252, 226, 182)";
    paths.forEach((p, i) => {
      if (i === 4) {
        expect(p.fillColor).toBe(fullAmber);
      } else {
        expect(p.fillColor).toBe(pastelAmber);
      }
    });
  });

  it("focusIdx=0 (Boundary): erster Pfad full-color, restliche pastel", () => {
    const paths = computeWheelPaths(uniformScores(5), { focusIdx: 0 });
    expect(paths[0]?.fillColor).toBe("rgb(245, 158, 11)");
    for (let i = 1; i < 9; i++) {
      expect(paths[i]?.fillColor).toBe("rgb(252, 226, 182)");
    }
  });

  it("focusIdx=8 (oberer Boundary): letzter Pfad full-color, restliche pastel", () => {
    const paths = computeWheelPaths(uniformScores(5), { focusIdx: 8 });
    expect(paths[8]?.fillColor).toBe("rgb(245, 158, 11)");
    for (let i = 0; i < 8; i++) {
      expect(paths[i]?.fillColor).toBe("rgb(252, 226, 182)");
    }
  });

  it("Kein focusIdx -> alle Pfade full-color (kein Pastel)", () => {
    const paths = computeWheelPaths(uniformScores(5));
    for (const p of paths) {
      expect(p.fillColor).toBe("rgb(245, 158, 11)");
    }
  });

  it("Pre-multiplied Pastel: jede Klassifizierungs-Stufe hat eigenes Pastel", () => {
    // rot/amber/gruen Score-Profil mit focusIdx auf gruen-Item.
    const paths = computeWheelPaths(
      {
        m1: 2, // rot
        m2: 5, // amber
        m3: 9, // gruen (focus)
        m4: 2, // rot
        m5: 5, // amber
        m6: 9, // gruen
        m7: 2, // rot
        m8: 5, // amber
        m9: 9, // gruen
      },
      { focusIdx: 2 },
    );
    expect(paths[0]?.fillColor).toBe("rgb(244, 190, 190)"); // rot-pastel
    expect(paths[1]?.fillColor).toBe("rgb(252, 226, 182)"); // amber-pastel
    expect(paths[2]?.fillColor).toBe("rgb(16, 185, 129)"); // gruen-full (focus)
    expect(paths[3]?.fillColor).toBe("rgb(244, 190, 190)"); // rot-pastel
    expect(paths[5]?.fillColor).toBe("rgb(183, 234, 217)"); // gruen-pastel
  });

  it("AC-Verification: Path-D-String beginnt mit 'M ' und enthaelt ' A '", () => {
    const paths = computeWheelPaths(uniformScores(5));
    for (const p of paths) {
      expect(p.pathD.startsWith("M ")).toBe(true);
      expect(p.pathD).toContain(" A ");
    }
  });

  it("Default Options: centerX=100, centerY=100 -> pathD startet mit 'M 100 100'", () => {
    const paths = computeWheelPaths(uniformScores(5));
    for (const p of paths) {
      expect(p.pathD.startsWith("M 100 100 ")).toBe(true);
    }
  });

  it("AC-Verification: Custom Options propagieren - centerX/centerY in pathD sichtbar", () => {
    const paths = computeWheelPaths(uniformScores(5), {
      centerX: 50,
      centerY: 50,
      radius: 40,
    });
    for (const p of paths) {
      expect(p.pathD.startsWith("M 50 50 ")).toBe(true);
    }
  });

  it("Custom radius propagiert - Pfade enthalten Custom-Radius in A-Command", () => {
    const paths = computeWheelPaths(uniformScores(10), { radius: 50 });
    // Bei Score 10 -> radiusFactor 1.0, also r = 50.0
    for (const p of paths) {
      // A-Command Format: "A {rx} {ry} ..."
      expect(p.pathD).toMatch(/A 50\.00 50\.00/);
    }
  });

  it("AC-Verification: Edge-Case Score 0 -> radiusFactor 0.2 (Vermeidung leerer Pfade)", () => {
    const paths = computeWheelPaths(uniformScores(0));
    for (const p of paths) {
      expect(p.radiusFactor).toBeCloseTo(0.2, 5);
    }
  });

  it("radiusFactor linear bis Floor: Score 5 -> 0.5, Score 10 -> 1.0, Score 0 -> 0.2 (Floor)", () => {
    const paths = computeWheelPaths({
      m1: 0,
      m2: 1,
      m3: 2,
      m4: 5,
      m5: 7,
      m6: 8,
      m7: 9,
      m8: 10,
      m9: 6,
    });
    expect(paths[0]?.radiusFactor).toBeCloseTo(0.2, 5); // 0/10=0.0 -> Floor 0.2
    expect(paths[1]?.radiusFactor).toBeCloseTo(0.2, 5); // 1/10=0.1 -> Floor 0.2
    expect(paths[2]?.radiusFactor).toBeCloseTo(0.2, 5); // 2/10=0.2 -> 0.2 (=Floor)
    expect(paths[3]?.radiusFactor).toBeCloseTo(0.5, 5); // 5/10=0.5
    expect(paths[4]?.radiusFactor).toBeCloseTo(0.7, 5); // 7/10=0.7
    expect(paths[5]?.radiusFactor).toBeCloseTo(0.8, 5); // 8/10=0.8
    expect(paths[6]?.radiusFactor).toBeCloseTo(0.9, 5); // 9/10=0.9
    expect(paths[7]?.radiusFactor).toBeCloseTo(1.0, 5); // 10/10=1.0
    expect(paths[8]?.radiusFactor).toBeCloseTo(0.6, 5); // 6/10=0.6
  });

  it("Determinismus: 2x Aufruf mit gleichen Inputs liefert identische pathD-Strings", () => {
    const scores: ModuleScores = {
      m1: 7,
      m2: 3,
      m3: 5,
      m4: 9,
      m5: 1,
      m6: 4,
      m7: 6,
      m8: 8,
      m9: 10,
    };
    const paths1 = computeWheelPaths(scores, { focusIdx: 2, radius: 60 });
    const paths2 = computeWheelPaths(scores, { focusIdx: 2, radius: 60 });
    expect(paths1.map((p) => p.pathD)).toEqual(paths2.map((p) => p.pathD));
    expect(paths1.map((p) => p.fillColor)).toEqual(
      paths2.map((p) => p.fillColor)
    );
  });
});
