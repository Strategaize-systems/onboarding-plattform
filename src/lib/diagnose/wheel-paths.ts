// V8 SLC-148 MT-5 — Pure-Function `computeWheelPaths` fuer Mandanten-Report-
// Wheel-Visualisierung (DEC-162 Wheel-Render).
//
// Berechnet 9 Sector-Pfade als SVG-`d`-Strings fuer das Modul-Reifegrad-Rad.
// Jeder Sector ist 1/9-tel eines Kreises (40° pro Sector). Der Radius eines
// Sectors haengt vom Modul-Score 0-10 ab (Floor 0.2*radius, damit selbst
// Score 0 noch sichtbar ist).
//
// Wird in SLC-150 (FEAT-066 PDF-Renderer-Phase-A) konsumiert. Vorgezogen
// hierher fuer Determinismus + Vitest-Coverage vor PDF-Engine-Spike.
//
// Angle-Konvention: 0° = 12 Uhr (Top), clockwise positive. Sector M1 spannt
// 0°-40°, M2 spannt 40°-80°, ..., M9 spannt 320°-360°. SVG y-Achse zeigt
// nach unten — daher `cy - r*cos(theta)` (nicht +).

import type { ModulKey, ModuleScores } from "./types";

export interface WheelPath {
  modulId: ModulKey;
  /** SVG `d`-Attribut fuer @react-pdf <Path d={pathD} />. */
  pathD: string;
  /** "rgb(r, g, b)" wenn focus oder kein focusIdx, sonst "rgba(r, g, b, 0.3)". */
  fillColor: string;
  /** "M1".."M9" Kurz-Label fuer Wheel-Text. */
  label: string;
  /** 0.2-1.0 — fuer Animation oder direkten Radius-Read durch Renderer. */
  radiusFactor: number;
}

export interface ComputeWheelPathsOptions {
  /** 0..8 (0-indiziert m1..m9). Wenn gesetzt, dimmen restliche Sectoren auf Alpha 0.3. */
  focusIdx?: number;
  /** Basis-Radius des Wheels in SVG-User-Units. Default 80. */
  radius?: number;
  /** SVG x-Koordinate des Wheel-Zentrums. Default 100. */
  centerX?: number;
  /** SVG y-Koordinate des Wheel-Zentrums. Default 100. */
  centerY?: number;
}

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

const SECTOR_DEG = 360 / 9; // 40°

// 3-Stufen-Klassifizierung visuell. Werte als RGB-Strings damit Alpha-Variante
// in einem konsistenten Format gebaut werden kann.
const COLOR_RGB = {
  rot: "220, 38, 38", // #dc2626 Tailwind red-600
  amber: "245, 158, 11", // #f59e0b Tailwind amber-500
  gruen: "16, 185, 129", // #10b981 Tailwind emerald-500
} as const;

function classifyScoreColor(score: number): keyof typeof COLOR_RGB {
  if (score < 4) return "rot";
  if (score < 7) return "amber";
  return "gruen";
}

/**
 * Score 0-10 -> Sector-Radius-Faktor 0.2-1.0.
 *
 * Floor bei 0.2 vermeidet leere Pfade bei Score 0 (Stufe-1-Visualisierung
 * bleibt sichtbar). Linear ueber score/10, geclampt nach unten.
 */
function scoreToRadiusFactor(score: number): number {
  return Math.max(score / 10, 0.2);
}

export function computeWheelPaths(
  moduleScores: ModuleScores,
  options: ComputeWheelPathsOptions = {}
): WheelPath[] {
  const radius = options.radius ?? 80;
  const centerX = options.centerX ?? 100;
  const centerY = options.centerY ?? 100;
  const focusIdx = options.focusIdx;

  return MODUL_KEYS.map((key, i) => {
    const score = moduleScores[key];
    const radiusFactor = scoreToRadiusFactor(score);
    const r = radiusFactor * radius;

    const startAngleDeg = i * SECTOR_DEG;
    const endAngleDeg = (i + 1) * SECTOR_DEG;
    const startRad = (startAngleDeg * Math.PI) / 180;
    const endRad = (endAngleDeg * Math.PI) / 180;

    const startX = centerX + r * Math.sin(startRad);
    const startY = centerY - r * Math.cos(startRad);
    const endX = centerX + r * Math.sin(endRad);
    const endY = centerY - r * Math.cos(endRad);

    const pathD = [
      `M ${centerX} ${centerY}`,
      `L ${startX.toFixed(2)} ${startY.toFixed(2)}`,
      `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`,
      "Z",
    ].join(" ");

    const colorKey = classifyScoreColor(score);
    const rgb = COLOR_RGB[colorKey];
    const isDimmed = focusIdx !== undefined && focusIdx !== i;
    const fillColor = isDimmed ? `rgba(${rgb}, 0.3)` : `rgb(${rgb})`;

    return {
      modulId: key,
      pathD,
      fillColor,
      label: `M${i + 1}`,
      radiusFactor,
    };
  });
}
