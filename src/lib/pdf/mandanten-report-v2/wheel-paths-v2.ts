// V8 SLC-150 Polish-Round-1 — wheel-paths-v2 mit Annulus-Sectoren
// nach Master-Vorlage MANDANTEN_REPORT_PROTOTYP.html Page 3.
//
// Layout-Spec (aus Master, Zeile 416-501):
// - viewBox -20 -20 600 600, Center (280, 280)
// - Inner-Hole r=90, Outer-Max r=255
// - 9 Sectoren, 40° pro Sector
// - M1 startet oben (12-Uhr-Position, 0° = -90° in Standard-Mathematik)
// - Clockwise (Score 1 oben, Score 2 oben-rechts, etc.)
// - Outer-Radius = 90 + (score/10) * 165 (lineare Skala von Inner-Hole bis Max)
// - Sector-Farbe ueber 5-Stufen-Mapping (s1=rot ... s5=gruen)
//
// Pure-Function. Wird durch <Wheel> Component in renderer konsumiert.

import type { ModulKey, ModuleScores } from "@/lib/diagnose/types";
import { mapModuleScoreToStufe } from "@/lib/diagnose/sui-engine";
import { COLOR, WHEEL_V2 } from "./theme";

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

export interface WheelPathV2 {
  modulId: ModulKey;
  /** SVG `d`-Attribut fuer @react-pdf <Path d={pathD} />. Annulus-Sector. */
  pathD: string;
  /** Hex-Farbe basierend auf Stufe (5-Stufen-Klassifizierung). */
  fillColor: string;
  /** 1..5 — Stufen-Klassifizierung des Modul-Scores. */
  stufe: number;
  /** Score-Text (z.B. "5") als white text im Sektor-Schwerpunkt. */
  scoreText: string;
  /** SVG-Koordinaten fuer Score-Text-Position. */
  scoreX: number;
  scoreY: number;
  /** M-Label (z.B. "M1" oder "M9 ★") + Position aussen am Wheel. */
  label: string;
  labelX: number;
  labelY: number;
}

interface ComputeOptions {
  /** 0..8 = Modul-Idx 1..9, dimmt alle anderen Sektoren. Optional. */
  focusIdx?: number;
}

/**
 * Berechnet Annulus-Sector-Pfade fuer Modul-Profil-Wheel.
 *
 * Layout-Convention:
 * - 0° = 12 Uhr (Top), Standard Math hat 0° = 3 Uhr → wir nutzen offset -90°.
 * - Clockwise positive Richtung (entgegen Math-Standard, daher * -1 oder anders).
 * - SVG y-Achse zeigt nach unten.
 *
 * Pro Sektor:
 * - Inner-Arc (r=90) und Outer-Arc (r=outer = 90 + score*16.5).
 * - 4 Punkte: P1=outer-left, P2=outer-right, P3=inner-right, P4=inner-left.
 * - Path: M P1 → A (outer arc to P2) → L P3 → A (inner arc back to P4) → Z.
 */
export function computeWheelPathsV2(
  scores: ModuleScores,
  options: ComputeOptions = {}
): WheelPathV2[] {
  const { centerX, centerY, innerRadius, maxOuterRadius } = WHEEL_V2;
  const { focusIdx } = options;

  return MODUL_KEYS.map((key, idx) => {
    const score = scores[key];
    const stufe = mapModuleScoreToStufe(score);

    // Outer-Radius linear: 0 → innerRadius, 10 → maxOuterRadius.
    const outerRadius =
      innerRadius + (score / 10) * (maxOuterRadius - innerRadius);

    // Winkel: Sector N startet bei (N * 40° - 90°), endet (N * 40° + 40° - 90°).
    // M1 = idx 0 = 0°..40° in Master-Convention (Top → Top-Right).
    const startAngle = idx * SECTOR_DEG - 90;
    const endAngle = (idx + 1) * SECTOR_DEG - 90;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    // 4 Eckpunkte (P1 = outer-left, P2 = outer-right, P3 = inner-right, P4 = inner-left).
    const p1x = centerX + outerRadius * Math.cos(startRad);
    const p1y = centerY + outerRadius * Math.sin(startRad);
    const p2x = centerX + outerRadius * Math.cos(endRad);
    const p2y = centerY + outerRadius * Math.sin(endRad);
    const p3x = centerX + innerRadius * Math.cos(endRad);
    const p3y = centerY + innerRadius * Math.sin(endRad);
    const p4x = centerX + innerRadius * Math.cos(startRad);
    const p4y = centerY + innerRadius * Math.sin(startRad);

    // largeArcFlag = 0 (alle Sectoren <180°).
    const pathD = [
      `M ${p1x.toFixed(2)} ${p1y.toFixed(2)}`,
      `A ${outerRadius.toFixed(2)} ${outerRadius.toFixed(2)} 0 0 1 ${p2x.toFixed(2)} ${p2y.toFixed(2)}`,
      `L ${p3x.toFixed(2)} ${p3y.toFixed(2)}`,
      `A ${innerRadius.toFixed(2)} ${innerRadius.toFixed(2)} 0 0 0 ${p4x.toFixed(2)} ${p4y.toFixed(2)}`,
      "Z",
    ].join(" ");

    // Sektor-Stufen-Farbe (mit Dim-Effekt bei focusIdx).
    const baseColor = getStufeColorByLevel(stufe);
    const fillColor =
      focusIdx !== undefined && focusIdx !== idx
        ? lightenColor(baseColor, 0.7) // 70% mix mit weiss = Pastel
        : baseColor;

    // Score-Text-Position: Mittel-Radius zwischen Inner und Outer.
    const midRadius = (innerRadius + outerRadius) / 2;
    const midAngle = (startAngle + endAngle) / 2;
    const midRad = (midAngle * Math.PI) / 180;
    const scoreX = centerX + midRadius * Math.cos(midRad);
    // y-Korrektur fuer Text-Baseline.
    const scoreY = centerY + midRadius * Math.sin(midRad) + 4;

    // M-Label-Position: Ausserhalb des outer-circle (r=263+20).
    const labelRadius = WHEEL_V2.outerCircleRadius + 12;
    const labelX = centerX + labelRadius * Math.cos(midRad);
    const labelY = centerY + labelRadius * Math.sin(midRad);

    const labelText = key === "m9" ? "M9 ★" : `M${idx + 1}`;

    return {
      modulId: key,
      pathD,
      fillColor,
      stufe,
      scoreText: score.toFixed(0),
      scoreX,
      scoreY,
      label: labelText,
      labelX,
      labelY,
    };
  });
}

function getStufeColorByLevel(stufe: number): string {
  if (stufe <= 1) return COLOR.stufen.s1;
  if (stufe === 2) return COLOR.stufen.s2;
  if (stufe === 3) return COLOR.stufen.s3;
  if (stufe === 4) return COLOR.stufen.s4;
  return COLOR.stufen.s5;
}

/**
 * Mixt einen #RRGGBB-Farbwert mit Weiss zu einem helleren Pastel.
 * mixRatio = 0.7 → 70% weiss + 30% Original-Farbe.
 */
function lightenColor(hex: string, mixRatio: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const newR = Math.round(r * (1 - mixRatio) + 255 * mixRatio);
  const newG = Math.round(g * (1 - mixRatio) + 255 * mixRatio);
  const newB = Math.round(b * (1 - mixRatio) + 255 * mixRatio);
  return `rgb(${newR}, ${newG}, ${newB})`;
}
