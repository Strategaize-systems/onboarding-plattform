// V8 SLC-150 MT-2 — Cover-Page Stub.
//
// MT-2 setzt den Foundation-Wireframe (Hero-Title + Mandant-Slot + Footer).
// Custom-Fonts (Fraunces) + Watermark-Wheel + Premium-Polish kommen in MT-3.

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, PAGE, SPACING, TYPOGRAPHY } from "../theme";
import type { RendererInput } from "../types";

interface CoverPageProps {
  input: RendererInput;
}

const styles = StyleSheet.create({
  page: {
    padding: PAGE.marginPt,
    backgroundColor: COLOR.brandPrimary,
    color: COLOR.bgWhite,
    fontFamily: "Helvetica",
  },
  eyebrow: {
    fontSize: TYPOGRAPHY.smallSize,
    letterSpacing: 2,
    marginBottom: SPACING.lg,
    color: COLOR.bgWhite,
    opacity: 0.75,
  },
  title: {
    fontSize: TYPOGRAPHY.heroTitleSize,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.05,
    marginBottom: SPACING.lg,
  },
  sub: {
    fontSize: TYPOGRAPHY.heroSubtitleSize,
    lineHeight: 1.55,
    marginBottom: SPACING.xl,
    opacity: 0.92,
  },
  mandantCard: {
    borderWidth: 1,
    borderColor: COLOR.bgWhite,
    borderStyle: "solid",
    borderRadius: 4,
    padding: SPACING.lg,
    marginTop: SPACING.lg,
  },
  mandantLabel: {
    fontSize: TYPOGRAPHY.smallSize,
    letterSpacing: 1.5,
    marginBottom: SPACING.xs,
    opacity: 0.7,
  },
  mandantName: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginBottom: SPACING.sm,
  },
  mandantMeta: {
    fontSize: TYPOGRAPHY.bodySize,
    opacity: 0.85,
  },
  footer: {
    position: "absolute",
    bottom: PAGE.marginPt,
    left: PAGE.marginPt,
    right: PAGE.marginPt,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: TYPOGRAPHY.smallSize,
    opacity: 0.85,
  },
  footerLabel: {
    fontSize: 7,
    letterSpacing: 1.5,
    marginBottom: 3,
    opacity: 0.7,
  },
});

export function CoverPage({ input }: CoverPageProps) {
  const { mandant, stb } = input;
  const stbLabel = stb
    ? `${stb.firma}${stb.standort ? ` · ${stb.standort}` : ""}`
    : "StrategAIze";
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>UEBERGABEFAEHIGKEITS-DIAGNOSE · SUI</Text>
      <Text style={styles.title}>
        Wo Ihre Firma heute steht — und was als Naechstes zaehlt.
      </Text>
      <Text style={styles.sub}>
        Eine strukturierte Diagnose entlang der 10 Strategaize-Prinzipien.
        Konkret, vergleichbar, anschlussfaehig.
      </Text>
      <View style={styles.mandantCard}>
        <Text style={styles.mandantLabel}>MANDANT</Text>
        <Text style={styles.mandantName}>{mandant.name}</Text>
        {(mandant.branche || mandant.umsatz) && (
          <Text style={styles.mandantMeta}>
            {[mandant.branche, mandant.umsatz].filter(Boolean).join(" · ")}
          </Text>
        )}
      </View>
      <View style={styles.footer}>
        <View>
          <Text style={styles.footerLabel}>DIAGNOSE-DATUM</Text>
          <Text>{mandant.datum}</Text>
        </View>
        <View>
          <Text style={styles.footerLabel}>EMPFOHLEN DURCH</Text>
          <Text>{stbLabel}</Text>
        </View>
      </View>
    </Page>
  );
}
