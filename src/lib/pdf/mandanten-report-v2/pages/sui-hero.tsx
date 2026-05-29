// V8 SLC-150 MT-4 — SUI-Hero-Page (Page 2) gemaess
// docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html Page 2.
//
// Layout:
// - Section-Header: Eyebrow + Title + Long-Form-Lead
// - Hero-Block (slate-50 Background): Score-Label + grosse Score-Hero-Zahl
//   (Fraunces Bold ~96pt) + Klassifizierungs-Badge (Pill-Form mit Farbe) +
//   Meaning-Long-Form-Text
// - Subline: Strategaize-Methodik-Anchor

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
  sectionTitle: {
    fontSize: 30,
    fontFamily: "Fraunces",
    fontWeight: 700,
    marginBottom: SPACING.md,
    color: COLOR.brandPrimaryDark,
    letterSpacing: -0.5,
  },
  sectionLead: {
    fontSize: TYPOGRAPHY.bodySize + 1,
    lineHeight: 1.6,
    color: COLOR.textMuted,
    marginBottom: SPACING.xl,
    maxWidth: 480,
  },
  heroBlock: {
    backgroundColor: COLOR.bgSlate,
    borderRadius: 10,
    padding: SPACING.xxl,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLOR.borderSlate,
    borderStyle: "solid",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xxl,
    marginBottom: SPACING.lg,
  },
  scoreCol: {
    flexDirection: "column",
  },
  scoreLabel: {
    fontSize: 9,
    letterSpacing: 2.5,
    color: COLOR.brandPrimary,
    fontFamily: "JetBrains Mono",
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
    fontSize: 22,
    fontFamily: "Fraunces",
    fontWeight: 400,
    color: COLOR.textLight,
    marginLeft: SPACING.sm,
    marginBottom: SPACING.md,
  },
  classBadge: {
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 999,
    color: COLOR.bgWhite,
    fontSize: 12,
    fontFamily: "Fraunces",
    fontWeight: 700,
    marginTop: SPACING.xs,
    letterSpacing: 0.5,
  },
  meaningBlock: {
    marginTop: SPACING.xl,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLOR.borderSlate,
    borderTopStyle: "solid",
  },
  meaningLabel: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: COLOR.textMuted,
    fontFamily: "JetBrains Mono",
    marginBottom: SPACING.xs,
  },
  meaning: {
    fontSize: TYPOGRAPHY.bodySize + 1,
    lineHeight: 1.55,
    color: COLOR.textDark,
    fontFamily: "Fraunces",
    fontWeight: 400,
    maxWidth: 460,
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

export function SuiHeroPage({ input }: SuiHeroPageProps) {
  const { snapshot, mandant } = input;
  const badgeColor = getClassificationColor(snapshot.classification.color);
  const suiRounded = Math.round(snapshot.sui);
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>ABSCHNITT 1 · UEBERGABEFAEHIGKEIT</Text>
      <Text style={styles.sectionTitle}>Ihr SUI-Score auf einen Blick</Text>
      <Text style={styles.sectionLead}>
        Der SUI fasst die Reife Ihrer Firma entlang von neun operativen Modulen
        in einer einzigen Zahl zwischen 0 und 100 zusammen. Er ist eine
        Diagnose — kein Verkaufspreis und keine harte Bewertung.
      </Text>

      <View style={styles.heroBlock}>
        <View style={styles.heroRow}>
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
        </View>

        <View style={styles.meaningBlock}>
          <Text style={styles.meaningLabel}>UNSERE EINORDNUNG</Text>
          <Text style={styles.meaning}>{snapshot.classification.meaning}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text>{mandant.name.toUpperCase()}</Text>
        <Text>SEITE 2 · STRATEGAIZE</Text>
      </View>
    </Page>
  );
}
