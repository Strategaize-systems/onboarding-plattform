// V9.75 SLC-V9.75-B MT-3 — Stufe-1 Fahrplan-Report PDF-Renderer.
//
// Reuse des mandanten-report-v2-Render-Stacks: Font-Registrierung (Side-Effect-
// Import) + Theme-Tokens (COLOR/SPACING/TYPOGRAPHY/PAGE). 0 LLM, 0 Migration —
// reine Praesentation des Loader-Outputs (FahrplanInput) mit deterministischem
// Verkaufs-Framing (framing.ts). Seiten als interne Komponenten (single-use, kein
// pages/*-Sprawl). renderFahrplanReportPdf(input) → Promise<Buffer>.

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

import type { FahrplanInput, FahrplanSubtopic, FahrplanTodo } from "./types";
import {
  SCOPE_SENTENCE,
  exitCoupling,
  ownerOrFallback,
  prioritize,
  scopeEstimate,
} from "./framing";

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
  intro: {
    fontSize: TYPOGRAPHY.bodySize,
    color: COLOR.textMuted,
    marginBottom: SPACING.lg,
  },
  blockTitle: {
    fontSize: TYPOGRAPHY.sectionHeaderSize,
    fontWeight: 700,
    color: COLOR.brandPrimaryDark,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },
  subName: { flex: 1, fontSize: TYPOGRAPHY.bodySize },
  pill: {
    fontFamily: "JetBrains Mono",
    fontSize: TYPOGRAPHY.monoSize,
    color: COLOR.bgWhite,
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 3,
    marginLeft: SPACING.xs,
  },
  barTrack: {
    width: 90,
    height: 7,
    backgroundColor: COLOR.neutral200,
    borderRadius: 3,
    marginLeft: SPACING.sm,
  },
  barFill: { height: 7, borderRadius: 3 },
  scoreText: {
    fontFamily: "JetBrains Mono",
    fontSize: TYPOGRAPHY.monoSize,
    color: COLOR.textMuted,
    width: 32,
    textAlign: "right",
    marginLeft: SPACING.xs,
  },
  todo: {
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.neutral200,
  },
  todoHead: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  todoNum: {
    fontFamily: "JetBrains Mono",
    fontSize: TYPOGRAPHY.smallSize,
    color: COLOR.brandPrimary,
    width: 22,
  },
  todoTitle: { flex: 1, fontSize: TYPOGRAPHY.bodySize, fontWeight: 700 },
  todoMeta: {
    fontFamily: "JetBrains Mono",
    fontSize: TYPOGRAPHY.monoSize,
    color: COLOR.textMuted,
    marginTop: 2,
  },
  coupling: { fontSize: TYPOGRAPHY.smallSize, color: COLOR.textDark, marginTop: 2 },
  musterCard: {
    backgroundColor: COLOR.neutral50,
    borderWidth: 1,
    borderColor: COLOR.neutral200,
    borderRadius: 4,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  musterField: { fontSize: TYPOGRAPHY.smallSize, marginBottom: 2 },
  musterKey: { fontFamily: "JetBrains Mono", color: COLOR.brandPrimary },
  scopeBox: {
    backgroundColor: COLOR.bgNeutralLight,
    borderLeftWidth: 3,
    borderLeftColor: COLOR.brandAccent,
    padding: SPACING.md,
  },
  scopeText: { fontSize: TYPOGRAPHY.bodySize, color: COLOR.textDark },
});

function ampelColor(ampel: string | null): string {
  if (ampel === "red") return COLOR.danger;
  if (ampel === "yellow") return COLOR.warning;
  if (ampel === "green") return COLOR.success;
  return COLOR.neutral400;
}

function reifegradColor(v: number | null): string {
  if (v === null) return COLOR.neutral300;
  if (v < 3) return COLOR.stufen.s1;
  if (v < 5) return COLOR.stufen.s2;
  if (v < 7) return COLOR.stufen.s3;
  if (v < 9) return COLOR.stufen.s4;
  return COLOR.stufen.s5;
}

// ── Seite 1: Reifegrad-Profil ──────────────────────────────────────────────
function ProfilPage({ input }: { input: FahrplanInput }) {
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>STANDORTBESTIMMUNG</Text>
      <Text style={styles.pageTitle}>Ihr Exit-Readiness-Fahrplan</Text>
      <Text style={styles.intro}>{SCOPE_SENTENCE}</Text>

      {input.blocks.length === 0 ? (
        <Text style={styles.intro}>Noch keine Diagnose-Daten erfasst.</Text>
      ) : (
        input.blocks.map((block, bi) => (
          <View key={`b-${bi}`} wrap={false}>
            <Text style={styles.blockTitle}>{block.block_title}</Text>
            {block.subtopics.map((st, si) => {
              const reifegrad =
                typeof st.fields.reifegrad === "number" ? st.fields.reifegrad : null;
              const ampel =
                typeof st.fields.ampel === "string" ? st.fields.ampel : null;
              return (
                <View key={`s-${bi}-${si}`} style={styles.subRow}>
                  <Text style={styles.subName}>{st.name}</Text>
                  <View style={{ ...styles.pill, backgroundColor: ampelColor(ampel) }}>
                    <Text>{(ampel ?? "n/a").toUpperCase()}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={{
                        ...styles.barFill,
                        width: `${Math.round(((reifegrad ?? 0) / 10) * 100)}%`,
                        backgroundColor: reifegradColor(reifegrad),
                      }}
                    />
                  </View>
                  <Text style={styles.scoreText}>
                    {reifegrad === null ? "–" : `${reifegrad}/10`}
                  </Text>
                </View>
              );
            })}
          </View>
        ))
      )}
    </Page>
  );
}

// ── Seite 2: Priorisierte Luecken / To-Dos ──────────────────────────────────
function TodosPage({ todos }: { todos: FahrplanTodo[] }) {
  const sorted = prioritize(todos);
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>PRIORISIERT</Text>
      <Text style={styles.pageTitle}>Lücken & nächste Schritte</Text>
      {sorted.length === 0 ? (
        <Text style={styles.intro}>Keine offenen Lücken — gut aufgestellt.</Text>
      ) : (
        sorted.map((t, i) => (
          <View key={`t-${i}`} style={styles.todo} wrap={false}>
            <View style={styles.todoHead}>
              <Text style={styles.todoNum}>{i + 1}.</Text>
              <Text style={styles.todoTitle}>{t.title}</Text>
              <View
                style={{
                  ...styles.pill,
                  backgroundColor:
                    t.priority === "required" ? COLOR.danger : COLOR.neutral400,
                }}
              >
                <Text>{t.priority === "required" ? "PFLICHT" : "OPTIONAL"}</Text>
              </View>
            </View>
            <Text style={styles.todoMeta}>
              {t.blockTitle ? `${t.blockTitle} · ` : ""}
              {t.subtopicName}
            </Text>
            <Text style={styles.coupling}>
              {exitCoupling({
                risiko: t.risiko,
                hebel: t.hebel,
                relevanz90d: t.relevanz90d,
                empfehlung: t.empfehlung,
              })}
            </Text>
            <Text style={styles.todoMeta}>
              Aufwand: {t.aufwand ?? "–"} · Owner: {ownerOrFallback(t.owner)}
              {t.naechsterSchritt ? ` · Nächster Schritt: ${t.naechsterSchritt}` : ""}
            </Text>
          </View>
        ))
      )}
    </Page>
  );
}

/** Waehlt das Subtopic mit dem hoechsten reifegrad als Muster (R-B-2). */
function pickMusterSubtopic(
  input: FahrplanInput,
): { blockTitle: string; subtopic: FahrplanSubtopic } | null {
  let best: { blockTitle: string; subtopic: FahrplanSubtopic; score: number } | null = null;
  for (const block of input.blocks) {
    for (const st of block.subtopics) {
      const score = typeof st.fields.reifegrad === "number" ? st.fields.reifegrad : -1;
      if (!best || score > best.score) {
        best = { blockTitle: block.block_title, subtopic: st, score };
      }
    }
  }
  return best ? { blockTitle: best.blockTitle, subtopic: best.subtopic } : null;
}

// ── Seite 3: Muster-Sektion + Scope-Schaetzung ──────────────────────────────
function MusterScopePage({ input }: { input: FahrplanInput }) {
  const muster = pickMusterSubtopic(input);
  const scope = scopeEstimate({
    requiredGaps: input.counts.requiredGaps,
    niceToHaveGaps: input.counts.niceToHaveGaps,
    missingSubtopics: input.counts.missingSubtopics,
  });
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.eyebrow}>MUSTER & SCOPE</Text>
      <Text style={styles.pageTitle}>So sieht eine ausgearbeitete Sektion aus</Text>
      <Text style={styles.intro}>
        Im vollständigen Handbuch (Stufe 2) wird jede Sektion auf diesem Detailgrad
        ausgearbeitet. Beispiel aus Ihrer Diagnose:
      </Text>

      {muster ? (
        <View style={styles.musterCard}>
          <Text style={styles.blockTitle}>
            {muster.blockTitle} · {muster.subtopic.name}
          </Text>
          {Object.entries(muster.subtopic.fields)
            .filter(([, v]) => v !== null && String(v).trim().length > 0)
            .map(([k, v], i) => (
              <Text key={`f-${i}`} style={styles.musterField}>
                <Text style={styles.musterKey}>{k}: </Text>
                {String(v)}
              </Text>
            ))}
        </View>
      ) : (
        <Text style={styles.intro}>Noch keine Diagnose-Sektion verfügbar.</Text>
      )}

      <Text style={styles.blockTitle}>Aufbereitungs-Scope</Text>
      <View style={styles.scopeBox}>
        <Text style={styles.scopeText}>{scope}</Text>
        <Text style={{ ...styles.todoMeta, marginTop: SPACING.xs }}>
          {input.counts.blocks} Blöcke · {input.counts.requiredGaps} Pflicht-Lücken ·{" "}
          {input.counts.niceToHaveGaps} optional · {input.counts.missingSubtopics} nicht erfasst
        </Text>
      </View>
    </Page>
  );
}

function FahrplanReportDocument({ input }: { input: FahrplanInput }) {
  return (
    <Document
      title="Exit-Readiness-Fahrplan"
      author="StrategAIze"
      creator="StrategAIze Onboarding-Plattform"
      producer="@react-pdf/renderer"
    >
      <ProfilPage input={input} />
      <TodosPage todos={input.todos} />
      <MusterScopePage input={input} />
    </Document>
  );
}

/** Rendert den Fahrplan-Report als PDF-Buffer (AC-B-6: renderToBuffer ohne Throw). */
export function renderFahrplanReportPdf(input: FahrplanInput): Promise<Buffer> {
  return renderToBuffer(<FahrplanReportDocument input={input} />);
}
