// V8 SLC-150 Polish-Round-1 — Wheel-V2-Component fuer Mandanten-Report V2
// PDF-Renderer.
//
// 1:1-Port der HTML-Master-Vorlage MANDANTEN_REPORT_PROTOTYP.html Page 3
// (Zeile 415-501). Annulus-Sectoren mit Center-Hole + 3 Grid-Ringen +
// 9 Score-Texten + 9 M-Labels aussen + zentralem SUI/Score/Klassifizierung-
// Display im Center-Hole.
//
// Ersetzt das alte Sector-Wheel `wheel.tsx` (MT-1 Spike-Variante, weiter
// genutzt nur fuer MT-1-Reproduzierbarkeits-Skript).

import React from "react";
import { Svg, Circle, Path, G, Text as PdfText } from "@react-pdf/renderer";

import { computeWheelPathsV2 } from "./wheel-paths-v2";
import { COLOR, WHEEL_V2 } from "./theme";
import type { ModuleScores } from "@/lib/diagnose/types";

/**
 * Optional Override fuer Center-Hole-Display. Wenn gesetzt, wird statt
 * SUI-Hero ein Modul-Label + Score gerendert (fuer Modul-Page-Variante,
 * SLC-151 MT-1).
 */
export interface WheelV2CenterOverride {
  /** Top-Label (z.B. "Modul 3"). */
  topLabel: string;
  /** Hero-Zahl (z.B. 5). */
  score: number;
  /** Sub-Label (z.B. "von 10"). */
  subLabel: string;
}

export interface WheelV2Props {
  moduleScores: ModuleScores;
  /** Pixel-Width des SVG-Outputs (Hoehe = Breite). Default 320. */
  size?: number;
  /** SUI-Score (0-100) — wird im Center-Hole als Hero-Zahl gerendert. */
  sui?: number;
  /** Klassifizierungs-Label (z.B. "Teil-Reife") — Center-Hole-Sub-Text. */
  classificationLabel?: string;
  /** 0..8 = Modul-Idx 1..9, dimmt alle anderen Sektoren auf Pastel. */
  focusIdx?: number;
  /** Score-Text in Sektoren rendern? Default true. */
  showScores?: boolean;
  /** M-Labels aussen rendern? Default true. */
  showLabels?: boolean;
  /** Center-Hole + SUI-Display rendern? Default true (false fuer Watermark). */
  showCenter?: boolean;
  /** Override fuer Center-Hole — wenn gesetzt, ersetzt SUI-Hero-Display. */
  centerOverride?: WheelV2CenterOverride;
}

export function WheelV2({
  moduleScores,
  size = 320,
  sui,
  classificationLabel,
  focusIdx,
  showScores = true,
  showLabels = true,
  showCenter = true,
  centerOverride,
}: WheelV2Props) {
  const paths = computeWheelPathsV2(moduleScores, { focusIdx });
  const { centerX, centerY, innerRadius, outerCircleRadius, gridRings } = WHEEL_V2;
  return (
    <Svg
      viewBox={WHEEL_V2.viewBox}
      width={size}
      height={size}
    >
      {/* Aeusserer Hintergrund-Kreis (leichter Slate) */}
      <Circle
        cx={centerX}
        cy={centerY}
        r={outerCircleRadius}
        fill={COLOR.neutral100}
      />

      {/* Grid-Ringe als Reife-Indikator (subtiles slate, dashed) */}
      <G>
        {gridRings.map((r, i) => (
          <Circle
            key={`grid-${i}`}
            cx={centerX}
            cy={centerY}
            r={r}
            fill="none"
            stroke={COLOR.neutral300}
            strokeWidth={1}
            strokeDasharray="2 4"
            opacity={0.55}
          />
        ))}
      </G>

      {/* 9 Annulus-Sectoren */}
      <G>
        {paths.map((p) => (
          <Path key={p.modulId} d={p.pathD} fill={p.fillColor} opacity={0.94} />
        ))}
      </G>

      {/* Score-Texts in Sektoren (white, mittig) */}
      {showScores && (
        <G>
          {paths.map((p) => (
            <PdfText
              key={`score-${p.modulId}`}
              x={p.scoreX}
              y={p.scoreY}
              style={{
                fontSize: 13,
                fill: "#FFFFFF",
                fontFamily: "Fraunces",
                fontWeight: 700,
              }}
              textAnchor="middle"
            >
              {p.scoreText}
            </PdfText>
          ))}
        </G>
      )}

      {/* M-Labels aussen */}
      {showLabels && (
        <G>
          {paths.map((p) => (
            <PdfText
              key={`label-${p.modulId}`}
              x={p.labelX}
              y={p.labelY}
              style={{
                fontSize: 10,
                fill: COLOR.brandPrimary,
                fontFamily: "JetBrains Mono",
                fontWeight: 700,
              }}
              textAnchor="middle"
            >
              {p.label}
            </PdfText>
          ))}
        </G>
      )}

      {/* Center-Hole (white) mit Hero-Display: SUI-Standard ODER Override (Modul-Page) */}
      {showCenter && (
        <G>
          <Circle
            cx={centerX}
            cy={centerY}
            r={innerRadius}
            fill={COLOR.bgWhite}
            stroke={COLOR.neutral200}
            strokeWidth={2}
          />
          <PdfText
            x={centerX}
            y={centerY - 18}
            style={{
              fontSize: 10,
              fill: COLOR.neutral500,
              fontFamily: "JetBrains Mono",
              fontWeight: 700,
            }}
            textAnchor="middle"
          >
            {centerOverride ? centerOverride.topLabel : "SUI"}
          </PdfText>
          <PdfText
            x={centerX}
            y={centerY + 18}
            style={{
              fontSize: 44,
              fill: COLOR.brandPrimaryDark,
              fontFamily: "Fraunces",
              fontWeight: 700,
            }}
            textAnchor="middle"
          >
            {centerOverride
              ? centerOverride.score.toString()
              : sui !== undefined
                ? Math.round(sui).toString()
                : "—"}
          </PdfText>
          {(centerOverride?.subLabel || classificationLabel) && (
            <PdfText
              x={centerX}
              y={centerY + 48}
              style={{
                fontSize: 11,
                fill: COLOR.neutral600,
                fontFamily: "Fraunces",
                fontWeight: 700,
              }}
              textAnchor="middle"
            >
              {centerOverride ? centerOverride.subLabel : classificationLabel}
            </PdfText>
          )}
        </G>
      )}
    </Svg>
  );
}
