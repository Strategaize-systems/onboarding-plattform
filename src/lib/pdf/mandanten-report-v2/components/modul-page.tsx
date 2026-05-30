// V8 SLC-151 MT-1 — Reusable ModulPage-Component (Pages 4-12).
//
// 1:1-Port der HTML-Master-Vorlage MANDANTEN_REPORT_PROTOTYP.html
// `section.modul-page` (Zeile 529-605). Wird in MT-2 9x verwendet
// (m1..m9) ueber die Renderer-Foundation.
//
// Layout:
// - Linke Spalte (~45%): Wheel mit focusIdx + Stufen-Progress-Indikator
// - Rechte Spalte (~55%): Eyebrow + Title + Stufe-Pill + 3 Text-Sektionen
//   (Worum es geht / Was es in Ihrer Firma bedeutet / Unsere Empfehlung)
//
// Per [[feedback-react-pdf-v4-fontstyle-requires-variant]] kein fontStyle:italic
// — Empfehlungs-Text differenziert via Quote-Marks + Color statt italic.

import React from "react";
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer";

import type { ModulKey, ModuleScores, StufenInfo } from "@/lib/diagnose/types";
import { COLOR, SPACING, getStufeColor } from "../theme";
import { WheelV2 } from "../wheel-v2";
import { modulIdxFromKey } from "./modul-page-resolvers";

const STUFEN_LABELS: readonly string[] = [
  "Noch gar nicht vorhanden",
  "Erste Ansaetze",
  "Teilweise implementiert",
  "Weitgehend etabliert",
  "Vollstaendig etabliert + belastbar",
];

export interface ModulPageProps {
  modulKey: ModulKey;
  modulName: string;
  modulScore: number;
  modulStufe: number;
  wheelScores: ModuleScores;
  stufenInfo: StufenInfo;
  worumEsGeht: string;
  /** Optional Page-Nummer fuer Footer-Slot (z.B. 4..12). */
  pageNumber?: number;
  /** Optional Mandant-Name fuer Footer-Slot (Konsistenz mit Phase-A-Pages). */
  mandantName?: string;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingHorizontal: 40,
    paddingBottom: 56,
    backgroundColor: COLOR.bgWhite,
    color: COLOR.neutral800,
    fontFamily: "Fraunces",
    fontWeight: 400,
  },
  row: {
    flexDirection: "row",
    gap: 28,
    flex: 1,
  },
  leftPane: {
    width: "44%",
    flexDirection: "column",
    gap: SPACING.md,
  },
  rightPane: {
    width: "56%",
    flexDirection: "column",
  },

  // Wheel-Container (subtler card-Look per Master)
  wheelCard: {
    backgroundColor: COLOR.neutral50,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: "center",
  },

  // Stufen-Progress (5 Reife-Stufen-Indikator)
  stufenProgress: {
    backgroundColor: COLOR.bgWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLOR.neutral200,
    borderStyle: "solid",
    padding: SPACING.md,
    flexDirection: "column",
    gap: 5,
  },
  stufenProgressLabel: {
    fontSize: 8,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 1.8,
    color: COLOR.neutral500,
    marginBottom: SPACING.xs,
  },
  stufeStep: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 5,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: COLOR.neutral200,
    gap: 8,
  },
  stufeStepFilled: {
    borderLeftColor: COLOR.brandPrimaryLight,
  },
  stufeStepActive: {
    borderLeftColor: COLOR.brandPrimary,
    backgroundColor: "rgb(238, 240, 250)", // pre-multiplied 8% brand-primary on white
  },
  stufeStepNum: {
    fontSize: 9,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    color: COLOR.neutral400,
    width: 16,
    textAlign: "center",
  },
  stufeStepNumFilled: {
    color: COLOR.brandPrimary,
  },
  stufeStepNumActive: {
    color: COLOR.bgWhite,
    backgroundColor: COLOR.brandPrimary,
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  stufeStepLabel: {
    fontSize: 9,
    fontFamily: "Fraunces",
    color: COLOR.neutral600,
    fontWeight: 400,
    flex: 1,
  },
  stufeStepLabelActive: {
    color: COLOR.neutral900,
    fontWeight: 700,
  },

  // Right pane text
  eyebrow: {
    alignSelf: "flex-start",
    fontSize: 8,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 1.6,
    color: COLOR.brandAccentDark,
    backgroundColor: "rgb(236, 251, 240)", // pre-multiplied 12% brand-accent on white
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: 28,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    lineHeight: 1.15,
    letterSpacing: -0.5,
    marginBottom: SPACING.md,
  },
  stufePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    marginBottom: SPACING.lg,
    gap: 6,
  },
  stufePillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLOR.bgWhite,
  },
  stufePillText: {
    fontSize: 10,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.bgWhite,
  },
  sectionH2: {
    fontSize: 14,
    fontFamily: "Fraunces",
    fontWeight: 700,
    color: COLOR.neutral900,
    letterSpacing: -0.2,
    marginTop: SPACING.md,
    marginBottom: 6,
  },
  body: {
    fontSize: 10.5,
    fontFamily: "Fraunces",
    color: COLOR.neutral700,
    lineHeight: 1.55,
    marginBottom: SPACING.xs,
  },

  // Empfehlung-Block (highlighted)
  empfehlungBlock: {
    backgroundColor: COLOR.neutral50,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftStyle: "solid",
    borderLeftColor: COLOR.brandPrimary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.md,
  },
  empfehlungEyebrow: {
    fontSize: 8,
    fontFamily: "JetBrains Mono",
    fontWeight: 700,
    letterSpacing: 1.4,
    color: COLOR.brandPrimary,
    marginBottom: 6,
  },
  empfehlungText: {
    fontSize: 11,
    fontFamily: "Fraunces",
    color: COLOR.neutral800,
    lineHeight: 1.55,
  },

  // Footer (konsistent zu Phase-A)
  footer: {
    position: "absolute",
    bottom: 32,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: COLOR.neutral400,
    fontFamily: "JetBrains Mono",
    letterSpacing: 1,
  },
});

export function ModulPage({
  modulKey,
  modulName,
  modulScore,
  modulStufe,
  wheelScores,
  stufenInfo,
  worumEsGeht,
  pageNumber,
  mandantName,
}: ModulPageProps) {
  const focusIdx = modulIdxFromKey(modulKey);
  const modulNumber = focusIdx + 1;
  const stufenColor = getStufeColor(modulStufe);
  const stufeLabel = STUFEN_LABELS[modulStufe - 1] ?? "";

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.row}>
        {/* LEFT PANE — Wheel + Stufen-Progress */}
        <View style={styles.leftPane}>
          <View style={styles.wheelCard}>
            <WheelV2
              moduleScores={wheelScores}
              focusIdx={focusIdx}
              size={220}
              centerOverride={{
                topLabel: `Modul ${modulNumber}`,
                score: modulScore,
                subLabel: "von 10",
              }}
            />
          </View>

          <View style={styles.stufenProgress}>
            <Text style={styles.stufenProgressLabel}>REIFE-STUFEN</Text>
            {[1, 2, 3, 4, 5].map((s) => {
              const isActive = s === modulStufe;
              const isFilled = s < modulStufe;
              return (
                <View
                  key={s}
                  style={[
                    styles.stufeStep,
                    ...(isFilled ? [styles.stufeStepFilled] : []),
                    ...(isActive ? [styles.stufeStepActive] : []),
                  ]}
                >
                  <Text
                    style={[
                      styles.stufeStepNum,
                      ...(isFilled ? [styles.stufeStepNumFilled] : []),
                      ...(isActive ? [styles.stufeStepNumActive] : []),
                    ]}
                  >
                    {s}
                  </Text>
                  <Text
                    style={[
                      styles.stufeStepLabel,
                      ...(isActive ? [styles.stufeStepLabelActive] : []),
                    ]}
                  >
                    {STUFEN_LABELS[s - 1]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* RIGHT PANE — Text-Sektionen */}
        <View style={styles.rightPane}>
          <Text style={styles.eyebrow}>MODUL {modulNumber}</Text>
          <Text style={styles.title}>{modulName}</Text>

          <View style={[styles.stufePill, { backgroundColor: stufenColor }]}>
            <View style={styles.stufePillDot} />
            <Text style={styles.stufePillText}>
              Stufe {modulStufe} · {stufeLabel}
            </Text>
          </View>

          <Text style={styles.sectionH2}>Worum es geht</Text>
          <Text style={styles.body}>{worumEsGeht}</Text>

          <Text style={styles.sectionH2}>Was es in Ihrer Firma bedeutet</Text>
          <Text style={styles.body}>{stufenInfo.was_es_bedeutet}</Text>

          <View style={styles.empfehlungBlock}>
            <Text style={styles.empfehlungEyebrow}>
              UNSERE EMPFEHLUNG FUER DAS FOLGEGESPRAECH
            </Text>
            <Text style={styles.empfehlungText}>
              {"„"}
              {stufenInfo.unsere_empfehlung}
              {"“"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text>{(mandantName ?? "").toUpperCase()}</Text>
        <Text>
          SEITE {pageNumber ?? modulNumber + 3} · STRATEGAIZE
        </Text>
      </View>
    </Page>
  );
}
