// SLC-141 MT-2 (FEAT-060) — Score-Visual fuer PDF (6 horizontale Bars).
//
// Spiegelt das BerichtRenderer/ScoreVisual-Pattern (Browser-Side) auf
// react-pdf-Primitives. Eigener Stil-Pfad — Score-Werte werden mit
// scoreColor() farbcodiert (rot < 40, amber < 70, gruen >= 70).

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles, scoreColor } from "../styles";

export interface ScoreVisualPdfRow {
  key: string;
  title: string;
  score: number;
}

interface Props {
  rows: ScoreVisualPdfRow[];
}

export function ScoreVisualPdf({ rows }: Props) {
  return (
    <View style={styles.scoreVisualContainer}>
      {rows.map((row) => {
        const clamped = Math.max(0, Math.min(100, row.score));
        return (
          <View key={row.key} style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>{row.title}</Text>
            <View style={styles.scoreTrack}>
              <View
                style={{
                  ...styles.scoreFill,
                  width: `${clamped}%`,
                  backgroundColor: scoreColor(clamped),
                }}
              />
            </View>
            <Text style={styles.scoreValue}>{clamped}</Text>
          </View>
        );
      })}
    </View>
  );
}
