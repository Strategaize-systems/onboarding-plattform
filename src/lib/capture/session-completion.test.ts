import { describe, it, expect } from "vitest";
import { isSessionComplete } from "./session-completion";

describe("isSessionComplete", () => {
  const threeBlocks = [
    { key: "block_a" },
    { key: "block_b" },
    { key: "block_c" },
  ];

  it("returns false when no template blocks exist", () => {
    expect(isSessionComplete([], [])).toBe(false);
  });

  it("returns false when no checkpoints exist", () => {
    expect(isSessionComplete(threeBlocks, [])).toBe(false);
  });

  it("returns false when only some blocks have meeting_final", () => {
    const checkpoints = [
      { block_key: "block_a", checkpoint_type: "meeting_final" },
      { block_key: "block_b", checkpoint_type: "meeting_final" },
    ];
    expect(isSessionComplete(threeBlocks, checkpoints)).toBe(false);
  });

  it("returns false when blocks have only questionnaire_submit", () => {
    const checkpoints = [
      { block_key: "block_a", checkpoint_type: "questionnaire_submit" },
      { block_key: "block_b", checkpoint_type: "questionnaire_submit" },
      { block_key: "block_c", checkpoint_type: "questionnaire_submit" },
    ];
    expect(isSessionComplete(threeBlocks, checkpoints)).toBe(false);
  });

  it("returns true when all blocks have meeting_final", () => {
    const checkpoints = [
      { block_key: "block_a", checkpoint_type: "meeting_final" },
      { block_key: "block_b", checkpoint_type: "meeting_final" },
      { block_key: "block_c", checkpoint_type: "meeting_final" },
    ];
    expect(isSessionComplete(threeBlocks, checkpoints)).toBe(true);
  });

  it("returns true even with mixed checkpoint types when all have meeting_final", () => {
    const checkpoints = [
      { block_key: "block_a", checkpoint_type: "questionnaire_submit" },
      { block_key: "block_a", checkpoint_type: "meeting_final" },
      { block_key: "block_b", checkpoint_type: "meeting_final" },
      { block_key: "block_c", checkpoint_type: "questionnaire_submit" },
      { block_key: "block_c", checkpoint_type: "meeting_final" },
    ];
    expect(isSessionComplete(threeBlocks, checkpoints)).toBe(true);
  });
});
