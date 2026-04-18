/**
 * Pure function to determine if a capture session is complete (all blocks finalized).
 *
 * A session is complete when every block defined in the template has at least one
 * checkpoint of type "meeting_final".
 */

export interface CheckpointForCompletion {
  block_key: string;
  checkpoint_type: string;
}

export interface TemplateBlock {
  key: string;
}

export function isSessionComplete(
  templateBlocks: TemplateBlock[],
  checkpoints: CheckpointForCompletion[]
): boolean {
  if (templateBlocks.length === 0) return false;

  const finalizedBlocks = new Set(
    checkpoints
      .filter((cp) => cp.checkpoint_type === "meeting_final")
      .map((cp) => cp.block_key)
  );

  return templateBlocks.every((block) => finalizedBlocks.has(block.key));
}
