// V8 SLC-151 MT-6 — CTA-Folgegespraech-Page (Pages 16-17).
//
// 2-Seiten-CTA-Block am Ende des Mandanten-Reports:
// - Page 16: "Wie geht es jetzt weiter?" Hero + Folgegespraech-Pitch
//   + Call-to-Action mit StB-Kontakt-Slot (Fallback: Strategaize-Default).
// - Page 17: Strategaize-Brand-Footer + Datenschutz/Impressum-Verweis
//   + Datum + Version.
//
// 1:1-Port der HTML-Master-Vorlagen-Blocks
// MANDANTEN_REPORT_PROTOTYP.html Zeile 1332-1352
// (Section "NAECHSTER TERMIN" + Footer ".doc-footer").
//
// Master verwendet linear-gradient-Hero-Block. Da @react-pdf v4 kein
// CSS-Gradient unterstuetzt UND rgba()-Alpha falsch rendert
// (feedback-react-pdf-v4-alpha-bug), wird der Hero-Block mit Solid
// brandPrimaryDark als Background gerendert, Text in white.

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, SPACING } from "../theme";
import type { RendererInput } from "../types";

interface CtaPageProps {
  input: RendererInput;
  /** Page-Nummer Hero. Default 16. */
  pageNumberHero?: number;
  /** Page-Nummer Footer. Default 17. */
  pageNumberFooter?: number;
}

const styles = StyleSheet.create({
  // ============ PAGE 16 (CTA-Hero) ============
  pageHero: {
    paddingTop: 56,
    paddingHorizontal: 48,
    paddingBottom: 56,
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
    fontSize: 36,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    marginBottom: SPACING.md,
    lineHeight: 1.1,
    letterSpacing: -0.7,
  },
  pitch: {
    fontSize: 12,
    lineHeight: 1.6,
    color: COLOR.neutral700,
    marginBottom: SPACING.xl,
    maxWidth: 500,
  },

  // Hero-Card (Master: gradient-hero. Pre-multipliert auf Solid
  // brandPrimaryDark wegen feedback-react-pdf-v4-alpha-bug.)
  heroCard: {
    backgroundColor: COLOR.brandPrimaryDark,
    borderRadius: 12,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  heroEyebrow: {
    fontSize: 8,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 2.2,
    color: COLOR.brandAccent,
    marginBottom: SPACING.sm,
  },
  heroTitle: {
    fontSize: 22,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.bgWhite,
    marginBottom: SPACING.sm,
    lineHeight: 1.2,
    letterSpacing: -0.3,
  },
  heroBody: {
    fontSize: 11,
    lineHeight: 1.6,
    color: COLOR.bgWhite,
    opacity: 0.92,
    maxWidth: 500,
    marginBottom: SPACING.lg,
  },

  // Kontakt-Block (StB oder Strategaize-Default)
  kontaktBlock: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: COLOR.brandPrimary,
    flexDirection: "column",
    gap: 4,
  },
  kontaktEyebrow: {
    fontSize: 8,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 1.8,
    color: COLOR.brandAccent,
    marginBottom: 4,
  },
  kontaktFirma: {
    fontSize: 14,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.bgWhite,
    lineHeight: 1.3,
  },
  kontaktMeta: {
    fontSize: 10,
    fontFamily: "Fraunces",
    fontWeight: 400,
    color: COLOR.bgWhite,
    opacity: 0.85,
    lineHeight: 1.4,
  },

  // ============ PAGE 17 (Strategaize-Footer) ============
  pageFooter: {
    paddingTop: 56,
    paddingHorizontal: 48,
    paddingBottom: 56,
    backgroundColor: COLOR.bgWhite,
    color: COLOR.neutral800,
    fontFamily: "Fraunces",
    fontWeight: 400,
    flexDirection: "column",
    justifyContent: "space-between",
  },

  brandBlock: {
    backgroundColor: COLOR.neutral900,
    borderRadius: 12,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  brandLogoBox: {
    backgroundColor: COLOR.bgWhite,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  brandLogoText: {
    fontSize: 11,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    letterSpacing: -0.3,
  },
  brandLabel: {
    fontSize: 11,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    color: COLOR.bgWhite,
    letterSpacing: 1.8,
  },
  brandTagline: {
    fontSize: 18,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.bgWhite,
    marginBottom: 6,
    letterSpacing: -0.3,
    lineHeight: 1.2,
  },
  brandSubline: {
    fontSize: 10,
    fontFamily: "Fraunces",
    color: COLOR.neutral300,
    lineHeight: 1.5,
    maxWidth: 420,
  },

  legalBlock: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: COLOR.neutral200,
    flexDirection: "column",
    gap: 4,
  },
  legalEyebrow: {
    fontSize: 8,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 1.8,
    color: COLOR.neutral500,
    marginBottom: 4,
  },
  legalLine: {
    fontSize: 9,
    color: COLOR.neutral600,
    lineHeight: 1.5,
  },

  // Footer-Bar unten auf Page 17
  pageFooterBar: {
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

interface KontaktSlot {
  firma: string;
  meta: string;
}

function resolveKontaktSlot(input: RendererInput): KontaktSlot {
  const { stb } = input;
  if (stb) {
    const metaParts = [stb.standort, stb.kontakt_email].filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    return {
      firma: stb.firma,
      meta: metaParts.join(" · "),
    };
  }
  return {
    firma: "StrategAIze",
    meta: "info@strategaize.de",
  };
}

export function CtaPage({
  input,
  pageNumberHero = 16,
  pageNumberFooter = 17,
}: CtaPageProps) {
  const { mandant } = input;
  const kontakt = resolveKontaktSlot(input);

  return (
    <>
      {/* ============ PAGE 16 (CTA-Hero) ============ */}
      <Page size="A4" style={styles.pageHero}>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowLine} />
          <Text style={styles.eyebrowLabel}>NAECHSTER SCHRITT</Text>
        </View>
        <Text style={styles.title}>Wie geht es jetzt weiter?</Text>
        <Text style={styles.pitch}>
          Diese Diagnose ist ein Anfang. Der naechste Schritt ist ein
          Folgegespraech, in dem wir konkret werden — welche drei Bewegungen
          in den naechsten 90 Tagen den groessten Unterschied machen.
        </Text>

        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>FOLGEGESPRAECH</Text>
          <Text style={styles.heroTitle}>
            Bereit fuer das Folgegespraech?
          </Text>
          <Text style={styles.heroBody}>
            Vereinbaren Sie ein 60-Min-Folgegespraech, in dem Sie diese
            Diagnose gemeinsam durchgehen und die Top-3-Empfehlungen in einen
            konkreten 12-Monats-Plan ueberfuehren. Wir bringen die Methodik
            und die Praxisbeispiele mit — Sie bringen Ihre Firma und Ihre
            Fragen.
          </Text>

          <View style={styles.kontaktBlock}>
            <Text style={styles.kontaktEyebrow}>IHR ANSPRECHPARTNER</Text>
            <Text style={styles.kontaktFirma}>{kontakt.firma}</Text>
            {kontakt.meta.length > 0 ? (
              <Text style={styles.kontaktMeta}>{kontakt.meta}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.pageFooterBar}>
          <Text>{mandant.name.toUpperCase()}</Text>
          <Text>SEITE {pageNumberHero} · STRATEGAIZE</Text>
        </View>
      </Page>

      {/* ============ PAGE 17 (Strategaize-Footer) ============ */}
      <Page size="A4" style={styles.pageFooter}>
        <View style={styles.brandBlock}>
          <View style={styles.brandRow}>
            <View style={styles.brandLogoBox}>
              <Text style={styles.brandLogoText}>StrategAIze</Text>
            </View>
            <Text style={styles.brandLabel}>POWERED BY</Text>
          </View>
          <Text style={styles.brandTagline}>
            Uebergabefaehigkeits-Diagnose V8.0
          </Text>
          <Text style={styles.brandSubline}>
            Wir helfen Unternehmern, ihre Firma uebergabefaehig zu machen —
            ueber Strategie, Fuehrung, Strukturen und Finanzen hinweg. Ohne
            Verkaufs-Druck, ohne Pauschal-Antworten.
          </Text>

          <View style={styles.legalBlock}>
            <Text style={styles.legalEyebrow}>RECHTLICHES</Text>
            <Text style={styles.legalLine}>
              Datenschutz: strategaize.de/datenschutz · Impressum:
              strategaize.de/impressum
            </Text>
            <Text style={styles.legalLine}>
              Vertraulich. Nur fuer den Mandanten bestimmt.
            </Text>
          </View>
        </View>

        <View style={styles.pageFooterBar}>
          <Text>
            Strategaize Uebergabefaehigkeits-Diagnose V8.0 · {mandant.datum}
          </Text>
          <Text>SEITE {pageNumberFooter} · STRATEGAIZE</Text>
        </View>
      </Page>
    </>
  );
}
