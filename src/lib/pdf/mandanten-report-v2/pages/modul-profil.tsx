// V8 SLC-150 Polish-Round-1 — Modul-Profil-Page (Page 3) als 1:1-Port
// der HTML-Master-Vorlage MANDANTEN_REPORT_PROTOTYP.html Zeile 410-525.
//
// Layout:
// - Section-Eyebrow + Title + Lead (Indigo-Theme)
// - Wheel zentriert (V2 mit Annulus-Sectoren + Center-Hole + SUI-Center)
// - Stufen-Skala-Legende (5 Stufen mit eigenen Farben)
// - Modul-Uebersicht (3x3-Grid mit Modul-Name + Score + Stufen-Pill-Color)

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, PAGE, SPACING, getStufeColor } from "../theme";
import { WheelV2 } from "../wheel-v2";
import { WheelLegend } from "../components/wheel-legend";
import type { RendererInput } from "../types";

interface ModulProfilPageProps {
  input: RendererInput;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingHorizontal: 48,
    paddingBottom: 48,
    backgroundColor: COLOR.bgWhite,
    color: COLOR.neutral800,
    fontFamily: "Fraunces",
    fontWeight: 400,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  eyebrowLine: {
    width: 26,
    height: 2,
    backgroundColor: COLOR.brandAccent,
    borderRadius: 1,
    marginRight: 8,
  },
  eyebrowLabel: {
    fontSize: 9,
    letterSpacing: 2.2,
    color: COLOR.brandPrimary,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
  },
  title: {
    fontSize: 30,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    marginBottom: SPACING.md,
    lineHeight: 1.15,
    letterSpacing: -0.5,
  },
  lead: {
    fontSize: 12,
    lineHeight: 1.55,
    color: COLOR.neutral600,
    marginBottom: SPACING.lg,
    maxWidth: 480,
  },
  wheelSection: {
    alignItems: "center",
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  scaleLegend: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 18,
    marginBottom: SPACING.lg,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLOR.neutral200,
    borderTopStyle: "solid",
  },
  scaleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scaleDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  scaleLabel: {
    fontSize: 8,
    fontFamily: "JetBrains Mono",
    color: COLOR.neutral500,
    letterSpacing: 0.5,
    fontWeight: 700,
  },
  legendSection: {
    marginTop: SPACING.sm,
  },
  legendTitle: {
    fontSize: 11,
    fontFamily: "JetBrains Mono",
    letterSpacing: 2,
    color: COLOR.neutral500,
    marginBottom: SPACING.sm,
    fontWeight: 700,
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: COLOR.neutral400,
    fontFamily: "JetBrains Mono",
    letterSpacing: 1,
  },
});

const STUFEN_LEGEND = [
  { stufe: 1, label: "STUFE 1 · KRITISCH" },
  { stufe: 2, label: "STUFE 2 · ANSAETZE" },
  { stufe: 3, label: "STUFE 3 · TEILWEISE" },
  { stufe: 4, label: "STUFE 4 · ETABLIERT" },
  { stufe: 5, label: "STUFE 5 · BELASTBAR" },
];

export function ModulProfilPage({ input }: ModulProfilPageProps) {
  const { snapshot, moduleNames, mandant } = input;
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowLine} />
        <Text style={styles.eyebrowLabel}>MODUL-PROFIL</Text>
      </View>
      <Text style={styles.title}>Die neun operativen Module auf einen Blick</Text>
      <Text style={styles.lead}>
        Jedes Segment zeigt ein Modul. Die Laenge des Segments entspricht dem
        Score (je laenger, desto staerker), die Farbe der getroffenen Reife-
        Stufe — von rot (kritisch) bis gruen (vorbildlich). Modul 9 (Stern)
        fliesst mit doppeltem Gewicht in den SUI ein.
      </Text>

      <View style={styles.wheelSection}>
        <WheelV2
          moduleScores={snapshot.moduleScores}
          size={320}
          sui={snapshot.sui}
          classificationLabel={snapshot.classification.label}
        />
      </View>

      <View style={styles.scaleLegend}>
        {STUFEN_LEGEND.map((item) => (
          <View key={item.stufe} style={styles.scaleItem}>
            <View
              style={[styles.scaleDot, { backgroundColor: getStufeColor(item.stufe) }]}
            />
            <Text style={styles.scaleLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.legendSection}>
        <Text style={styles.legendTitle}>MODULE & SCORES</Text>
        <WheelLegend
          moduleScores={snapshot.moduleScores}
          moduleNames={moduleNames}
        />
      </View>

      <View style={styles.footer}>
        <Text>{mandant.name.toUpperCase()}</Text>
        <Text>SEITE 3 · STRATEGAIZE</Text>
      </View>
    </Page>
  );
}
