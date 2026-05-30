// V8 SLC-151 MT-5 — Reflexion-Page (Page 15).
//
// 1:1-Port des HTML-Master-Vorlagen-Blocks
// MANDANTEN_REPORT_PROTOTYP.html Zeile 1313-1335
// (Section "MODUL 10 REFLEXION").
//
// Layout (Master):
// - Section-Eyebrow "Persoenlicher Anhang · Modul 10"
// - Section-Title "Vermaechtnis und persoenliche Reife"
// - Section-Lead-Paragraph (Modul 10 hat keinen Score)
// - Reflexion-Container (subtile Indigo-Gradient-Karte) mit Stack von
//   Frage-Antwort-Items: weisse Card mit border-left brand-accent, Frage
//   in Italic-Akzent (Color+Weight, KEIN fontStyle wegen
//   feedback-react-pdf-v4-fontstyle-requires-variant), Antwort als
//   Quote-Block darunter mit Indent.
// - Empty-State (snapshot.reflexionen.length === 0) zeigt gross-formatierte
//   Pitch-Karte: "Reflexion offen — diskutieren wir im Folgegespraech".

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, SPACING } from "../theme";
import type { RendererInput } from "../types";

interface ReflexionPageProps {
  input: RendererInput;
  /** Page-Nummer fuer Footer-Slot (Default 15). */
  pageNumber?: number;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingHorizontal: 48,
    paddingBottom: 56,
    backgroundColor: COLOR.bgWhite,
    color: COLOR.neutral800,
    fontFamily: "Fraunces",
    fontWeight: 400,
  },

  // Section-Header (konsistent zu hausaufgaben.tsx / hebel.tsx)
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
    fontSize: 28,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    marginBottom: SPACING.sm,
    lineHeight: 1.15,
    letterSpacing: -0.5,
  },
  lead: {
    fontSize: 11,
    lineHeight: 1.5,
    color: COLOR.neutral600,
    marginBottom: SPACING.md,
    maxWidth: 480,
  },

  // Reflexion-Container (Master: linear-gradient #f8fafd → #eef0fa)
  // Pre-multipliert auf eine ruhige Indigo-Pastel-Flaeche (rgba(68,84,184,0.04)
  // auf bgWhite gemischt) → COLOR.neutral100 entspricht visuell dem Master-
  // Hover-Ton, ohne Gradient-Risiko in @react-pdf.
  reflexionContainer: {
    backgroundColor: COLOR.neutral100,
    borderRadius: 12,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: COLOR.neutral200,
  },

  itemStack: {
    flexDirection: "column",
    gap: SPACING.sm,
  },

  // Frage-Antwort-Item: weisse Card mit border-left brand-accent.
  // Item-Padding bewusst kompakt damit 4-5 Items + Section-Header + Footer
  // auf eine A4-Seite passen (AC-SLC-151-2 = exakt 17 Seiten).
  item: {
    backgroundColor: COLOR.bgWhite,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: COLOR.brandAccent,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },

  // Frage als Italic-Akzent via Color+Weight (feedback-react-pdf-v4-
  // fontstyle-requires-variant: kein fontStyle:italic ohne registrierte
  // italic-Variante). Master-CSS: font-style:italic, color: neutral-700.
  // Italic-Akzent hier ueber Color brandPrimary + lighter Weight gewahrt.
  frageText: {
    fontSize: 9.5,
    lineHeight: 1.4,
    color: COLOR.brandPrimary,
    fontFamily: "Fraunces",
    fontWeight: 400,
    marginBottom: 6,
  },

  // Antwort als Quote-Block: Indent + Quote-Marks-Decoration ueber
  // gross-formatiertem Text.
  antwortBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  quoteMark: {
    fontSize: 22,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.brandAccent,
    lineHeight: 1,
    marginRight: 6,
    marginTop: 0,
  },
  antwortText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 1.5,
    color: COLOR.neutral800,
    fontFamily: "Fraunces",
    fontWeight: 400,
  },

  // Empty-State (Pitch-Karte, gross formatiert)
  emptyCard: {
    marginTop: SPACING.lg,
    backgroundColor: COLOR.neutral100,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftStyle: "solid",
    borderLeftColor: COLOR.brandPrimary,
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    alignItems: "center",
  },
  emptyEyebrow: {
    fontSize: 9,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 2.2,
    color: COLOR.brandPrimary,
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    textAlign: "center",
    marginBottom: SPACING.md,
    letterSpacing: -0.4,
    lineHeight: 1.2,
  },
  emptyBody: {
    fontSize: 11,
    fontFamily: "Fraunces",
    color: COLOR.neutral600,
    lineHeight: 1.55,
    textAlign: "center",
    maxWidth: 400,
  },

  // Footer
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

export function ReflexionPage({ input, pageNumber = 15 }: ReflexionPageProps) {
  const { snapshot, mandant } = input;
  const items = snapshot.reflexionen;
  const hasItems = items.length > 0;

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowLine} />
        <Text style={styles.eyebrowLabel}>
          PERSOENLICHER ANHANG · MODUL 10
        </Text>
      </View>
      <Text style={styles.title}>Vermaechtnis und persoenliche Reife</Text>
      <Text style={styles.lead}>
        Modul 10 hat keinen Score. Es sind Reflexions-Fragen, die Sie in
        eigenen Worten fuer sich beantworten — nicht im Erstgespraech,
        sondern wenn Vertrauen aufgebaut ist und die operative Diagnose
        laeuft.
      </Text>

      {hasItems ? (
        <View style={styles.reflexionContainer}>
          <View style={styles.itemStack}>
            {items.map((item) => (
              <View key={item.frage_id} style={styles.item}>
                <Text style={styles.frageText}>{item.frage_text}</Text>
                <View style={styles.antwortBlock}>
                  <Text style={styles.quoteMark}>&ldquo;</Text>
                  <Text style={styles.antwortText}>{item.antwort_text}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEyebrow}>REFLEXION OFFEN</Text>
          <Text style={styles.emptyTitle}>
            Reflexion offen — diskutieren wir im Folgegespraech.
          </Text>
          <Text style={styles.emptyBody}>
            Modul 10 ist bewusst nicht im Teaser ausgefuellt. Die persoenlichen
            Fragen zu Vermaechtnis und Identitaet nach der Uebergabe
            besprechen wir, wenn Vertrauen aufgebaut ist — nicht in der
            Erst-Diagnose.
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text>{mandant.name.toUpperCase()}</Text>
        <Text>SEITE {pageNumber} · STRATEGAIZE</Text>
      </View>
    </Page>
  );
}
