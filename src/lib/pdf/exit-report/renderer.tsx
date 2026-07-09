// V10.5 SLC-191 MT-4 — Exit-/Devil's-Advocate-Report PDF-Renderer (DEC-275).
//
// Reuse des mandanten-report-v2-Render-Stacks (Fonts + Theme-Tokens) analog
// ../fahrplan-report/renderer.tsx (DEC-272). 0 LLM, 0 Migration — reine Praesentation:
//   Seite 1 = Owner-Dependence-Index-Hero (DEC-273), Seite 2 = Uebergabe-Ampel-Scorecard
//   (Zeile je Dimension: Block-Diagnose-Ampel [worst-case] + Owner-Dependence-Ampel),
//   Seite 3 = priorisierte Findings mit 3-Spalten-Kaeufer-Framing.
// renderExitReportPdf(input) berechnet Index + Findings intern → Route bleibt duenn.

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

import "../mandanten-report-v2/fonts"; // Side-Effect: Font.register (Fraunces, JetBrains Mono)
import { COLOR, SPACING, TYPOGRAPHY, PAGE } from "../mandanten-report-v2/theme";

import type { ExitReportInput } from "./types";
import {
  computeOwnerDependenceIndex,
  type Ampel,
  type OwnerDependenceIndex,
} from "./owner-dependence";
import { buildBuyerFindings, type BuyerFinding } from "./framing";

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE.marginPt + 16,
    paddingHorizontal: PAGE.marginPt,
    paddingBottom: PAGE.marginPt,
    backgroundColor: COLOR.bgWhite,
    color: COLOR.textDark,
    fontFamily: "Fraunces",
    fontWeight: 400,
    fontSize: TYPOGRAPHY.bodySize,
    lineHeight: TYPOGRAPHY.lineHeight,
  },
  eyebrow: {
    fontFamily: "JetBrains Mono",
    fontSize: TYPOGRAPHY.smallSize,
    color: COLOR.brandPrimary,
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },
  pageTitle: {
    fontSize: TYPOGRAPHY.pageTitleSize,
    fontWeight: 700,
    color: COLOR.brandDeep,
    marginBottom: SPACING.sm,
  },
  intro: { fontSize: TYPOGRAPHY.bodySize, color: COLOR.textMuted, marginBottom: SPACING.lg },
  heroBox: {
    backgroundColor: COLOR.brandDeep,
    borderRadius: 6,
    padding: SPACING.xl,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
    alignItems: "center",
  },
  heroNumber: { fontSize: 64, fontWeight: 700, color: COLOR.bgWhite },
  heroScale: { fontFamily: "JetBrains Mono", fontSize: TYPOGRAPHY.smallSize, color: COLOR.neutral300 },
  heroLevel: {
    fontFamily: "JetBrains Mono",
    fontSize: TYPOGRAPHY.bodySize,
    color: COLOR.bgWhite,
    marginTop: SPACING.sm,
    letterSpacing: 1,
  },
  // Scorecard
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.neutral200,
  },
  scoreHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: SPACING.xs,
    borderBottomWidth: 2,
    borderBottomColor: COLOR.neutral300,
  },
  dimName: { flex: 1, fontSize: TYPOGRAPHY.bodySize, fontWeight: 700 },
  colHead: {
    width: 96,
    textAlign: "center",
    fontFamily: "JetBrains Mono",
    fontSize: TYPOGRAPHY.smallSize,
    color: COLOR.textMuted,
  },
  pillCell: { width: 96, alignItems: "center" },
  pill: {
    fontFamily: "JetBrains Mono",
    fontSize: TYPOGRAPHY.monoSize,
    color: COLOR.bgWhite,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
  },
  blindSpot: {
    fontFamily: "JetBrains Mono",
    fontSize: TYPOGRAPHY.smallSize,
    color: COLOR.warningText,
    marginTop: 1,
  },
  // Findings
  finding: {
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.neutral200,
  },
  findHead: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.xs },
  findNum: { fontFamily: "JetBrains Mono", fontSize: TYPOGRAPHY.smallSize, color: COLOR.brandPrimary, width: 22 },
  findTitle: { flex: 1, fontSize: TYPOGRAPHY.bodySize, fontWeight: 700 },
  findMeta: { fontFamily: "JetBrains Mono", fontSize: TYPOGRAPHY.monoSize, color: COLOR.textMuted, marginBottom: SPACING.xs },
  cols: { flexDirection: "row", gap: SPACING.sm },
  col: { flex: 1 },
  colLabel: {
    fontFamily: "JetBrains Mono",
    fontSize: TYPOGRAPHY.monoSize,
    color: COLOR.brandPrimary,
    marginBottom: 1,
  },
  colText: { fontSize: TYPOGRAPHY.smallSize, color: COLOR.textDark },
});

function ampelColor(ampel: Ampel | null): string {
  if (ampel === "red") return COLOR.danger;
  if (ampel === "yellow") return COLOR.warning;
  if (ampel === "green") return COLOR.success;
  return COLOR.neutral400;
}

function ampelLabel(ampel: Ampel | null): string {
  return (ampel ?? "n/a").toUpperCase();
}

const LEVEL_LABEL: Record<OwnerDependenceIndex["level"], string> = {
  hoch: "HOCH",
  mittel: "MITTEL",
  gering: "GERING",
  nicht_ermittelbar: "NICHT ERMITTELBAR",
};

const AMPEL_RANK: Record<Ampel, number> = { green: 0, yellow: 1, red: 2 };

/** Block-Diagnose-Ampel = schlechteste Subtopic-Ampel des Blocks (worst-case, Q-V10.5-G). */
function blockDiagnosisAmpel(input: ExitReportInput, blockKey: string): Ampel | null {
  let worst: Ampel | null = null;
  for (const block of input.fahrplan.blocks) {
    if (block.block_key !== blockKey) continue;
    for (const st of block.subtopics) {
      const a = typeof st.fields.ampel === "string" ? st.fields.ampel.trim().toLowerCase() : "";
      if (a === "green" || a === "yellow" || a === "red") {
        worst = worst === null || AMPEL_RANK[a] > AMPEL_RANK[worst] ? a : worst;
      }
    }
  }
  return worst;
}

// ── Seite 1: Owner-Dependence-Index-Hero ────────────────────────────────────
function HeroPage({ index }: { index: OwnerDependenceIndex }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>KÄUFER-PERSPEKTIVE</Text>
      <Text style={styles.pageTitle}>Owner-Dependence-Index</Text>
      <Text style={styles.intro}>
        Wie stark hängt der Betrieb heute am Eigentümer? Je höher der Wert, desto mehr Substanz
        verlässt mit dem Inhaber das Unternehmen — für einen Käufer der zentrale Risikofaktor.
      </Text>
      <View style={styles.heroBox}>
        <Text style={styles.heroNumber}>{index.headline === null ? "–" : `${index.headline}`}</Text>
        <Text style={styles.heroScale}>{index.headline === null ? "keine owner-abhängigen Fragen" : "von 10"}</Text>
        <Text style={styles.heroLevel}>ABHÄNGIGKEIT: {LEVEL_LABEL[index.level]}</Text>
      </View>
    </Page>
  );
}

// ── Seite 2: Übergabe-Ampel-Scorecard ───────────────────────────────────────
function ScorecardPage({ input, index }: { input: ExitReportInput; index: OwnerDependenceIndex }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>ÜBERGABE-AMPEL</Text>
      <Text style={styles.pageTitle}>Scorecard je Dimension</Text>
      {index.dimensions.length === 0 ? (
        <Text style={styles.intro}>Keine owner-abhängigen Dimensionen bewertbar.</Text>
      ) : (
        <View>
          <View style={styles.scoreHeadRow}>
            <Text style={styles.dimName}>Dimension</Text>
            <Text style={styles.colHead}>Diagnose</Text>
            <Text style={styles.colHead}>Owner-Dep.</Text>
          </View>
          {index.dimensions.map((d, i) => {
            const diag = blockDiagnosisAmpel(input, d.blockKey);
            return (
              <View key={`d-${i}`} style={styles.scoreRow} wrap={false}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dimName}>{d.blockTitle}</Text>
                  {d.blindSpot ? (
                    <Text style={styles.blindSpot}>
                      Blind Spot: {d.ownerDepCount - d.answeredCount} von {d.ownerDepCount} owner-Fragen offen
                    </Text>
                  ) : null}
                </View>
                <View style={styles.pillCell}>
                  <View style={{ ...styles.pill, backgroundColor: ampelColor(diag) }}>
                    <Text>{ampelLabel(diag)}</Text>
                  </View>
                </View>
                <View style={styles.pillCell}>
                  <View style={{ ...styles.pill, backgroundColor: ampelColor(d.ampel) }}>
                    <Text>{ampelLabel(d.ampel)}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Page>
  );
}

// ── Seite 3: Findings mit 3-Spalten-Käufer-Framing ──────────────────────────
function FindingsPage({ findings }: { findings: BuyerFinding[] }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>{"DEVIL'S ADVOCATE"}</Text>
      <Text style={styles.pageTitle}>Käufer-Sicht je Lücke</Text>
      {findings.length === 0 ? (
        <Text style={styles.intro}>Keine offenen Lücken — aus Käufer-Sicht sauber aufgestellt.</Text>
      ) : (
        findings.map((f, i) => (
          <View key={`f-${i}`} style={styles.finding} wrap={false}>
            <View style={styles.findHead}>
              <Text style={styles.findNum}>{i + 1}.</Text>
              <Text style={styles.findTitle}>{f.title}</Text>
              <View
                style={{
                  ...styles.pill,
                  backgroundColor: f.priority === "required" ? COLOR.danger : COLOR.neutral400,
                }}
              >
                <Text>{f.priority === "required" ? "PFLICHT" : "OPTIONAL"}</Text>
              </View>
            </View>
            <Text style={styles.findMeta}>
              {f.blockTitle ? `${f.blockTitle} · ` : ""}
              {f.subtopicName}
            </Text>
            <View style={styles.cols}>
              <View style={styles.col}>
                <Text style={styles.colLabel}>KÄUFER-SICHT</Text>
                <Text style={styles.colText}>{f.kaeuferSicht}</Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.colLabel}>BUY-SIDE-DD</Text>
                <Text style={styles.colText}>{f.ddAnsatz}</Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.colLabel}>ABMILDERUNG</Text>
                <Text style={styles.colText}>{f.abmilderung}</Text>
              </View>
            </View>
          </View>
        ))
      )}
    </Page>
  );
}

function ExitReportDocument({ input }: { input: ExitReportInput }) {
  const index = computeOwnerDependenceIndex(input);
  const findings = buildBuyerFindings(input.fahrplan.todos);
  return (
    <Document
      title="Exit-/Käufer-Report"
      author="StrategAIze"
      creator="StrategAIze Onboarding-Plattform"
      producer="@react-pdf/renderer"
    >
      <HeroPage index={index} />
      <ScorecardPage input={input} index={index} />
      <FindingsPage findings={findings} />
    </Document>
  );
}

/** Rendert den Exit-/Käufer-Report als PDF-Buffer (renderToBuffer ohne Throw). */
export function renderExitReportPdf(input: ExitReportInput): Promise<Buffer> {
  return renderToBuffer(<ExitReportDocument input={input} />);
}
