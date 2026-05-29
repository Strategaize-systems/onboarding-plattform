// V8 SLC-150 MT-2 — Modul-Profil-Page Stub.
//
// MT-2 setzt den Foundation-Wireframe (Header + Wheel + Legende-Grid).
// Premium-Polish (Section-Eyebrow, Lead-Text, Layout-Verfeinerung) kommt
// in MT-5.

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, PAGE, SPACING, TYPOGRAPHY } from "../theme";
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
    fontFamily: "Helvetica",
  },
  eyebrow: {
    fontSize: TYPOGRAPHY.smallSize,
    letterSpacing: 2,
    marginBottom: SPACING.sm,
    color: COLOR.textMuted,
  },
  title: {
    fontSize: TYPOGRAPHY.pageTitleSize,
    fontFamily: "Helvetica-Bold",
    marginBottom: SPACING.sm,
  },
  lead: {
    fontSize: TYPOGRAPHY.bodySize,
    lineHeight: TYPOGRAPHY.lineHeight,
    color: COLOR.textMuted,
    marginBottom: SPACING.xl,
    maxWidth: 480,
  },
  wheelWrap: {
    alignItems: "center",
    marginBottom: SPACING.xl,
  },
  legendTitle: {
    fontSize: TYPOGRAPHY.sectionHeaderSize,
    fontFamily: "Helvetica-Bold",
    marginBottom: SPACING.md,
    color: COLOR.textDark,
  },
});

export function ModulProfilPage({ input }: ModulProfilPageProps) {
  const { snapshot, moduleNames } = input;
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>ABSCHNITT 2</Text>
      <Text style={styles.title}>Ihr Modul-Profil</Text>
      <Text style={styles.lead}>
        Neun Module zeigen, wo Ihre Uebergabe-Faehigkeit heute steht. Jeder
        Sektor im Rad steht fuer ein Modul, die Laenge des Sektors fuer
        dessen Score 0–10.
      </Text>
      <View style={styles.wheelWrap}>
        <Wheel moduleScores={snapshot.moduleScores} size={280} />
      </View>
      <Text style={styles.legendTitle}>Modul-Uebersicht</Text>
      <WheelLegend
        moduleScores={snapshot.moduleScores}
        moduleNames={moduleNames}
      />
    </Page>
  );
}
