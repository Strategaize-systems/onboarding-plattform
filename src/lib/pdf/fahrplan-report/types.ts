// V9.75 SLC-V9.75-B — Stufe-1 Fahrplan-Report: Typen.
//
// Liest ausschliesslich bestehende Daten (DEC-222: 0 neue LLM-Jobs, 0 Migration):
//   - block_diagnosis.content  (src/workers/diagnosis/types.ts DiagnosisContent)
//   - block_checkpoint.quality_report (src/workers/condensation/types.ts OrchestratorOutput)
// Alle Subtopic-Felder sind nullable (LLM laesst owner haeufig leer, aufwand/
// naechster_schritt koennen fehlen) → der Loader defaultet defensiv (R-B-1).

/** Ein Subtopic aus block_diagnosis.content.subtopics[] (fields: Record<string,string|number|null>). */
export interface FahrplanSubtopic {
  key: string;
  name: string;
  fields: Record<string, string | number | null>;
}

/** Ein block_diagnosis.content (ein Block der Diagnose). */
export interface FahrplanBlock {
  block_key: string;
  block_title: string;
  subtopics: FahrplanSubtopic[];
}

/** Gap-Frage aus quality_report.gap_questions[]. */
export interface FahrplanGapQuestion {
  question_text: string;
  context: string;
  subtopic: string;
  priority: "required" | "nice_to_have";
}

/**
 * Ein normalisierter To-Do-/Luecken-Eintrag: eine Gap-Frage ODER ein fehlendes
 * Subtopic (coverage.missing_subtopics), angereichert mit den Diagnose-Feldern
 * des passenden Subtopics (per subtopic-key/name gematcht). Alle angereicherten
 * Felder sind defensiv nullable.
 */
export interface FahrplanTodo {
  /** Subtopic-Bezug (key oder Name aus dem Gap/Coverage-Eintrag). */
  subtopic: string;
  /** Lesbarer Subtopic-Name (aus Diagnose, sonst = subtopic). */
  subtopicName: string;
  /** Block-Titel des zugehoerigen Diagnose-Blocks (sonst ""). */
  blockTitle: string;
  /** Anzeige-Titel: Gap-Frage-Text bzw. „Nicht erfasst: <Subtopic>". */
  title: string;
  /** Erklaerender Kontext (Gap-context) oder "". */
  context: string;
  priority: "required" | "nice_to_have";
  source: "gap" | "missing_subtopic";
  // Angereicherte Diagnose-Felder (alle nullable — R-B-1):
  ampel: string | null; // green | yellow | red
  reifegrad: number | null; // 0–10
  risiko: number | null; // 0–10
  hebel: number | null; // 0–10
  relevanz90d: string | null; // high | medium | low
  empfehlung: string | null;
  aufwand: string | null; // S | M | L
  owner: string | null; // haeufig leer
  naechsterSchritt: string | null;
}

/** Aggregierte Zaehlungen fuer Scope-Schaetzung + Kopfzeile. */
export interface FahrplanCounts {
  blocks: number;
  requiredGaps: number;
  niceToHaveGaps: number;
  missingSubtopics: number;
}

/** Vollstaendiger, typisierter Input fuer den Renderer (Loader-Output). */
export interface FahrplanInput {
  sessionId: string;
  /** Reifegrad-Profil-Quelle: alle Diagnose-Bloecke mit Subtopics+Feldern. */
  blocks: FahrplanBlock[];
  /** Unsortierte To-Do-/Luecken-Liste (Sortierung passiert im Framing, MT-2). */
  todos: FahrplanTodo[];
  /** Roh-Liste der fehlenden Subtopics (coverage.missing_subtopics, dedupliziert). */
  missingSubtopics: string[];
  counts: FahrplanCounts;
}

/** Roh-Zeilen wie aus Supabase geladen (Loader-Eingang vor dem Transform). */
export interface DiagnosisRow {
  block_key: string | null;
  content: unknown;
}
export interface QualityReportRow {
  quality_report: unknown;
}
