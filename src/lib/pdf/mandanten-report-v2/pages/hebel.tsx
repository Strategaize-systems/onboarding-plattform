// V8 SLC-151 MT-4 — 3-Strategie-Hebel-Page (Page 14).
//
// 1:1-Port aus MANDANTEN_REPORT_PROTOTYP.html Z. 1262-1311
// (Section "TOP-3-EMPFEHLUNGEN").
//
// Layout (Master):
// - Section-Eyebrow "Strategie"
// - Section-Title "Drei Hebel fuer die naechsten 12 Monate"
// - Section-Lead-Paragraph
// - 3 Empfehlungs-Cards vertikal gestapelt:
//   - border-top 4pt in Prio-Farbe (rot/amber/brand-primary)
//   - Header-Row: Badge "Prioritaet N · {Label}" + Modul-Ref "Modul X · Score Y/10"
//   - Card-Title (Fraunces 14pt) = modul_name
//   - Body-Text (Fraunces 10pt) = hebelItem.empfehlung
//
// V8-Unterschied zum Master: Card hat keine separate "steps"-Liste — die
// Empfehlung kommt als einzelner Text-Block aus stufen_lookup (DEC-160).
// Visueller Separator zwischen Bloecken durch Card-Hintergrund + Padding.

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, SPACING } from "../theme";
import {
  formatAllHebelBlocks,
  type HebelBlockRendered,
  type HebelPriority,
} from "../components/hebel-resolvers";
import type { RendererInput } from "../types";

interface HebelPageProps {
  input: RendererInput;
  /** Page-Nummer fuer Footer-Slot (Default 14). */
  pageNumber?: number;
}

const PRIO_COLORS: Record<HebelPriority, { border: string; badgeBg: string; badgeText: string }> = {
  1: {
    border: COLOR.danger,
    badgeBg: "rgb(252, 234, 234)", // pre-multiplied 10% danger on white
    badgeText: COLOR.danger,
  },
  2: {
    border: COLOR.warning,
    badgeBg: "rgb(253, 243, 218)", // pre-multiplied 12% warning on white
    badgeText: COLOR.warningText,
  },
  3: {
    border: COLOR.brandPrimary,
    badgeBg: "rgb(238, 240, 250)", // pre-multiplied 10% brand-primary on white
    badgeText: COLOR.brandPrimaryDark,
  },
};

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

  // Section-Header (konsistent zu hausaufgaben.tsx / modul-profil.tsx)
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
  lead: {
    fontSize: 12,
    lineHeight: 1.55,
    color: COLOR.neutral600,
    marginBottom: SPACING.lg,
    maxWidth: 480,
  },

  // Card-Stack
  cardStack: {
    flexDirection: "column",
    gap: SPACING.md,
  },

  // Card
  card: {
    backgroundColor: COLOR.bgWhite,
    borderTopWidth: 4,
    borderTopStyle: "solid",
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLOR.neutral200,
    borderStyle: "solid",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 8,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 1.4,
  },
  modulRef: {
    fontSize: 8,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 1.2,
    color: COLOR.neutral500,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    lineHeight: 1.3,
    letterSpacing: -0.2,
    marginTop: 4,
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 10,
    fontFamily: "Fraunces",
    color: COLOR.neutral700,
    lineHeight: 1.55,
  },

  // Footer (konsistent zu Phase-A)
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

export function HebelPage({ input, pageNumber = 14 }: HebelPageProps) {
  const { snapshot, mandant } = input;
  const blocks = formatAllHebelBlocks(snapshot.hebel);

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowLine} />
        <Text style={styles.eyebrowLabel}>STRATEGIE</Text>
      </View>
      <Text style={styles.title}>Drei Hebel fuer die naechsten 12 Monate</Text>
      <Text style={styles.lead}>
        Aus den schwaechsten Modulen abgeleitet — priorisiert nach Wirkung
        auf den Bewertungs-Multiplikator. Konkret, mit Verantwortlichkeiten
        und ersten Schritten im Folgegespraech.
      </Text>

      <View style={styles.cardStack}>
        {blocks.map((block: HebelBlockRendered) => {
          const colors = PRIO_COLORS[block.priority];
          return (
            <View
              key={`hebel-${block.priority}`}
              style={[styles.card, { borderTopColor: colors.border }]}
            >
              <View style={styles.cardHeader}>
                <Text
                  style={[
                    styles.badge,
                    {
                      backgroundColor: colors.badgeBg,
                      color: colors.badgeText,
                    },
                  ]}
                >
                  PRIORITAET {block.priority} · {block.priorityLabel.toUpperCase()}
                </Text>
                <Text style={styles.modulRef}>{block.modulRef.toUpperCase()}</Text>
              </View>
              <Text style={styles.cardTitle}>{block.modulName}</Text>
              <Text style={styles.cardBody}>{block.empfehlung}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text>{mandant.name.toUpperCase()}</Text>
        <Text>SEITE {pageNumber} · STRATEGAIZE</Text>
      </View>
    </Page>
  );
}
