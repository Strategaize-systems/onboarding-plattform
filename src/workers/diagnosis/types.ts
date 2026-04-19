// Diagnosis Generation — shared types

/** Assessment field definition from template.diagnosis_schema.fields[] */
export interface DiagnosisFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "enum";
  options?: string[];
  min?: number;
  max?: number;
}

/** Subtopic definition from template.diagnosis_schema.blocks[X].subtopics[] */
export interface DiagnosisSubtopicDef {
  key: string;
  name: string;
  question_keys: string[];
}

/** Block definition within diagnosis_schema */
export interface DiagnosisBlockDef {
  subtopics: DiagnosisSubtopicDef[];
}

/** Template-level diagnosis schema stored in template.diagnosis_schema */
export interface DiagnosisSchema {
  blocks: Record<string, DiagnosisBlockDef>;
  fields: DiagnosisFieldDef[];
}

/** Template-level diagnosis prompt config stored in template.diagnosis_prompt */
export interface DiagnosisPromptConfig {
  system_prompt: string;
  output_instructions?: string;
  field_instructions?: Record<string, string>;
}

/** Single subtopic in diagnosis output with field values */
export interface DiagnosisSubtopic {
  key: string;
  name: string;
  fields: Record<string, string | number | null>;
}

/** Full diagnosis content structure stored as JSONB in block_diagnosis.content */
export interface DiagnosisContent {
  block_key: string;
  block_title: string;
  subtopics: DiagnosisSubtopic[];
}
