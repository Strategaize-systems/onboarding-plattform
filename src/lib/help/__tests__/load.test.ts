import { describe, it, expect } from "vitest";
import {
  loadHelpMarkdown,
  listAvailableHelpPages,
  type HelpPageKey,
} from "../load";

describe("loadHelpMarkdown", () => {
  it("returns markdown for each valid page key", () => {
    const keys = listAvailableHelpPages();
    expect(keys).toEqual([
      "dashboard",
      "capture",
      "bridge",
      "reviews",
      "handbook",
    ]);
    for (const key of keys) {
      const md = loadHelpMarkdown(key);
      expect(md.length).toBeGreaterThan(0);
      expect(md).toMatch(/^# /);
    }
  });

  it("throws on unknown key", () => {
    expect(() => loadHelpMarkdown("invalid" as HelpPageKey)).toThrow(
      /Unknown help page key/
    );
  });

  it("each help file has at least 100 words (no Lorem-Ipsum)", () => {
    for (const key of listAvailableHelpPages()) {
      const md = loadHelpMarkdown(key);
      const wordCount = md.trim().split(/\s+/).length;
      expect(wordCount).toBeGreaterThanOrEqual(100);
      expect(md).not.toMatch(/lorem ipsum/i);
    }
  });
});
