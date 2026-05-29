// V8 SLC-150 MT-5 — Modul-Profil-Page (Page 3) gemaess
// docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html Page 3.
//
// Layout:
// - Section-Eyebrow + Page-Title + Lead-Long-Form
// - Wheel zentriert (350pt, alle 9 Module sichtbar)
// - Skala-Legende (rot/amber/gruen mit Score-Bereich)
// - WheelLegend 3x3-Grid mit Modul-Namen + Score + Indikator-Punkt

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, PAGE, SPACING, TYPOGRAPHY, getClassificationColor } from "../theme";
import { Wheel } from "../wheel";
import { WheelLegend } from "../components/wheel-legend";
import type { RendererInput } from "../types";

interface ModulProfilPageProps {
  input: RendererInput;
}

const styles = StyleSheet.create({
  page: {
    padding: PAGE.marginPt,
    backgroundColor: COLOR.bgWhite,
    color: COLOR.textDark,
    fontFamily: "Fraunces",
    fontWeight: 400,
  },
  eyebrow: {
    fontSize: TYPOGRAPHY.smallSize,
    letterSpacing: 2,
    marginBottom: SPACING.sm,
    color: COLOR.textMuted,
    fontFamily: "JetBrains Mono",
  },
  title: {
    fontSize: 30,
    fontFamily: "Fraunces",
    fontWeight: 700,
    marginBottom: SPACING.md,
    color: COLOR.brandPrimaryDark,
    letterSpacing: -0.5,
  },
  lead: {
    fontSize: TYPOGRAPHY.bodySize + 1,
    lineHeight: 1.6,
    color: COLOR.textMuted,
    marginBottom: SPACING.xl,
    maxWidth: 480,
  },
  wheelSection: {
    alignItems: "center",
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  scaleLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  scaleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  scaleDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  scaleLabel: {
    fontSize: 9,
    fontFamily: "JetBrains Mono",
    color: COLOR.textMuted,
    letterSpacing: 0.5,
  },
  legendSection: {
    marginTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLOR.borderSlate,
    borderTopStyle: "solid",
    paddingTop: SPACING.lg,
  },
  legendTitle: {
    fontSize: 11,
    fontFamily: "JetBrains Mono",
    letterSpacing: 2,
    color: COLOR.textMuted,
    marginBottom: SPACING.md,
  },
  footer: {
    position: "absolute",
    bottom: PAGE.marginPt,
    left: PAGE.marginPt,
    right: PAGE.marginPt,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: COLOR.textLight,
    fontFamily: "JetBrains Mono",
    letterSpacing: 1,
  },
});

export function ModulProfilPage({ input }: ModulProfilPageProps) {
  const { snapshot, moduleNames, mandant } = input;
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>ABSCHNITT 2 · MODUL-PROFIL</Text>
      <Text style={styles.title}>Ihr Modul-Profil</Text>
      <Text style={styles.lead}>
        Neun Module zeigen, wo Ihre Uebergabe-Faehigkeit heute steht. Jeder
        Sektor im Rad steht fuer ein Modul, die Laenge des Sektors fuer
        dessen Score 0–10.
      </Text>

      <View style={styles.wheelSection}>
        <Wheel moduleScores={snapshot.moduleScores} size={320} />
      </View>

      <View style={styles.scaleLegend}>
        <View style={styles.scaleItem}>
          <View
            style={[styles.scaleDot, { backgroundColor: getClassificationColor("rot") }]}
          />
          <Text style={styles.scaleLabel}>0–3 STRUKTURLUECKE</Text>
        </View>
        <View style={styles.scaleItem}>
          <View
            style={[styles.scaleDot, { backgroundColor: getClassificationColor("amber") }]}
          />
          <Text style={styles.scaleLabel}>4–6 TEIL-REIFE</Text>
        </View>
        <View style={styles.scaleItem}>
          <View
            style={[styles.scaleDot, { backgroundColor: getClassificationColor("gruen") }]}
          />
          <Text style={styles.scaleLabel}>7–10 TRAGBAR</Text>
        </View>
      </View>

      <View style={styles.legendSection}>
        <Text style={styles.legendTitle}>MODUL-UEBERSICHT</Text>
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
