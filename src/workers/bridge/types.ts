// SLC-035 — Types fuer Bridge-Engine (FEAT-023, DEC-034)

export interface BridgeQuestion {
  id: string;
  text: string;
  required?: boolean;
}

export interface BridgeBlockTemplate {
  title: string;
  description?: string;
  questions: BridgeQuestion[];
}

export interface BridgeSubtopicBridge {
  subtopic_key: string;
  block_template: BridgeBlockTemplate;
  typical_employee_role_hints?: string[];
  skip_if?: string | null;
}

export interface BridgeFreeFormSlot {
  max_proposals: number;
  system_prompt_addendum?: string;
}

export interface BridgeEmployeeCaptureSchema {
  subtopic_bridges: BridgeSubtopicBridge[];
  free_form_slot: BridgeFreeFormSlot;
}

export interface BridgeEmployee {
  user_id: string;
  display_name: string;
  role_hint?: string | null;
  department?: string | null;
}

export interface BridgeKnowledgeUnit {
  id: string;
  block_key: string;
  subtopic_key?: string | null;
  title: string;
  body: string;
  unit_type: string;
  confidence: string;
  status: string;
}

export interface BridgeDiagnosis {
  id: string;
  block_key: string;
  subtopic_key?: string | null;
  summary?: string | null;
  severity?: string | null;
  ampel?: string | null;
  status: string;
}

// LLM-Output-Schema: Template-Refine
export interface TemplateRefineOutput {
  proposed_employee_user_id?: string | null;
  proposed_employee_role_hint?: string | null;
  adjusted_title?: string | null;
  adjusted_description?: string | null;
  adjusted_questions?: BridgeQuestion[] | null;
}

// LLM-Output-Schema: Free-Form
export interface FreeFormProposal {
  block_title: string;
  description?: string;
  questions: BridgeQuestion[];
  proposed_employee_user_id?: string | null;
  proposed_employee_role_hint?: string | null;
}

export interface FreeFormOutput {
  proposals: FreeFormProposal[];
}
