// V6.3 Light-Pipeline Worker-Branch fuer Diagnose-Werkzeug (SLC-105 / FEAT-045).
//
// Diese Datei wird vom knowledge_unit_condensation-Handler aufgerufen, wenn
// das Template-Flag template.metadata.usage_kind === "self_service_partner_diagnostic"
// gesetzt ist (DEC-105 / DEC-126). Auto-Finalize DGN-A schreibt KU direkt als
// status='accepted' ohne Berater-Review-Loop.
//
// MT-3a (SLC-105): nur `computeBlockScores` als Pure-Function exportiert.
// `runLightPipeline` (Bedrock-Verdichtung + Tx-Logic) folgt in MT-4 in eigener Session.
//
// Ref: docs/ARCHITECTURE.md V6.3-Section, DEC-123..DEC-128, RPT-279.

/** Diskreter Frage-Typ. Erweiterbar ohne DB-CHECK (DEC-123). */
export type QuestionType = "multiple_choice" | "likert_5" | "numeric_bucket";

/** Bekannte Frage-Typen. computeBlockScores wirft auf unbekanntem Typ. */
export const KNOWN_QUESTION_TYPES: ReadonlySet<QuestionType> = new Set([
  "multiple_choice",
  "likert_5",
  "numeric_bucket",
]);

/** Eine Antwort-Option + zugehoeriger Score (0-100, deterministisch aus Workshop). */
export interface ScoreMappingEntry {
  label: string;
  score: number;
}

/** Eine Frage aus template.blocks[].questions. */
export interface TemplateQuestion {
  key: string;
  text: string;
  question_type: QuestionType;
  scale_direction: "positive" | "negative";
  score_mapping: ScoreMappingEntry[];
}

/** Ein Baustein aus template.blocks. 4 Fragen pro Block in V6.3-Workshop. */
export interface TemplateBlock {
  key: string;
  title: string;
  intro: string;
  order: number;
  questions: TemplateQuestion[];
  comment_anchors: { low: string; mid: string; high: string };
}

/**
 * Deterministische Score-Berechnung pro Block (DEC-125).
 *
 * Pure Function — keine I/O, keine Side-Effects, kein Bedrock-Call, kein Zufall.
 * Jede Frage liefert einen diskreten Score per `score_mapping`-Lookup auf
 * den exakten Antwort-String. Block-Score = arithmetisches Mittel der Fragen-Scores,
 * gerundet auf eine Ganzzahl (0-100).
 *
 * Wirft bei:
 * - Block ohne questions (Konfig-Fehler)
 * - Unbekanntem question_type (Forward-Compat-Check fuer kuenftige Frage-Typen)
 * - Frage ohne score_mapping (Konfig-Fehler)
 * - Fehlender Antwort (capture_session.answers unvollstaendig)
 * - Antwort, die keinem score_mapping[].label entspricht (R-V63-2 String-Drift)
 *
 * @param blocks  Template-Bloecke aus template.blocks (JSONB)
 * @param answers Antworten aus capture_session.answers (JSONB),
 *                Key=question.key, Value=gewaehlter Label-String
 * @returns Objekt mit Block-Key → Score (0-100)
 */
export function computeBlockScores(
  blocks: TemplateBlock[],
  answers: Record<string, string>,
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const block of blocks) {
    if (!Array.isArray(block.questions) || block.questions.length === 0) {
      throw new Error(`Block "${block.key}" has no questions`);
    }

    const scores: number[] = [];
    for (const q of block.questions) {
      if (!KNOWN_QUESTION_TYPES.has(q.question_type)) {
        throw new Error(
          `Unknown question_type "${q.question_type}" for question ${q.key}`,
        );
      }

      if (!Array.isArray(q.score_mapping) || q.score_mapping.length === 0) {
        throw new Error(`Question "${q.key}" has empty score_mapping`);
      }

      const answer = answers[q.key];
      if (answer === undefined || answer === null || answer === "") {
        throw new Error(`Missing answer for question ${q.key}`);
      }

      const mapping = q.score_mapping.find((m) => m.label === answer);
      if (!mapping) {
        const preview = answer.length > 40 ? `${answer.slice(0, 40)}...` : answer;
        throw new Error(
          `No score mapping for question ${q.key}, answer="${preview}"`,
        );
      }

      scores.push(mapping.score);
    }

    const sum = scores.reduce((a, b) => a + b, 0);
    result[block.key] = Math.round(sum / scores.length);
  }

  return result;
}
