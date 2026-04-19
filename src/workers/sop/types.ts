// SOP Generation — shared types

/** SOP step in the generated JSON */
export interface SopStep {
  number: number;
  action: string;
  responsible: string;
  timeframe: string;
  success_criterion: string;
  dependencies: string[];
}

/** Full SOP content structure stored as JSONB in sop.content */
export interface SopContent {
  title: string;
  objective: string;
  prerequisites: string[];
  steps: SopStep[];
  risks: string[];
  fallbacks: string[];
}

/** Template-level SOP prompt config stored in template.sop_prompt */
export interface SopPromptConfig {
  system_prompt: string;
}
