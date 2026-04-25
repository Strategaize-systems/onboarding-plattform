/**
 * SLC-036 — Shared types fuer Bridge-UI-Komponenten.
 * Page laedt Daten und reicht sie an Client-Components weiter.
 */

export type BridgeProposalQuestion = {
  id?: string;
  text: string;
  type?: string;
};

export type BridgeProposalRow = {
  id: string;
  bridge_run_id: string;
  proposal_mode: "template" | "free_form";
  source_subtopic_key: string | null;
  proposed_block_title: string;
  proposed_block_description: string | null;
  proposed_questions: BridgeProposalQuestion[];
  proposed_employee_user_id: string | null;
  proposed_employee_role_hint: string | null;
  status: "proposed" | "edited" | "approved" | "rejected" | "spawned";
  approved_capture_session_id: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type BridgeRunRow = {
  id: string;
  capture_session_id: string;
  status: "running" | "completed" | "failed" | "stale";
  proposal_count: number;
  cost_usd: number | null;
  error_message: string | null;
  generated_by_model: string | null;
  created_at: string;
  completed_at: string | null;
};

export type EmployeeRow = {
  id: string;
  email: string;
};
