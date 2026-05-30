// V8.1 SLC-162 — Lead-Conversion-Outro-Renderer (Pages 16-17).
//
// Ersetzt V8.0-CtaPage per DEC-170. 4-Block-Section uebernimmt die
// CTA-Funktion mit substantiellerer Pre-Selling-Tonalitaet (DEC-171).
//
// Page 16 (MT-2 + MT-3):
//   - Eyebrow "UEBER STRATEGAIZE" + Title "Wir holen Sie ab"
//   - 2-3 Absaetze Strategaize-Vorstellung (MT-3: Founder-Freigabe-Text)
//   - Section-Header "Drei Bewegungen, die in Ihrem Unternehmen den
//     Unterschied machen"
//   - 3 Verkaufs-Style-Cards (DEC-171): Modul-Name + Aktuelle-Stufe-Badge
//     + LLM-augmentierter Empfehlungs-Text + Strategaize-Akzent-Border-Bottom
//
// Page 17 (MT-4): Video-Platzhalter + CTA-Hero-Card + Strategaize-Footer.
//
// Visual-Differenzierung zu V8.0-HebelPage (Page 14): Hebel ist Diagnose-Output
// (Border-Top = Prio-Color, kleinere Cards), Outro ist Pre-Selling
// (Border-Bottom = Strategaize-Akzent, groessere Cards, mehr Padding).

import React from "react";
import { Page, View, Text, Link, StyleSheet } from "@react-pdf/renderer";

import { COLOR, SPACING } from "../theme";
import type { RendererInput } from "../types";
import type { AugmentOutput } from "@/lib/llm/v8-1-augmentation";

/**
 * SLC-163 ersetzt diesen Default-Wert mit einer signierten HMAC-Magic-Link-URL.
 * Bis dahin rendert die CTA mit dem Placeholder — keine externe Aktion moeglich.
 */
export const CTA_PLACEHOLDER_URL = "#cta-magic-link-token-replaced-in-slc163";

interface OutroPageProps {
  input: RendererInput;
  /** 3 Hebel-Bloecke mit LLM-augmentiertem Text (aus augmentEmpfehlungsText im Renderer). */
  augmentedHebel: AugmentOutput[];
  /**
   * Magic-Link-URL fuer den CTA-Button. SLC-163 injiziert hier den HMAC-Token.
   * Default = CTA_PLACEHOLDER_URL fuer V8.1-Pre-SLC-163-Smoke-Tests.
   */
  magicLinkUrl?: string;
  /** Page-Nummer Page 16 (Hero + Cards). Default 16. */
  pageNumberHero?: number;
  /** Page-Nummer Page 17 (Video + CTA + Footer). Default 17. */
  pageNumberFooter?: number;
}

// MT-2 Placeholder bis MT-3 (redaktionelle Freigabe der Strategaize-
// Vorstellungs-Absaetze). NICHT live deployen ohne MT-3.
// Bewusst sauber gehalten damit Tonality-Audit (MT-7) auf 0 Treffer laeuft —
// der "Placeholder"-Marker bleibt im Code-Kommentar oberhalb.
const STRATEGAIZE_VORSTELLUNG_PLACEHOLDER: readonly string[] = [
  "Platzhalter — bis zur redaktionellen Freigabe steht hier der erste Strategaize-Vorstellungs-Absatz in Wir-Voice.",
  "Platzhalter — bis zur redaktionellen Freigabe steht hier der zweite Strategaize-Vorstellungs-Absatz in Wir-Voice.",
];

const styles = StyleSheet.create({
  // ============ PAGE 16 (Strategaize-Vorstellung + 3 Empfehlungs-Cards) ============
  pageHero: {
    paddingTop: 56,
    paddingHorizontal: 48,
    paddingBottom: 56,
    backgroundColor: COLOR.bgWhite,
    color: COLOR.neutral800,
    fontFamily: "Fraunces",
    fontWeight: 400,
  },

  // Section-Header (konsistent zu hebel.tsx / hausaufgaben.tsx)
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

  // Strategaize-Vorstellungs-Absaetze
  vorstellungParagraph: {
    fontSize: 11,
    lineHeight: 1.6,
    color: COLOR.neutral700,
    marginBottom: SPACING.sm,
    maxWidth: 480,
  },

  // Section-Header fuer die 3 Bewegungen
  drittBewegungenHeader: {
    fontSize: 14,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
    lineHeight: 1.3,
    letterSpacing: -0.2,
  },

  // Card-Stack (3 Empfehlungs-Cards vertikal, DEC-171 Verkaufs-Style)
  cardStack: {
    flexDirection: "column",
    gap: SPACING.outroSectionGap,
  },

  // Card (DEC-171: groesser als V8.0-Hebel-Cards, Akzent-Border-Bottom)
  card: {
    backgroundColor: COLOR.outro.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLOR.outro.cardBorder,
    borderBottomWidth: 3,
    borderBottomColor: COLOR.outro.accent,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    flexWrap: "wrap",
  },
  cardModulName: {
    fontSize: 13,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    lineHeight: 1.25,
    letterSpacing: -0.2,
    flexShrink: 1,
    paddingRight: SPACING.sm,
  },
  badgeAktuelleStufe: {
    backgroundColor: COLOR.outro.badgeAktuelleStufeBg,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 8,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 1.2,
    color: COLOR.neutral600,
  },
  cardBody: {
    fontSize: 10,
    fontFamily: "Fraunces",
    color: COLOR.neutral700,
    lineHeight: 1.55,
    marginTop: 4,
  },

  // Footer (konsistent zu Phase-A/Phase-B)
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

  // ============ PAGE 17 (Video-Platzhalter + CTA + Strategaize-Footer) ============
  pageFooterContainer: {
    paddingTop: 56,
    paddingHorizontal: 48,
    paddingBottom: 56,
    backgroundColor: COLOR.bgWhite,
    color: COLOR.neutral800,
    fontFamily: "Fraunces",
    fontWeight: 400,
    flexDirection: "column",
  },

  // Video-Platzhalter-Box (Strategaize-Brand-Box analog cta.tsx brandBlock)
  videoBox: {
    backgroundColor: COLOR.outro.videoBoxBg,
    borderRadius: 12,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    flexDirection: "column",
    alignItems: "flex-start",
    marginBottom: SPACING.lg,
  },
  videoBoxLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  videoBoxLogoBox: {
    backgroundColor: COLOR.bgWhite,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  videoBoxLogoText: {
    fontSize: 11,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    letterSpacing: -0.3,
  },
  videoBoxLabel: {
    fontSize: 9,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    color: COLOR.brandAccent,
    letterSpacing: 1.8,
  },
  videoBoxTagline: {
    fontSize: 16,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.bgWhite,
    lineHeight: 1.3,
    letterSpacing: -0.3,
  },
  videoBoxSubline: {
    fontSize: 10,
    fontFamily: "Fraunces",
    color: COLOR.neutral300,
    marginTop: 4,
    lineHeight: 1.5,
  },

  // CTA-Hero-Card (brandPrimaryDark, analog V8.0-CtaPage heroCard)
  ctaHeroCard: {
    backgroundColor: COLOR.brandPrimaryDark,
    borderRadius: 12,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  ctaEyebrow: {
    fontSize: 8,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 2.2,
    color: COLOR.brandAccent,
    marginBottom: SPACING.sm,
  },
  ctaTitle: {
    fontSize: 22,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.bgWhite,
    marginBottom: SPACING.sm,
    lineHeight: 1.2,
    letterSpacing: -0.3,
  },
  ctaBody: {
    fontSize: 11,
    lineHeight: 1.6,
    color: COLOR.bgWhite,
    opacity: 0.92,
    maxWidth: 460,
    marginBottom: SPACING.md,
  },
  ctaButton: {
    backgroundColor: COLOR.brandAccent,
    color: COLOR.brandPrimaryDark,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    fontSize: 11,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 1.4,
    textDecoration: "none",
    alignSelf: "flex-start",
    marginTop: 4,
  },
  ctaBestaetigung: {
    fontSize: 9,
    color: COLOR.bgWhite,
    opacity: 0.8,
    marginTop: SPACING.md,
    fontFamily: "Fraunces",
  },

  // Strategaize-Brand-Footer (Copy-Adapt aus cta.tsx Page 17 brandBlock — Default
  // per slice-spec R2: Copy-Adapt statt Refactor zu shared Component).
  brandFooterBlock: {
    backgroundColor: COLOR.neutral900,
    borderRadius: 12,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  brandFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  brandFooterLogoBox: {
    backgroundColor: COLOR.bgWhite,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  brandFooterLogoText: {
    fontSize: 11,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    letterSpacing: -0.3,
  },
  brandFooterLabel: {
    fontSize: 9,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    color: COLOR.bgWhite,
    letterSpacing: 1.8,
  },
  brandFooterTagline: {
    fontSize: 14,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.bgWhite,
    marginBottom: 4,
    letterSpacing: -0.2,
    lineHeight: 1.2,
  },
  brandFooterSubline: {
    fontSize: 9,
    fontFamily: "Fraunces",
    color: COLOR.neutral300,
    lineHeight: 1.5,
    maxWidth: 420,
  },
  brandFooterLegalBlock: {
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: COLOR.neutral200,
    flexDirection: "column",
    gap: 4,
  },
  brandFooterLegalEyebrow: {
    fontSize: 7,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 1.8,
    color: COLOR.neutral500,
    marginBottom: 4,
  },
  brandFooterLegalLine: {
    fontSize: 8,
    color: COLOR.neutral600,
    lineHeight: 1.5,
  },
});

export function OutroPage({
  input,
  augmentedHebel,
  magicLinkUrl = CTA_PLACEHOLDER_URL,
  pageNumberHero = 16,
  pageNumberFooter = 17,
}: OutroPageProps) {
  if (augmentedHebel.length !== 3) {
    throw new Error(
      `OutroPage: expected exactly 3 augmentedHebel, got ${augmentedHebel.length}`,
    );
  }
  const { mandant } = input;

  return (
    <>
      {/* ============ PAGE 16 (Strategaize-Vorstellung + 3 Empfehlungs-Cards) ============ */}
      <Page size="A4" style={styles.pageHero}>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowLine} />
          <Text style={styles.eyebrowLabel}>UEBER STRATEGAIZE</Text>
        </View>
        <Text style={styles.title}>Wir holen Sie ab</Text>

        {STRATEGAIZE_VORSTELLUNG_PLACEHOLDER.map((paragraph, idx) => (
          <Text
            key={`vorstellung-${idx}`}
            style={styles.vorstellungParagraph}
          >
            {paragraph}
          </Text>
        ))}

        <Text style={styles.drittBewegungenHeader}>
          Drei Bewegungen, die in Ihrem Unternehmen den Unterschied machen
        </Text>

        <View style={styles.cardStack}>
          {augmentedHebel.map((hebel, idx) => (
            <View key={`outro-card-${idx}`} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardModulName}>{hebel.modulName}</Text>
                <Text style={styles.badgeAktuelleStufe}>
                  AKTUELLE STUFE: {hebel.aktuelleStufe}/5
                </Text>
              </View>
              <Text style={styles.cardBody}>{hebel.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>{mandant.name.toUpperCase()}</Text>
          <Text>SEITE {pageNumberHero} · STRATEGAIZE</Text>
        </View>
      </Page>

      {/* ============ PAGE 17 (Video-Platzhalter + CTA-Hero + Strategaize-Footer) ============ */}
      <Page size="A4" style={styles.pageFooterContainer}>
        {/* Video-Platzhalter mit Strategaize-Brand-Visual */}
        <View style={styles.videoBox}>
          <View style={styles.videoBoxLogoRow}>
            <View style={styles.videoBoxLogoBox}>
              <Text style={styles.videoBoxLogoText}>StrategAIze</Text>
            </View>
            <Text style={styles.videoBoxLabel}>WIE WIR ARBEITEN</Text>
          </View>
          <Text style={styles.videoBoxTagline}>
            Video folgt in Kuerze
          </Text>
          <Text style={styles.videoBoxSubline}>
            Wir zeigen Ihnen, wie Strategaize Unternehmer-Uebergaben
            begleitet — ohne Pricing-Druck, ohne Verkaufs-Logik.
          </Text>
        </View>

        {/* CTA-Hero-Card mit Magic-Link-Button */}
        <View style={styles.ctaHeroCard}>
          <Text style={styles.ctaEyebrow}>NAECHSTER SCHRITT</Text>
          <Text style={styles.ctaTitle}>
            Lassen Sie uns reden — unverbindlich, ohne Pricing-Druck
          </Text>
          <Text style={styles.ctaBody}>
            Strategaize meldet sich nach Ihrer Anfrage und stimmt mit Ihnen
            einen Termin ab, in dem wir Ihre Diagnose gemeinsam durchgehen.
            Kein Verkaufs-Druck, keine Pauschal-Antworten.
          </Text>
          <Link src={magicLinkUrl} style={styles.ctaButton}>
            MIT STRATEGAIZE SPRECHEN
          </Link>
          <Text style={styles.ctaBestaetigung}>
            Strategaize meldet sich innerhalb von 2 Werktagen.
          </Text>
        </View>

        {/* Strategaize-Brand-Footer (Copy-Adapt aus cta.tsx) */}
        <View style={styles.brandFooterBlock}>
          <View style={styles.brandFooterRow}>
            <View style={styles.brandFooterLogoBox}>
              <Text style={styles.brandFooterLogoText}>StrategAIze</Text>
            </View>
            <Text style={styles.brandFooterLabel}>POWERED BY</Text>
          </View>
          <Text style={styles.brandFooterTagline}>
            Uebergabefaehigkeits-Diagnose V8.1
          </Text>
          <Text style={styles.brandFooterSubline}>
            Wir helfen Unternehmern, ihre Firma uebergabefaehig zu machen —
            ueber Strategie, Fuehrung, Strukturen und Finanzen hinweg.
          </Text>

          <View style={styles.brandFooterLegalBlock}>
            <Text style={styles.brandFooterLegalEyebrow}>RECHTLICHES</Text>
            <Text style={styles.brandFooterLegalLine}>
              Datenschutz: strategaize.de/datenschutz · Impressum:
              strategaize.de/impressum
            </Text>
            <Text style={styles.brandFooterLegalLine}>
              Vertraulich. Nur fuer den Mandanten bestimmt.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>
            Strategaize Uebergabefaehigkeits-Diagnose V8.1 · {mandant.datum}
          </Text>
          <Text>SEITE {pageNumberFooter} · STRATEGAIZE</Text>
        </View>
      </Page>
    </>
  );
}
