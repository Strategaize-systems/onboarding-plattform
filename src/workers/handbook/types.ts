// SLC-039 — Handbuch-Snapshot Backend
// Shared types fuer Schema-Validator, Renderer, Index-Builder, Worker-Handler.
// Quelle der Schema-Struktur: docs/ARCHITECTURE.md (template.handbook_schema, DEC-038).

export type SectionSourceType = "knowledge_unit" | "diagnosis" | "sop" | "walkthrough";

export type SubsectionsBy = "subtopic" | "block_key";

export interface SectionSourceFilter {
  block_keys?: string[];
  source_in?: string[];
  exclude_source?: string[];
  min_status?: string;
  // V5.1 SLC-091: optional filter fuer walkthrough-source. Reserviert; in V5.1
  // nicht ausgewertet (Renderer ignoriert subtopic_keys, gibt alle approved
  // walkthroughs zurueck). Aktivierung in V5.2+ falls Inline-Verteilung pro
  // Subtopic-Subsection gewuenscht (DEC-095).
  subtopic_keys?: string[];
}

export interface SectionSource {
  type: SectionSourceType;
  filter: SectionSourceFilter;
}

export interface SectionRender {
  subsections_by: SubsectionsBy;
  intro_template?: string | null;
}

export interface HandbookSection {
  key: string;
  title: string;
  order: number;
  sources: SectionSource[];
  render: SectionRender;
}

export interface CrossLink {
  from_section: string;
  to_section: string;
  anchor_match: string;
}

export interface HandbookSchema {
  sections: HandbookSection[];
  cross_links?: CrossLink[];
}

// Lade-Datentypen fuer den Renderer-Eingang.
export interface KnowledgeUnitRow {
  id: string;
  block_key: string;
  source: string;
  unit_type: string;
  title: string;
  body: string;
  confidence: string;
  status: string;
}

export interface DiagnosisSubtopic {
  key: string;
  name: string;
  fields?: Record<string, unknown>;
}

export interface DiagnosisRow {
  id: string;
  block_key: string;
  status: string;
  content: {
    block_key?: string;
    subtopics?: DiagnosisSubtopic[];
    [k: string]: unknown;
  };
}

// SOP-Step kann zwei Form-Varianten haben:
// - Legacy/Manual: { title, detail }
// - SOP-Generator (sop/types.ts): { number, action, responsible, timeframe, success_criterion, dependencies }
// Renderer akzeptiert beide; bevorzugt action vor title.
export interface SopStep {
  step?: number | string;
  number?: number;
  // Generator-Format
  action?: string;
  responsible?: string;
  timeframe?: string;
  success_criterion?: string;
  dependencies?: Array<string | number>;
  // Legacy-Format
  title?: string;
  detail?: string;
  [k: string]: unknown;
}

export interface SopRow {
  id: string;
  block_key: string;
  content: {
    title?: string;
    objective?: string;
    steps?: SopStep[];
    [k: string]: unknown;
  };
}

// V5.1 SLC-091 — Walkthrough-Source-Type fuer Handbuch-Snapshot-Renderer.
// Loader (load-walkthroughs.ts) liefert pro approved walkthrough_session
// einen WalkthroughRow mit JOIN-Steps + Mappings.
export interface WalkthroughStepRow {
  id: string;
  step_number: number;
  action: string;
  responsible: string | null;
  timeframe: string | null;
  success_criterion: string | null;
  dependencies: string | null;
  transcript_snippet: string | null;
}

export interface WalkthroughMappingRow {
  walkthrough_step_id: string;
  subtopic_id: string | null;
  confidence_band: "green" | "yellow" | "red";
  reviewer_corrected: boolean;
}

export interface WalkthroughRow {
  id: string;
  tenant_id: string;
  recorded_by_user_id: string;
  recorder_display_name: string;
  created_at: string; // ISO-String
  reviewed_at: string | null; // walkthrough_session.reviewed_at (Approve/Reject-Zeitpunkt)
  duration_sec: number | null; // walkthrough_session.duration_sec (cap 1800 per DEC-076)
  steps: WalkthroughStepRow[];
  mappings: WalkthroughMappingRow[];
}

export interface RendererInput {
  schema: HandbookSchema;
  tenantName: string;
  knowledgeUnits: KnowledgeUnitRow[];
  diagnoses: DiagnosisRow[];
  sops: SopRow[];
  walkthroughs?: WalkthroughRow[]; // V5.1 — optional, Default leer-Array
  generatedAt: Date;
}

export interface RendererOutput {
  files: Record<string, string>;
  counts: {
    section_count: number;
    knowledge_unit_count: number;
    diagnosis_count: number;
    sop_count: number;
    walkthrough_count: number; // V5.1
  };
}

export interface SchemaValidationError {
  path: string;
  message: string;
}
