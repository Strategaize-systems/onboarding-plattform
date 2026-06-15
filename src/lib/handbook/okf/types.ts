// SLC-V9.7-A — OKF Concept-Emitter Typen (Strategaize OKF-Profil 1.0).
//
// Isoliertes Modul (AC-A-6): KEINE Worker-/DB-Imports. Die Input-Row-Shapes
// werden hier eigenstaendig definiert, damit der Emitter von den Worker-Loader-
// Typen entkoppelt bleibt. Cross-Link-Rendering + Bundle-Assembly leben in
// SLC-V9.7-B (`bundle.ts`), nicht hier.
//
// Quelle der Feld-/Mapping-Regeln: docs/ARCHITECTURE.md §"V9.7 Architecture
// Addendum" + DEC-220..225 + Rule strategaize-okf-profile.md.

/** Registrierte Strategaize-OKF `type`-Werte, die dieser Emitter erzeugt. */
export type OkfType =
  | "finding"
  | "risk"
  | "action"
  | "observation"
  | "diagnosis"
  | "sop";

export type OkfSourceTable = "knowledge_unit" | "block_diagnosis" | "sop";

export type OkfConfidence = "low" | "medium" | "high";

export type OkfCurationStatus = "proposed" | "accepted" | "edited";

/**
 * OKF-Frontmatter nach Strategaize-Profil 1.0. Optionale Felder werden
 * weggelassen (nicht `null`), wenn die Quelle keinen Wert hat — haelt das
 * serialisierte YAML sauber und den Konformitaets-Check (SLC-V9.7-B) einfach.
 * `tags` fehlt bewusst (keine `themes`-Spalte; kommt V9.8/BL-505, DEC-224).
 */
export interface OkfFrontmatter {
  type: OkfType;
  title: string;
  description?: string;
  timestamp?: string; // ISO 8601
  strategaize_source: "op";
  strategaize_tenant: string;
  confidence?: OkfConfidence;
  curation_status?: OkfCurationStatus;
  evidence_count?: number;
  strategaize_id: string;
}

/** Strukturiertes OKF-Concept-Objekt (vor Serialisierung). */
export interface OkfConcept {
  type: OkfType;
  frontmatter: OkfFrontmatter;
  body: string;
  blockKey: string;
  sourceTable: OkfSourceTable;
  sectionKey: string;
  path: string;
}

/** Serialisiertes Concept = eine OKF-`.md`-Datei. */
export interface SerializedConcept {
  path: string;
  content: string;
}

/** Kontext, den jeder Emitter pro Snapshot erhaelt. */
export interface OkfEmitContext {
  /** Tenant-UUID (Metadaten, kein Personenbezug) → `strategaize_tenant`. */
  tenantId: string;
}

// --- Input-Row-Shapes (entkoppelt von Worker-Loader-Typen, AC-A-6) ---

export interface KnowledgeUnitInput {
  id: string;
  block_key: string;
  /** finding/risk/action/observation/ai_draft */
  unit_type: string;
  title: string;
  body: string;
  /** low/medium/high (DEC-224, kein numeric-Mapping) */
  confidence: string;
  /** proposed/accepted/edited */
  status: string;
  /**
   * jsonb mit PII-UUIDs (`recorded_by_user_id`, `walkthrough_session_id`).
   * NUR `.length` wird verwendet — der Inhalt landet NIE im Output (DEC-223,
   * DSGVO).
   */
  evidence_refs: unknown[] | null;
  updated_at: string;
}

export interface DiagnosisSubtopicInput {
  key: string;
  name: string;
  fields?: Record<string, unknown>;
}

export interface DiagnosisInput {
  id: string;
  block_key: string;
  status: string;
  content: {
    block_key?: string;
    subtopics?: DiagnosisSubtopicInput[];
    [k: string]: unknown;
  };
  updated_at: string;
}

/**
 * SOP-Step kann zwei Form-Varianten haben (siehe `workers/handbook/types.ts`):
 * - Generator-Format: { number, action, responsible, timeframe, success_criterion }
 * - Legacy/Manual-Format: { title, detail }
 * Der Emitter bevorzugt `action` vor `title`.
 */
export interface SopStepInput {
  step?: number | string;
  number?: number;
  action?: string;
  responsible?: string;
  timeframe?: string;
  success_criterion?: string;
  dependencies?: Array<string | number>;
  title?: string;
  detail?: string;
  [k: string]: unknown;
}

export interface SopInput {
  id: string;
  block_key: string;
  content: {
    title?: string;
    objective?: string;
    steps?: SopStepInput[];
    [k: string]: unknown;
  };
  updated_at: string;
}
