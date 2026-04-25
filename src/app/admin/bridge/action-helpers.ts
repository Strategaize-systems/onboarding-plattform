/**
 * SLC-036 MT-5 — Pure helpers fuer Bridge Server-Actions.
 * Ausgelagert fuer Vitest-Unit-Tests ohne Supabase-Mock.
 */

export type EditedProposalPayload = {
  proposed_block_title?: string;
  proposed_block_description?: string | null;
  proposed_questions?: unknown[];
  proposed_employee_user_id?: string | null;
  proposed_employee_role_hint?: string | null;
};

export const UUID_RE = /^[0-9a-f-]{36}$/i;

export type ValidationError =
  | "invalid_capture_session_id"
  | "invalid_proposal_id"
  | "invalid_employee_id"
  | "reason_required"
  | "reason_too_long";

export function validateTriggerInput(captureSessionId: string): ValidationError | null {
  if (!captureSessionId || !UUID_RE.test(captureSessionId)) {
    return "invalid_capture_session_id";
  }
  return null;
}

export function validateApproveInput(
  proposalId: string,
  editedPayload?: EditedProposalPayload
): ValidationError | null {
  if (!proposalId || !UUID_RE.test(proposalId)) {
    return "invalid_proposal_id";
  }
  if (
    editedPayload?.proposed_employee_user_id &&
    !UUID_RE.test(editedPayload.proposed_employee_user_id)
  ) {
    return "invalid_employee_id";
  }
  return null;
}

export function validateRejectInput(
  proposalId: string,
  reason: string
): { error: ValidationError } | { ok: true; reason: string } {
  if (!proposalId || !UUID_RE.test(proposalId)) {
    return { error: "invalid_proposal_id" };
  }
  const trimmed = (reason ?? "").trim();
  if (trimmed.length === 0) return { error: "reason_required" };
  if (trimmed.length > 1000) return { error: "reason_too_long" };
  return { ok: true, reason: trimmed };
}

/**
 * Whitelist edited_payload Felder, damit die RPC keine Fremdschluessel umgehen
 * kann. Felder die nicht im Whitelist stehen, werden silent verworfen.
 * Returns null wenn nichts editiert wurde (-> RPC bekommt p_edited_payload=null).
 */
export function buildCleanEditedPayload(
  editedPayload?: EditedProposalPayload
): Record<string, unknown> | null {
  if (!editedPayload) return null;
  const out: Record<string, unknown> = {};
  if (editedPayload.proposed_block_title !== undefined) {
    out.proposed_block_title = editedPayload.proposed_block_title;
  }
  if (editedPayload.proposed_block_description !== undefined) {
    out.proposed_block_description = editedPayload.proposed_block_description;
  }
  if (editedPayload.proposed_questions !== undefined) {
    out.proposed_questions = editedPayload.proposed_questions;
  }
  if (editedPayload.proposed_employee_user_id !== undefined) {
    out.proposed_employee_user_id = editedPayload.proposed_employee_user_id;
  }
  if (editedPayload.proposed_employee_role_hint !== undefined) {
    out.proposed_employee_role_hint = editedPayload.proposed_employee_role_hint;
  }
  return Object.keys(out).length > 0 ? out : null;
}
