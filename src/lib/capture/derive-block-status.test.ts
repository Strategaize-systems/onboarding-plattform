import { describe, it, expect } from "vitest";
import { deriveBlockStatus, type BlockCheckpointInput } from "./derive-block-status";

describe("deriveBlockStatus", () => {
  it("returns 'open' when no checkpoints exist", () => {
    expect(deriveBlockStatus([])).toBe("open");
  });

  it("returns 'submitted' after questionnaire_submit without KUs", () => {
    const checkpoints: BlockCheckpointInput[] = [
      { checkpoint_type: "questionnaire_submit", created_at: "2026-04-17T10:00:00Z" },
    ];
    expect(deriveBlockStatus(checkpoints, false)).toBe("submitted");
  });

  it("returns 'reviewed' after questionnaire_submit with KUs", () => {
    const checkpoints: BlockCheckpointInput[] = [
      { checkpoint_type: "questionnaire_submit", created_at: "2026-04-17T10:00:00Z" },
    ];
    expect(deriveBlockStatus(checkpoints, true)).toBe("reviewed");
  });

  it("returns 'finalized' after meeting_final", () => {
    const checkpoints: BlockCheckpointInput[] = [
      { checkpoint_type: "questionnaire_submit", created_at: "2026-04-17T10:00:00Z" },
      { checkpoint_type: "meeting_final", created_at: "2026-04-17T12:00:00Z" },
    ];
    expect(deriveBlockStatus(checkpoints)).toBe("finalized");
  });

  it("uses latest checkpoint when multiple exist", () => {
    const checkpoints: BlockCheckpointInput[] = [
      { checkpoint_type: "meeting_final", created_at: "2026-04-17T09:00:00Z" },
      { checkpoint_type: "questionnaire_submit", created_at: "2026-04-17T12:00:00Z" },
    ];
    expect(deriveBlockStatus(checkpoints, false)).toBe("submitted");
  });

  it("handles unsorted input correctly", () => {
    const checkpoints: BlockCheckpointInput[] = [
      { checkpoint_type: "questionnaire_submit", created_at: "2026-04-17T12:00:00Z" },
      { checkpoint_type: "meeting_final", created_at: "2026-04-17T15:00:00Z" },
      { checkpoint_type: "questionnaire_submit", created_at: "2026-04-17T08:00:00Z" },
    ];
    expect(deriveBlockStatus(checkpoints)).toBe("finalized");
  });
});
