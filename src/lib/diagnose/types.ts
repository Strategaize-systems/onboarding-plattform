// V8 SLC-148 MT-4 — Type-Definitionen fuer Mandanten-Report-Teaser
// (Template `exit-readiness-teaser-v1`, Migration 102).
//
// Diese Types beschreiben das V8-spezifische blocks-JSONB-Schema, das
// strukturell von der V6.3 `template_queries.ts`-Form (id/key/title/order)
// abweicht. V8 nutzt `modul_id` + `answer_schema_kind` + (fuer reife_skala_5)
// `score_mapping` pro Block. Siehe sql/migrations/102 fuer die kanonische
// Schema-Quelle.

export type ModulKey =
  | "m1"
  | "m2"
  | "m3"
  | "m4"
  | "m5"
  | "m6"
  | "m7"
  | "m8"
  | "m9";

export type StufeKey = "s1" | "s2" | "s3" | "s4" | "s5";

export type AnswerSchemaKind =
  | "hygiene_yes_partial_no"
  | "reife_skala_5"
  | "reflexion_freitext";

export type HygieneStatus = "ja" | "teilweise" | "nein";

export interface V8TemplateQuestion {
  frage_id: string;
  text: string;
  /** Only on M10 reflexion questions (Subsection-Header in UI). */
  subsection?: string;
}

export interface V8TemplateBlock {
  /** "M0" | "M1" | ... | "M10". Uppercase per migration JSONB. */
  modul_id: string;
  name: string;
  answer_schema_kind: AnswerSchemaKind;
  /** Only for reife_skala_5 blocks. Maps stufe-string ("1".."5") to score (0-10). */
  score_mapping?: Record<string, number>;
  questions: V8TemplateQuestion[];
}

export interface StufenInfo {
  was_es_bedeutet: string;
  unsere_empfehlung: string;
}

/** Lookup-Struktur aus template.metadata.stufen_lookup (m1..m9 x s1..s5). */
export type V8StufenLookup = Record<ModulKey, Record<StufeKey, StufenInfo>>;

export interface V8TemplateMetadata {
  usage_kind: "mandanten_report_teaser_v1";
  scoring_kind: "sui_weighted";
  report_renderer: "mandanten_report_v2";
  gewichtung: Record<ModulKey, number>;
  stufen_lookup: V8StufenLookup;
  worum_es_geht?: Record<ModulKey, string>;
  hausaufgaben_lookup?: Record<string, Record<"nein" | "teilweise", string>>;
}

export interface V8Template {
  slug: string;
  version: number;
  name: string;
  description: string;
  metadata: V8TemplateMetadata;
  blocks: V8TemplateBlock[];
}

/**
 * Captured answer for one V8 question.
 *
 * - reife_skala_5: `value` is "1".."5" (stufe-string).
 * - hygiene_yes_partial_no: `value` is "ja" | "teilweise" | "nein".
 * - reflexion_freitext: `value` is free text (any string).
 *
 * `string` type used uniformly to match capture_session.answers JSONB shape
 * (record of frage_id -> string).
 */
export interface Answer {
  frage_id: string;
  value: string;
}

export interface ModuleScores {
  m1: number;
  m2: number;
  m3: number;
  m4: number;
  m5: number;
  m6: number;
  m7: number;
  m8: number;
  m9: number;
}

export interface ModuleStufen {
  m1: number;
  m2: number;
  m3: number;
  m4: number;
  m5: number;
  m6: number;
  m7: number;
  m8: number;
  m9: number;
}

export type SuiClassificationKind = "strukturluecke" | "teil_reife" | "tragbar";
export type SuiClassificationColor = "rot" | "amber" | "gruen";

export interface SuiClassification {
  kind: SuiClassificationKind;
  color: SuiClassificationColor;
  label: string;
  meaning: string;
}

export interface HausaufgabeItem {
  frage_id: string;
  frage_text: string;
  status: "nein" | "teilweise";
}

export interface ReflexionItem {
  frage_id: string;
  frage_text: string;
  antwort_text: string;
}

export interface HebelItem {
  modul_id: ModulKey;
  modul_name: string;
  score: number;
  stufe: number;
  empfehlung: string;
}

export interface V8ReportSnapshot {
  schemaVersion: 1;
  finalizedAt: string;
  moduleScores: ModuleScores;
  sui: number;
  classification: SuiClassification;
  stufenMapping: ModuleStufen;
  hausaufgaben: HausaufgabeItem[];
  reflexionen: ReflexionItem[];
  hebel: HebelItem[];
}
