// V8 SLC-150 Polish-Round-1 — SUI-Hero-Page (Page 2) als 1:1-Port der HTML-
// Master-Vorlage MANDANTEN_REPORT_PROTOTYP.html Zeile 84-95 + 393-407.
//
// Layout:
// - Section-Eyebrow mit 26x2 brand-accent-Linie davor + brand-primary-Label
// - Section-Title Fraunces Bold neutral-900
// - Section-Lead neutral-600 max-width
// - sui-hero Grid (Score-Block + Narrative) auf slate-50→slate-100-Gradient-
//   Approx mit border-radius 20pt, padding 36pt, neutral-200 Border
// - SUI-Score-Hero (Fraunces 96pt, brand-primary-dark)
// - Classification-Badge (warning-Background mit white text, pill)
// - Narrative-Title "Was das bedeutet" + Meaning-Text

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, PAGE, SPACING, getClassificationColor } from "../theme";
import type { RendererInput } from "../types";

interface SuiHeroPageProps {
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
  sectionTitle: {
    fontSize: 32,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    marginBottom: SPACING.md,
    lineHeight: 1.15,
    letterSpacing: -0.6,
  },
  sectionLead: {
    fontSize: 13,
    lineHeight: 1.6,
    color: COLOR.neutral600,
    marginBottom: SPACING.xl,
    maxWidth: 480,
    fontFamily: "Fraunces",
    fontWeight: 400,
  },
  heroBlock: {
    flexDirection: "row",
    backgroundColor: "#f4f6fa",
    borderRadius: 20,
    padding: 36,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLOR.neutral200,
    borderStyle: "solid",
    gap: 36,
  },
  scoreCol: {
    flexDirection: "column",
    flex: 1,
  },
  scoreLabel: {
    fontSize: 9,
    letterSpacing: 2.5,
    color: COLOR.brandPrimary,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    marginBottom: SPACING.xs,
  },
  scoreValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: SPACING.md,
  },
  scoreValue: {
    fontSize: 96,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.brandPrimaryDark,
    lineHeight: 1,
    letterSpacing: -3,
  },
  scoreMax: {
    fontSize: 20,
    fontFamily: "Fraunces",
    fontWeight: 400,
    color: COLOR.neutral400,
    marginLeft: SPACING.sm,
    marginBottom: 8,
  },
  classBadge: {
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 999,
    color: COLOR.bgWhite,
    fontSize: 11,
    fontFamily: "Fraunces",
    fontWeight: 700,
    marginTop: SPACING.sm,
    letterSpacing: 0.4,
  },
  narrativeCol: {
    flexDirection: "column",
    flex: 1.3,
  },
  narrativeTitle: {
    fontSize: 22,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    lineHeight: 1.2,
    letterSpacing: -0.3,
    marginBottom: SPACING.sm,
  },
  narrativeBody: {
    fontSize: 12,
    fontFamily: "Fraunces",
    fontWeight: 400,
    lineHeight: 1.6,
    color: COLOR.neutral700,
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

export function SuiHeroPage({ input }: SuiHeroPageProps) {
  const { snapshot, mandant } = input;
  const badgeColor = getClassificationColor(snapshot.classification.color);
  const suiRounded = Math.round(snapshot.sui);
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowLine} />
        <Text style={styles.eyebrowLabel}>DIAGNOSE-ERGEBNIS</Text>
      </View>
      <Text style={styles.sectionTitle}>Ihr SUI auf einen Blick</Text>
      <Text style={styles.sectionLead}>
        Der SUI fasst die Reife Ihrer Firma entlang von neun operativen Modulen
        in einer einzigen Zahl zwischen 0 und 100 zusammen. Er ist eine
        Diagnose — kein Verkaufspreis und keine harte Bewertung.
      </Text>

      <View style={styles.heroBlock}>
        <View style={styles.scoreCol}>
          <Text style={styles.scoreLabel}>SUI-SCORE</Text>
          <View style={styles.scoreValueRow}>
            <Text style={styles.scoreValue}>{suiRounded}</Text>
            <Text style={styles.scoreMax}>/ 100</Text>
          </View>
          <Text style={[styles.classBadge, { backgroundColor: badgeColor }]}>
            {snapshot.classification.label}
          </Text>
        </View>

        <View style={styles.narrativeCol}>
          <Text style={styles.narrativeTitle}>Was das bedeutet</Text>
          <Text style={styles.narrativeBody}>{snapshot.classification.meaning}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text>{mandant.name.toUpperCase()}</Text>
        <Text>SEITE 2 · STRATEGAIZE</Text>
      </View>
    </Page>
  );
}
