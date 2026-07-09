// V10.5 SLC-191 — Exit-/Devil's-Advocate-Report: Typen.
//
// Baut auf dem Fahrplan-Report-V9.75-Plumbing auf (DEC-272, Reuse):
//   - FahrplanInput (block_diagnosis + coverage/todos) wird eingebettet.
// Reichert es um das owner-dependence-Rohmaterial an, das der Fahrplan nicht
// kennt: die owner_dependency-geflaggten Template-Fragen, die Diagnose-Subtopic-
// Verlinkung (diagnosis_schema) und die Roh-Answers.
//
// MT-0-Grounding (RPT-625, Live-Spike):
//   - template.blocks           = Array, blocks[].key = Block-Letter A..I,
//                                 blocks[].questions[] mit id (uuid) + frage_id (F-BP-xxx) + owner_dependency.
//   - template.diagnosis_schema = OBJEKT keyed by Block-Letter:
//                                 { blocks: { "A": { subtopics: [{key,name,question_keys:[frage_id]}] }, ... }, fields }
//                                 → Iteration MUSS Object.entries(blocks) sein (NICHT .map).
//   - capture_session.answers   = { "${block.key}.${q.id}": string } (Write-Konvention
//                                 questionnaire-form.tsx → saveAnswer(sessionId, block.key, q.id, value)).
//   Verlinkung owner-dep-Frage → Diagnose-Subtopic erfolgt via q.frage_id ∈ subtopic.question_keys.

import type { FahrplanInput } from "../fahrplan-report/types";

/** Eine owner_dependency-geflaggte Template-Frage, angereichert um „beantwortet?". */
export interface OwnerDepQuestion {
  /** Block-Letter A..I (template.blocks[].key). */
  blockKey: string;
  /** q.id (uuid) — Teil des answers-Keys `${blockKey}.${questionId}`. */
  questionId: string;
  /** q.frage_id (z.B. F-BP-003) — Match gegen diagnosis_schema.question_keys. */
  frageId: string;
  /** answers[`${blockKey}.${questionId}`] vorhanden + nicht leer. */
  answered: boolean;
}

/** Ein Diagnose-Subtopic aus template.diagnosis_schema.blocks[BLOCK_KEY].subtopics[]. */
export interface DiagnosisSubtopic {
  /** Block-Letter A..I (Objekt-Key aus diagnosis_schema.blocks). */
  blockKey: string;
  /** Subtopic-Key (z.B. a1_grundverstaendnis). */
  key: string;
  /** Lesbarer Subtopic-Name (sonst = key). */
  name: string;
  /** frage_ids, die dieses Subtopic abdecken (F-BP-xxx). */
  questionKeys: string[];
}

/** Vollstaendiger, typisierter Input fuer die Owner-Dependence-Berechnung + Renderer. */
export interface ExitReportInput {
  sessionId: string;
  /** Diagnose-/Coverage-/Todo-Basis aus dem Fahrplan-Loader (Reuse, DEC-272). */
  fahrplan: FahrplanInput;
  /** Alle owner_dependency-geflaggten Fragen der Session-Template, mit answered-Flag. */
  ownerDepQuestions: OwnerDepQuestion[];
  /** Diagnose-Subtopics (aus diagnosis_schema, Objekt-Form) fuer die frage_id-Verlinkung. */
  diagnosisSubtopics: DiagnosisSubtopic[];
  /** Roh-Answers der Session (`${blockKey}.${questionId}` → Wert). */
  answers: Record<string, unknown>;
  /** blockKey → lesbarer Block-Titel (fuer die Scorecard-Dimensionen). */
  blockTitles: Record<string, string>;
}
