// V8 SLC-150 MT-2 — Wheel-Legend Stub.
//
// Renders die 9 Modul-Namen + Scores als kompakte 3x3-Grid-Legende neben
// dem Wheel. Klassifizierungs-Indikator-Punkt (rot/amber/gruen) pro Item.
// MT-5 polish: Hierarchie, Spacing, Border-Akzent.

import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, SPACING, TYPOGRAPHY, getClassificationColor } from "../theme";
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

function colorForScore(score: number): "rot" | "amber" | "gruen" {
  if (score < 4) return "rot";
  if (score < 7) return "amber";
  return "gruen";
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  item: {
    width: "33.3%",
    paddingVertical: SPACING.xs,
    paddingRight: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: SPACING.sm,
  },
  itemBody: {
    flexDirection: "column",
  },
  modulKey: {
    fontSize: 7,
    color: COLOR.textLight,
    letterSpacing: 1,
  },
  modulName: {
    fontSize: TYPOGRAPHY.smallSize,
    fontFamily: "Helvetica-Bold",
    color: COLOR.textDark,
  },
  modulScore: {
    fontSize: TYPOGRAPHY.smallSize,
    color: COLOR.textMuted,
  },
});

export function WheelLegend({ moduleScores, moduleNames }: WheelLegendProps) {
  return (
    <View style={styles.grid}>
      {MODUL_KEYS.map((key) => {
        const score = moduleScores[key];
        const colorKey = colorForScore(score);
        const indicator = getClassificationColor(colorKey);
        return (
          <View key={key} style={styles.item}>
            <View style={[styles.dot, { backgroundColor: indicator }]} />
            <View style={styles.itemBody}>
              <Text style={styles.modulKey}>{key.toUpperCase()}</Text>
              <Text style={styles.modulName}>{moduleNames[key]}</Text>
              <Text style={styles.modulScore}>{score.toFixed(1)} / 10</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
