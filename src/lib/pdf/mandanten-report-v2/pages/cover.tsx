// V8 SLC-150 Polish-Round-1 — Cover-Page (Page 1) als 1:1-Port der HTML-
// Master-Vorlage MANDANTEN_REPORT_PROTOTYP.html Zeile 51-71 + 360-390.
//
// Background: brand-deep Solid (#0a0641) — Master nutzt Gradient
// (#0a0641 → #120774 → #4454b8), @react-pdf rendert das nicht direkt,
// brand-deep als visuelles Anker-Setting.
// Accent: brand-accent gruen (#4dcb8b) durchgehend (NICHT amber).

import React from "react";
import path from "node:path";
import { readFileSync } from "node:fs";
import { Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

import { COLOR, PAGE, SPACING } from "../theme";
import type { RendererInput } from "../types";

// Lazy-load Logo-PNG as Buffer (@react-pdf v4 Image-src accepts Buffer
// reliably; relative paths via process.cwd() drift between dev/test/prod).
let LOGO_BUFFER_CACHE: Buffer | null = null;
function getLogoBuffer(): Buffer {
  if (LOGO_BUFFER_CACHE === null) {
    const logoPath = path.join(process.cwd(), "public", "brand", "logo-full.png");
    LOGO_BUFFER_CACHE = readFileSync(logoPath);
  }
  return LOGO_BUFFER_CACHE;
}

interface CoverPageProps {
  input: RendererInput;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingHorizontal: 48,
    paddingBottom: 48,
    backgroundColor: COLOR.brandDeep,
    color: COLOR.bgWhite,
    fontFamily: "Fraunces",
    fontWeight: 400,
  },
  brand: {
    alignItems: "center",
    marginBottom: SPACING.xxl,
  },
  brandPill: {
    backgroundColor: COLOR.bgWhite,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  brandLogo: {
    height: 36,
    width: "auto",
  },
  contentBlock: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: 2.5,
    marginBottom: SPACING.lg,
    color: COLOR.bgWhite,
    opacity: 0.75,
    fontFamily: "JetBrains Mono",
    fontWeight: 400,
  },
  title: {
    fontSize: 38,
    fontFamily: "Fraunces",
    fontWeight: 700,
    lineHeight: 1.08,
    letterSpacing: -0.5,
    marginBottom: SPACING.lg,
    maxWidth: 480,
  },
  titleAccent: {
    color: COLOR.brandAccent,
    fontWeight: 400,
  },
  sub: {
    fontSize: 13,
    lineHeight: 1.55,
    marginBottom: SPACING.xl,
    opacity: 0.92,
    fontWeight: 400,
    maxWidth: 460,
  },
  divider: {
    width: 60,
    height: 3,
    backgroundColor: COLOR.brandAccent,
    borderRadius: 2,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  mandantCard: {
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderStyle: "solid",
    borderRadius: 14,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    maxWidth: 460,
  },
  mandantLabel: {
    fontSize: 8,
    letterSpacing: 1.8,
    marginBottom: SPACING.sm,
    opacity: 0.7,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
  },
  mandantName: {
    fontSize: 24,
    fontFamily: "Fraunces",
    fontWeight: 700,
    marginBottom: SPACING.md,
    letterSpacing: -0.25,
  },
  mandantMetaRow: {
    flexDirection: "row",
    gap: SPACING.xl,
    marginTop: SPACING.sm,
  },
  mandantMetaCell: {
    flexDirection: "column",
  },
  mandantMetaLabel: {
    fontSize: 7,
    letterSpacing: 1.5,
    color: COLOR.brandAccent,
    marginBottom: 3,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
  },
  mandantMetaValue: {
    fontSize: 12,
    opacity: 0.88,
    fontFamily: "Fraunces",
    fontWeight: 400,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: SPACING.xl,
  },
  footerCellRight: {
    alignItems: "flex-end",
  },
  footerLabel: {
    fontSize: 7,
    letterSpacing: 1.5,
    marginBottom: 4,
    color: COLOR.brandAccent,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
  },
  footerValue: {
    fontSize: 11,
    fontFamily: "Fraunces",
    fontWeight: 400,
    opacity: 0.92,
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
  const { mandant, stb } = input;
  const stbLabel = stb
    ? `${stb.firma}${stb.standort ? ` · ${stb.standort}` : ""}`
    : "StrategAIze";
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.brand}>
        <View style={styles.brandPill}>
          <Image src={getLogoBuffer()} style={styles.brandLogo} />
        </View>
      </View>

      <View style={styles.contentBlock}>
        <Text style={styles.eyebrow}>
          UEBERGABEFAEHIGKEITS-DIAGNOSE · SUI
        </Text>
        <Text style={styles.title}>
          Wo Ihre Firma <Text style={styles.titleAccent}>heute steht</Text> —{"\n"}
          und was als Naechstes zaehlt.
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
