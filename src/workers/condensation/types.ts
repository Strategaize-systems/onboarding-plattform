// Shared types for the condensation worker pipeline

/** A single question+answer from the block checkpoint content */
export interface BlockAnswer {
  question_id: string;
  question_text: string;
  answer_text: string;
  subtopic?: string;
  block_key?: string;
}

/** Block metadata from the template */
export interface BlockDefinition {
  key: string;
  title: string;
  description?: string;
  questions: Array<{
    id: string;
    text: string;
    subtopic?: string;
    flags?: string[];
  }>;
}

/** A single Debrief Item / Knowledge Unit produced by the analyst */
export interface AnalystDebriefItem {
  subtopic: string;
  unit_type: "finding" | "risk" | "action" | "observation";
  title: string;
  current_state: string;
  target_state: string;
  body: string;
  confidence: "low" | "medium" | "high";
  maturity: number;
  risk: number;
  leverage: number;
  priority: "P0" | "P1" | "P2" | "P3";
  traffic_light: "red" | "yellow" | "green";
  recommendation: string;
  next_step: string;
  owner: string;
  effort: "S" | "M" | "L";
  dependencies: string[];
  tags: string[];
  evidence_refs: string[];
}

/** Full analyst output JSON */
export interface AnalystOutput {
  block_key: string;
  debrief_items: AnalystDebriefItem[];
  ko_assessment: Array<{
    question_id: string;
    flag: string;
    status: "critical" | "warning" | "ok";
    note: string;
  }>;
  sop_gaps: string[];
  cross_block_observations: string[];
  confidence_notes: string[];
  challenger_responses?: Array<{
    finding_id: string;
    response: string;
  }>;
}

/** A single challenger finding */
export interface ChallengerFinding {
  id: string;
  category: string;
  severity: "critical" | "major" | "minor" | "note";
  title: string;
  description: string;
  affected_items: string[];
  expected_action: string;
  evidence?: string;
}

/** Challenger verdict */
export type ChallengerVerdict =
  | "ACCEPTED"
  | "ACCEPTED_WITH_NOTES"
  | "NEEDS_REVISION"
  | "REJECTED";

/** Full challenger output JSON */
export interface ChallengerOutput {
  verdict: ChallengerVerdict;
  verdict_rationale: string;
  findings: ChallengerFinding[];
  statistics: {
    total_findings: number;
    critical: number;
    major: number;
    minor: number;
    notes: number;
    subtopic_coverage: string;
  };
  positive_observations: string[];
}

/** Cost tracking for a single Bedrock call */
export interface CallCost {
  model_id: string;
  tokens_in: number;
  tokens_out: number;
  usd_cost: number;
  duration_ms: number;
}

/** Result of a single iteration */
export interface IterationResult {
  iteration: number;
  analyst_output: AnalystOutput;
  challenger_output: ChallengerOutput;
  analyst_cost: CallCost;
  challenger_cost: CallCost;
  verdict: ChallengerVerdict;
}

/** Final result of the complete condensation pipeline */
export interface CondensationResult {
  block_key: string;
  total_iterations: number;
  final_verdict: ChallengerVerdict | "MAX_ITERATIONS_REACHED";
  debrief_items: AnalystDebriefItem[];
  ko_assessment: AnalystOutput["ko_assessment"];
  sop_gaps: string[];
  cross_block_observations: string[];
  iteration_log: IterationResult[];
  total_cost: CallCost;
}

/** A single gap question identified by the orchestrator */
export interface GapQuestion {
  question_text: string;
  context: string;
  subtopic: string;
  priority: "required" | "nice_to_have";
  related_ku_title?: string;
}

/** Orchestrator quality report — stored as JSONB on block_checkpoint */
export interface OrchestratorOutput {
  overall_score: number;
  coverage: {
    covered_subtopics: string[];
    missing_subtopics: string[];
    coverage_ratio: string;
  };
  evidence_quality: {
    strong_evidence: string[];
    weak_evidence: string[];
    no_evidence: string[];
    score: number;
  };
  consistency: {
    consistent: boolean;
    issues: string[];
    score: number;
  };
  gap_questions: GapQuestion[];
  recommendation: "sufficient" | "needs_backspelling" | "critical_gaps";
  recommendation_rationale: string;
}
