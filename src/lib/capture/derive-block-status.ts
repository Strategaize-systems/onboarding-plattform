/**
 * Derives the UI-facing status of a single block from its checkpoints.
 *
 * Status ladder:
 *   open → submitted → reviewed → finalized
 *
 * Logic:
 *   - No checkpoints at all → "open"
 *   - Latest checkpoint is questionnaire_submit → "submitted"
 *   - Latest checkpoint is meeting_final → "finalized"
 *   - Has questionnaire_submit AND knowledge_units exist → "reviewed"
 *     (knowledge_units presence is signaled by hasKnowledgeUnits param,
 *      so this function stays pure and DB-free)
 */

export type BlockStatus = "open" | "submitted" | "reviewed" | "finalized";

export interface BlockCheckpointInput {
  checkpoint_type: "questionnaire_submit" | "meeting_final";
  created_at: string;
}

export function deriveBlockStatus(
  checkpoints: BlockCheckpointInput[],
  hasKnowledgeUnits: boolean = false,
): BlockStatus {
  if (checkpoints.length === 0) return "open";

  const sorted = [...checkpoints].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const latest = sorted[0];

  if (latest.checkpoint_type === "meeting_final") return "finalized";

  if (latest.checkpoint_type === "questionnaire_submit") {
    return hasKnowledgeUnits ? "reviewed" : "submitted";
  }

  return "open";
}
