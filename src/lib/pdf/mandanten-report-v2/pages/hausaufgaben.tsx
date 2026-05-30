// V8 SLC-151 MT-3 — Hausaufgaben-Page (Page 13).
//
// 1:1-Port des HTML-Master-Vorlagen-Blocks
// MANDANTEN_REPORT_PROTOTYP.html Zeile 1231-1260
// (Section "MODUL 0 — HAUSAUFGABEN").
//
// Layout (Master):
// - Section-Eyebrow "Vor-Verkauf-Hygiene · Modul 0"
// - Section-Title "Rechtliche & strukturelle Hausaufgaben"
// - Section-Lead-Paragraph
// - Stack von Hausaufgabe-Cards mit border-left rot (nein) / amber (teilweise),
//   Icon-Kreis "!" links + Title + Fix-Text rechts.
// - Empty-State (snapshot.hausaufgaben.length === 0) zeigt
//   Gratulations-Pitch statt leere Card-Liste.

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import { COLOR, SPACING } from "../theme";
import { getHausaufgabenItemsWithErlaeuterung } from "../components/hausaufgaben-resolvers";
import type { RendererInput } from "../types";

interface HausaufgabenPageProps {
  input: RendererInput;
  /** Page-Nummer fuer Footer-Slot (Default 13). */
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

  // Section-Header (konsistent zu modul-profil.tsx)
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

  // Stack of cards
  listStack: {
    flexDirection: "column",
    gap: SPACING.md,
  },

  // Card (Master: border-left 3pt, padding 14pt 18pt, bg-white)
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: COLOR.bgWhite,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  cardNein: {
    borderLeftColor: COLOR.danger,
    backgroundColor: "rgb(252, 240, 240)", // pre-multiplied 8% danger on white
  },
  cardTeilweise: {
    borderLeftColor: COLOR.warning,
    backgroundColor: "rgb(254, 248, 234)", // pre-multiplied 8% warning on white
  },

  // Icon-Kreis links
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
  },
  iconCircleNein: {
    backgroundColor: COLOR.danger,
  },
  iconCircleTeilweise: {
    backgroundColor: COLOR.warning,
  },
  iconChar: {
    color: COLOR.bgWhite,
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "Fraunces",
  },

  // Card content
  cardBody: {
    flex: 1,
    flexDirection: "column",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
    flexWrap: "wrap",
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: COLOR.neutral900,
    fontFamily: "Fraunces",
    lineHeight: 1.3,
    flexShrink: 1,
  },
  statusBadge: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 3,
    fontSize: 7,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 1.2,
  },
  statusBadgeNein: {
    backgroundColor: COLOR.danger,
    color: COLOR.bgWhite,
  },
  statusBadgeTeilweise: {
    backgroundColor: COLOR.warning,
    color: COLOR.bgWhite,
  },

  wasZuTunEyebrow: {
    fontSize: 7,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 1.4,
    color: COLOR.neutral500,
    marginTop: 6,
    marginBottom: 3,
  },
  wasZuTunText: {
    fontSize: 10,
    lineHeight: 1.5,
    color: COLOR.neutral700,
    fontFamily: "Fraunces",
  },

  // Empty-State
  emptyCard: {
    marginTop: SPACING.lg,
    backgroundColor: "rgb(236, 251, 240)", // pre-multiplied 12% accent on white
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftStyle: "solid",
    borderLeftColor: COLOR.brandAccentDark,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    alignItems: "center",
  },
  emptyEyebrow: {
    fontSize: 9,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 2.2,
    color: COLOR.brandAccentDark,
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    textAlign: "center",
    marginBottom: SPACING.sm,
    letterSpacing: -0.3,
  },
  emptyBody: {
    fontSize: 11,
    fontFamily: "Fraunces",
    color: COLOR.neutral700,
    lineHeight: 1.55,
    textAlign: "center",
    maxWidth: 380,
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

const STATUS_LABEL: Record<"nein" | "teilweise", string> = {
  nein: "NEIN",
  teilweise: "TEILWEISE",
};

export function HausaufgabenPage({ input, pageNumber = 13 }: HausaufgabenPageProps) {
  const { snapshot, template, mandant } = input;
  const items = getHausaufgabenItemsWithErlaeuterung(
    snapshot.hausaufgaben,
    template,
  );
  const hasItems = items.length > 0;

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowLine} />
        <Text style={styles.eyebrowLabel}>VOR-VERKAUF-HYGIENE · MODUL 0</Text>
      </View>
      <Text style={styles.title}>Rechtliche & strukturelle Hausaufgaben</Text>
      <Text style={styles.lead}>
        Modul 0 fliesst nicht in den SUI-Score ein, sondern wird als separate
        Hausaufgaben-Liste ausgewiesen. Das sind die Themen, die ein Kaeufer in
        der Due Diligence aufdecken wuerde — und die jetzt sortiert werden
        muessen, nicht 12 Monate vor einem moeglichen Verkauf.
      </Text>

      {hasItems ? (
        <View style={styles.listStack}>
          {items.map((item) => {
            const isNein = item.status === "nein";
            return (
              <View
                key={item.frage_id}
                style={[
                  styles.card,
                  isNein ? styles.cardNein : styles.cardTeilweise,
                ]}
              >
                <View
                  style={[
                    styles.iconCircle,
                    isNein ? styles.iconCircleNein : styles.iconCircleTeilweise,
                  ]}
                >
                  <Text style={styles.iconChar}>!</Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle}>{item.frage_text}</Text>
                    <Text
                      style={[
                        styles.statusBadge,
                        isNein
                          ? styles.statusBadgeNein
                          : styles.statusBadgeTeilweise,
                      ]}
                    >
                      {STATUS_LABEL[item.status]}
                    </Text>
                  </View>
                  <Text style={styles.wasZuTunEyebrow}>WAS ZU TUN IST</Text>
                  <Text style={styles.wasZuTunText}>{item.was_zu_tun}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyEyebrow}>HYGIENE-CHECK BESTANDEN</Text>
          <Text style={styles.emptyTitle}>
            Gratulation — alle Hygiene-Fragen sind erfuellt.
          </Text>
          <Text style={styles.emptyBody}>
            Keine offenen Hausaufgaben in Modul 0. Ihr Unternehmen ist auch in
            den Vor-Verkauf-Hygiene-Themen sauber aufgestellt — ein wichtiger
            Pluspunkt fuer jeden moeglichen Uebergabe-Prozess.
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
