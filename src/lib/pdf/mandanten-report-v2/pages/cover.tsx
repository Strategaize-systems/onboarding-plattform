// V8 SLC-150 MT-3 — Cover-Page (Page 1) gemaess
// docs/curriculum/v2/MANDANTEN_REPORT_PROTOTYP.html Page 1.
//
// Layout:
// - Vollflaechiger brand-primary Hintergrund mit dezentem Wheel-Watermark
// - Eyebrow (UEBERGABEFAEHIGKEITS-DIAGNOSE)
// - Hero-Title (Fraunces Bold) mit Akzent-Italic auf "heute steht"
// - Sub-Text (Fraunces Regular)
// - Mandant-Card (transparent border, Fraunces Bold Name)
// - Footer mit Diagnose-Datum (links) + Empfohlen durch (rechts)

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, PAGE, SPACING, TYPOGRAPHY } from "../theme";
import { WatermarkWheel } from "../components/watermark-wheel";
import type { RendererInput } from "../types";

interface CoverPageProps {
  input: RendererInput;
}

const ACCENT = "#F59E0B"; // amber-500 — entspricht prototype --brand-accent

const styles = StyleSheet.create({
  page: {
    padding: PAGE.marginPt,
    backgroundColor: COLOR.brandPrimaryDark,
    color: COLOR.bgWhite,
    fontFamily: "Fraunces",
    fontWeight: 400,
    position: "relative",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    position: "relative",
    zIndex: 2,
  },
  eyebrow: {
    fontSize: TYPOGRAPHY.smallSize,
    letterSpacing: 2,
    marginBottom: SPACING.lg,
    color: COLOR.bgWhite,
    opacity: 0.75,
    fontFamily: "JetBrains Mono",
  },
  title: {
    fontSize: TYPOGRAPHY.heroTitleSize,
    fontFamily: "Fraunces",
    fontWeight: 700,
    lineHeight: 1.08,
    marginBottom: SPACING.lg,
    maxWidth: 460,
  },
  titleAccent: {
    color: ACCENT,
    fontWeight: 400,
  },
  sub: {
    fontSize: TYPOGRAPHY.heroSubtitleSize + 2,
    lineHeight: 1.55,
    marginBottom: SPACING.xl,
    opacity: 0.92,
    maxWidth: 460,
  },
  divider: {
    width: 56,
    height: 2,
    backgroundColor: ACCENT,
    marginVertical: SPACING.lg,
  },
  mandantCard: {
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderStyle: "solid",
    borderRadius: 6,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
    maxWidth: 360,
  },
  mandantLabel: {
    fontSize: 8,
    letterSpacing: 1.5,
    marginBottom: 6,
    opacity: 0.7,
    fontFamily: "JetBrains Mono",
  },
  mandantName: {
    fontSize: 20,
    fontFamily: "Fraunces",
    fontWeight: 700,
    marginBottom: SPACING.sm,
  },
  mandantMetaRow: {
    flexDirection: "row",
    gap: SPACING.lg,
    marginTop: SPACING.xs,
  },
  mandantMetaCell: {
    flexDirection: "column",
  },
  mandantMetaLabel: {
    fontSize: 7,
    letterSpacing: 1.2,
    color: ACCENT,
    marginBottom: 2,
    fontFamily: "JetBrains Mono",
  },
  mandantMetaValue: {
    fontSize: TYPOGRAPHY.bodySize,
    opacity: 0.88,
  },
  footer: {
    position: "absolute",
    bottom: PAGE.marginPt,
    left: PAGE.marginPt,
    right: PAGE.marginPt,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: TYPOGRAPHY.smallSize,
    opacity: 0.92,
    zIndex: 2,
  },
  footerCellRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  footerLabel: {
    fontSize: 7,
    letterSpacing: 1.5,
    marginBottom: 3,
    color: ACCENT,
    fontFamily: "JetBrains Mono",
  },
  footerValue: {
    fontFamily: "Fraunces",
    fontWeight: 700,
  },
});

function formatGermanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function CoverPage({ input }: CoverPageProps) {
  const { mandant, stb, snapshot, options } = input;
  const includeWatermark = options?.includeWatermark !== false;
  const stbLabel = stb
    ? `${stb.firma}${stb.standort ? ` · ${stb.standort}` : ""}`
    : "StrategAIze";
  return (
    <Page size="A4" style={styles.page}>
      {includeWatermark && (
        <WatermarkWheel moduleScores={snapshot.moduleScores} />
      )}
      <View style={styles.content}>
        <Text style={styles.eyebrow}>
          UEBERGABEFAEHIGKEITS-DIAGNOSE · SUI
        </Text>
        <Text style={styles.title}>
          Wo Ihre Firma <Text style={styles.titleAccent}>heute steht</Text> —
          {"\n"}und was als Naechstes zaehlt.
        </Text>
        <Text style={styles.sub}>
          Eine strukturierte Diagnose entlang der 10 Strategaize-Prinzipien.
          Konkret, vergleichbar, anschlussfaehig. Inklusive Empfehlung fuer die
          naechsten 90 Tage.
        </Text>
        <View style={styles.divider} />
        <View style={styles.mandantCard}>
          <Text style={styles.mandantLabel}>MANDANT</Text>
          <Text style={styles.mandantName}>{mandant.name}</Text>
          {(mandant.branche || mandant.umsatz) && (
            <View style={styles.mandantMetaRow}>
              {mandant.branche && (
                <View style={styles.mandantMetaCell}>
                  <Text style={styles.mandantMetaLabel}>BRANCHE</Text>
                  <Text style={styles.mandantMetaValue}>{mandant.branche}</Text>
                </View>
              )}
              {mandant.umsatz && (
                <View style={styles.mandantMetaCell}>
                  <Text style={styles.mandantMetaLabel}>UMSATZ</Text>
                  <Text style={styles.mandantMetaValue}>{mandant.umsatz}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
      <View style={styles.footer}>
        <View>
          <Text style={styles.footerLabel}>DIAGNOSE-DATUM</Text>
          <Text style={styles.footerValue}>{formatGermanDate(mandant.datum)}</Text>
        </View>
        <View style={styles.footerCellRight}>
          <Text style={styles.footerLabel}>EMPFOHLEN DURCH</Text>
          <Text style={styles.footerValue}>{stbLabel}</Text>
        </View>
      </View>
    </Page>
  );
}
