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
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, SPACING } from "../theme";
import type { RendererInput } from "../types";
import type { AugmentOutput } from "@/lib/llm/v8-1-augmentation";

interface OutroPageProps {
  input: RendererInput;
  /** 3 Hebel-Bloecke mit LLM-augmentiertem Text (aus augmentEmpfehlungsText im Renderer). */
  augmentedHebel: AugmentOutput[];
  /** Page-Nummer Page 16 (Hero + Cards). Default 16. */
  pageNumberHero?: number;
  /** Page-Nummer Page 17 (Video + CTA + Footer). Default 17. MT-4 implementiert. */
  pageNumberFooter?: number;
}

// MT-2 Placeholder bis MT-3 (Founder-Freigabe der Strategaize-Vorstellungs-
// Absaetze). NICHT live deployen ohne MT-3.
const STRATEGAIZE_VORSTELLUNG_PLACEHOLDER: readonly string[] = [
  "TODO MT-3 — Strategaize-Vorstellungs-Text Absatz 1 (placeholder bis Founder-Freigabe).",
  "TODO MT-3 — Strategaize-Vorstellungs-Text Absatz 2 (placeholder bis Founder-Freigabe).",
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
});

export function OutroPage({
  input,
  augmentedHebel,
  pageNumberHero = 16,
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

      {/* ============ PAGE 17 (Video + CTA + Footer) — MT-4 ============ */}
      {/* MT-4 wird hier Page 17 ergaenzen (Video-Platzhalter + CTA-Hero-Card
          + Strategaize-Footer). Bis MT-4 rendert OutroPage nur 1 Page. */}
    </>
  );
}
