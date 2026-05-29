// V8 SLC-150 MT-2 — SUI-Hero-Page Stub.
//
// MT-2 setzt den Foundation-Wireframe (Score-Hero + Klassifizierung).
// Premium-Polish (Fraunces-Hero-Zahl, Badge-Styling, Background-Gradient)
// kommt in MT-4.

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, PAGE, SPACING, TYPOGRAPHY, getClassificationColor } from "../theme";
import type { RendererInput } from "../types";

interface SuiHeroPageProps {
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
  sectionTitle: {
    fontSize: TYPOGRAPHY.pageTitleSize,
    fontFamily: "Helvetica-Bold",
    marginBottom: SPACING.sm,
  },
  sectionLead: {
    fontSize: TYPOGRAPHY.bodySize,
    lineHeight: TYPOGRAPHY.lineHeight,
    color: COLOR.textMuted,
    marginBottom: SPACING.xl,
    maxWidth: 480,
  },
  heroBlock: {
    backgroundColor: COLOR.bgSlate,
    borderRadius: 8,
    padding: SPACING.xl,
    marginTop: SPACING.sm,
  },
  scoreLabel: {
    fontSize: TYPOGRAPHY.smallSize,
    letterSpacing: 2,
    color: COLOR.brandPrimary,
    fontFamily: "Helvetica-Bold",
    marginBottom: SPACING.sm,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: SPACING.md,
  },
  scoreValue: {
    fontSize: 84,
    fontFamily: "Helvetica-Bold",
    color: COLOR.brandPrimaryDark,
    lineHeight: 1,
  },
  scoreMax: {
    fontSize: 18,
    color: COLOR.textLight,
    marginLeft: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  classBadge: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    color: COLOR.bgWhite,
    fontSize: TYPOGRAPHY.bodySize,
    fontFamily: "Helvetica-Bold",
    marginTop: SPACING.sm,
  },
  meaning: {
    marginTop: SPACING.xl,
    fontSize: TYPOGRAPHY.bodySize,
    lineHeight: TYPOGRAPHY.lineHeight,
    color: COLOR.textDark,
    maxWidth: 480,
  },
});

export function SuiHeroPage({ input }: SuiHeroPageProps) {
  const { snapshot } = input;
  const badgeColor = getClassificationColor(snapshot.classification.color);
  const suiRounded = Math.round(snapshot.sui);
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>ABSCHNITT 1</Text>
      <Text style={styles.sectionTitle}>Ihr SUI-Score auf einen Blick</Text>
      <Text style={styles.sectionLead}>
        Der SUI fasst die Reife Ihrer Firma entlang von neun operativen Modulen
        in einer einzigen Zahl zwischen 0 und 100 zusammen. Er ist eine
        Diagnose — kein Verkaufspreis und keine harte Bewertung.
      </Text>
      <View style={styles.heroBlock}>
        <Text style={styles.scoreLabel}>SUI-SCORE</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreValue}>{suiRounded}</Text>
          <Text style={styles.scoreMax}>/ 100</Text>
        </View>
        <Text style={[styles.classBadge, { backgroundColor: badgeColor }]}>
          {snapshot.classification.label}
        </Text>
        <Text style={styles.meaning}>{snapshot.classification.meaning}</Text>
      </View>
    </Page>
  );
}
