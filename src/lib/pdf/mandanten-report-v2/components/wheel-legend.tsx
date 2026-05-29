// V8 SLC-150 Polish-Round-1 — Wheel-Legend nach Master-Vorlage.
//
// Render: 3x3-Grid mit M1..M9-Items.
// Pro Item:
// - M-Nummer als JetBrains Mono Pill (M1..M9 mit ★ bei M9)
// - Modul-Name (Fraunces, neutral-900)
// - Score als JetBrains Mono (rechts ausgerichtet)
// - Stufen-Color als Pill-Background (mit Hex + Pastel-Fill)

import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, SPACING, getStufeColor } from "../theme";
import { mapModuleScoreToStufe } from "@/lib/diagnose/sui-engine";
import type { ModulKey, ModuleScores } from "@/lib/diagnose/types";

interface WheelLegendProps {
  moduleScores: ModuleScores;
  moduleNames: Record<ModulKey, string>;
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

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  item: {
    width: "33.3%",
    paddingVertical: 7,
    paddingRight: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.neutral200,
    borderBottomStyle: "solid",
  },
  numPill: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: COLOR.neutral100,
    minWidth: 28,
    alignItems: "center",
  },
  numPillText: {
    fontSize: 8,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    color: COLOR.brandPrimary,
    letterSpacing: 0.5,
  },
  nameWrap: {
    flex: 1,
    flexDirection: "column",
  },
  modulName: {
    fontSize: 9,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral800,
    lineHeight: 1.2,
  },
  weighted: {
    fontSize: 7,
    fontFamily: "JetBrains Mono",
    color: COLOR.neutral500,
    marginTop: 2,
  },
  scoreText: {
    fontSize: 11,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    color: COLOR.neutral900,
  },
});

export function WheelLegend({ moduleScores, moduleNames }: WheelLegendProps) {
  return (
    <View style={styles.grid}>
      {MODUL_KEYS.map((key, idx) => {
        const score = moduleScores[key];
        const stufe = mapModuleScoreToStufe(score);
        const stufeColor = getStufeColor(stufe);
        const isM9 = key === "m9";
        const numLabel = isM9 ? "M9 ★" : `M${idx + 1}`;
        return (
          <View key={key} style={styles.item}>
            <View
              style={[
                styles.numPill,
                { backgroundColor: hexAlpha(stufeColor, 0.12) },
              ]}
            >
              <Text style={[styles.numPillText, { color: stufeColor }]}>
                {numLabel}
              </Text>
            </View>
            <View style={styles.nameWrap}>
              <Text style={styles.modulName}>{moduleNames[key]}</Text>
              {isM9 && <Text style={styles.weighted}>2x GEWICHTET</Text>}
            </View>
            <Text style={styles.scoreText}>{score.toFixed(0)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Approximiert Alpha-Channel als pre-multiplied RGB gegen weissen Hintergrund.
 * @react-pdf v4 rendert `rgba(..., alpha)` nicht zuverlaessig.
 */
function hexAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const newR = Math.round(r * alpha + 255 * (1 - alpha));
  const newG = Math.round(g * alpha + 255 * (1 - alpha));
  const newB = Math.round(b * alpha + 255 * (1 - alpha));
  return `rgb(${newR}, ${newG}, ${newB})`;
}
