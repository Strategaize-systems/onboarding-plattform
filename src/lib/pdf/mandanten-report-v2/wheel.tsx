// V8 SLC-150 MT-1 — Wheel-Component fuer Mandanten-Report V2 PDF-Renderer.
//
// Konsumiert die Pure-Function `computeWheelPaths` aus
// `src/lib/diagnose/wheel-paths.ts` (SLC-148 MT-5, DEC-162) und rendert
// 9 SVG-Pfade als @react-pdf <Svg> + <Path>. Reuse-faehig fuer Phase-A
// Modul-Profil-Page (alle 9 Module sichtbar) und Phase-B Modul-Pages
// (1 Modul fokussiert via focusIdx).
//
// Spike-Klausel (DEC-157): Pivot-Trigger ist "Founder-Visual-Akzeptanz
// fail bei MT-1-Wheel-Demo". Bei Pivot wird diese Datei durch eine
// Hybrid-Variante ersetzt (satori+sharp pre-rendered PNG via @react-pdf
// <Image>).

import React from "react";
import { Svg, Path, G, Text as PdfText } from "@react-pdf/renderer";

import { computeWheelPaths } from "@/lib/diagnose/wheel-paths";
import type { ModuleScores } from "@/lib/diagnose/types";
import { WHEEL } from "./theme";

export interface WheelProps {
  moduleScores: ModuleScores;
  /** 0..8 (0-indiziert m1..m9). Wenn gesetzt, dimmen restliche Sectoren auf Alpha 0.3. */
  focusIdx?: number;
  /** SVG-Viewport-Breite in pt (PDF-Units). Default 200. */
  size?: number;
  /** Wheel-Sektor-Labels (M1..M9) anzeigen? Default true. */
  showLabels?: boolean;
}

/**
 * Mandanten-Report-Wheel als @react-pdf <Svg>.
 *
 * Layout:
 * - 9 Sectoren via computeWheelPaths (40° pro Sector, Score-abhaengiger Radius).
 * - Optional: M1..M9 Labels als <Text> mittig im Sector (~70% Radius).
 *
 * Color-Klassifizierung kommt aus `computeWheelPaths.fillColor` (rgb/rgba-Strings),
 * @react-pdf <Path fill={...}> akzeptiert das direkt.
 */
export function Wheel({
  moduleScores,
  focusIdx,
  size = WHEEL.defaultRadius * 2.5, // 200pt Default
  showLabels = true,
}: WheelProps) {
  const paths = computeWheelPaths(moduleScores, { focusIdx });

  // Label-Positionierung: 70% des Sector-Radius, in Sector-Mitte (Winkel + 20°).
  // SVG y-Achse zeigt nach unten, daher cy - r*cos.
  const labelPositions = paths.map((p, i) => {
    const sectorMidAngleDeg = i * 40 + 20;
    const sectorMidRad = (sectorMidAngleDeg * Math.PI) / 180;
    const labelRadius = p.radiusFactor * WHEEL.defaultRadius * 0.7;
    return {
      x: WHEEL.defaultCenterX + labelRadius * Math.sin(sectorMidRad),
      y: WHEEL.defaultCenterY - labelRadius * Math.cos(sectorMidRad),
      label: p.label,
      isDimmed: focusIdx !== undefined && focusIdx !== i,
    };
  });

  return (
    <Svg viewBox={WHEEL.viewBox} width={size} height={size}>
      <G>
        {paths.map((p) => (
          <Path key={p.modulId} d={p.pathD} fill={p.fillColor} />
        ))}
      </G>
      {showLabels && (
        <G>
          {labelPositions.map((lp) => (
            <PdfText
              key={lp.label}
              x={lp.x}
              y={lp.y}
              style={{
                fontSize: 7,
                fill: lp.isDimmed ? "rgba(255, 255, 255, 0.4)" : "#FFFFFF",
                fontFamily: "Helvetica-Bold",
              }}
              textAnchor="middle"
            >
              {lp.label}
            </PdfText>
          ))}
        </G>
      )}
    </Svg>
  );
}
