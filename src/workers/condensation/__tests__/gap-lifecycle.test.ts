import { describe, it, expect } from "vitest";
import type { OrchestratorOutput, GapQuestion } from "../types";

// Unit tests for gap question lifecycle logic.
// Tests the data flow patterns without DB dependencies.

/** Simulate the gap-creation decision from orchestrator output */
function shouldCreateGaps(
  output: OrchestratorOutput
): { create: boolean; gaps: GapQuestion[] } {
  if (output.gap_questions.length === 0) {
    return { create: false, gaps: [] };
  }
  return { create: true, gaps: output.gap_questions };
}

/** Simulate the round-limit check from rpc_create_gap_questions */
function checkRoundLimit(
  existingMaxRound: number
): { allowed: boolean; nextRound: number } {
  const nextRound = existingMaxRound + 1;
  if (nextRound > 2) {
    return { allowed: false, nextRound };
  }
  return { allowed: true, nextRound };
}

/** Simulate the recondense trigger check */
function shouldTriggerRecondense(
  gaps: Array<{ priority: string; status: string }>
): boolean {
  const pendingRequired = gaps.filter(
    (g) => g.priority === "required" && g.status === "pending"
  );
  return pendingRequired.length === 0;
}

describe("Gap Lifecycle — Decision Logic", () => {
  it("creates gaps when orchestrator reports gaps", () => {
    const output: OrchestratorOutput = {
      overall_score: 55,
      coverage: {
        covered_subtopics: ["A1"],
        missing_subtopics: ["A2"],
        coverage_ratio: "1/2",
      },
      evidence_quality: {
        strong_evidence: [],
        weak_evidence: [],
        no_evidence: ["A2"],
        score: 40,
      },
      consistency: { consistent: true, issues: [], score: 80 },
      gap_questions: [
        {
          question_text: "Wie ist die Marktposition?",
          context: "A2 hat keine Antworten",
          subtopic: "A2",
          priority: "required",
        },
      ],
      recommendation: "needs_backspelling",
      recommendation_rationale: "A2 fehlt komplett.",
    };

    const { create, gaps } = shouldCreateGaps(output);
    expect(create).toBe(true);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].priority).toBe("required");
  });

  it("skips gap creation when orchestrator reports no gaps", () => {
    const output: OrchestratorOutput = {
      overall_score: 85,
      coverage: {
        covered_subtopics: ["A1", "A2"],
        missing_subtopics: [],
        coverage_ratio: "2/2",
      },
      evidence_quality: {
        strong_evidence: ["A1", "A2"],
        weak_evidence: [],
        no_evidence: [],
        score: 85,
      },
      consistency: { consistent: true, issues: [], score: 90 },
      gap_questions: [],
      recommendation: "sufficient",
      recommendation_rationale: "Alles abgedeckt.",
    };

    const { create } = shouldCreateGaps(output);
    expect(create).toBe(false);
  });

  it("allows round 1 and round 2", () => {
    expect(checkRoundLimit(0)).toEqual({ allowed: true, nextRound: 1 });
    expect(checkRoundLimit(1)).toEqual({ allowed: true, nextRound: 2 });
  });

  it("blocks round 3+", () => {
    expect(checkRoundLimit(2)).toEqual({ allowed: false, nextRound: 3 });
    expect(checkRoundLimit(5)).toEqual({ allowed: false, nextRound: 6 });
  });

  it("triggers recondense when all required gaps are answered", () => {
    const gaps = [
      { priority: "required", status: "answered" },
      { priority: "required", status: "answered" },
      { priority: "nice_to_have", status: "pending" },
    ];
    expect(shouldTriggerRecondense(gaps)).toBe(true);
  });

  it("does not trigger recondense when required gaps are still pending", () => {
    const gaps = [
      { priority: "required", status: "answered" },
      { priority: "required", status: "pending" },
      { priority: "nice_to_have", status: "pending" },
    ];
    expect(shouldTriggerRecondense(gaps)).toBe(false);
  });

  it("triggers recondense when only nice_to_have gaps remain", () => {
    const gaps = [
      { priority: "nice_to_have", status: "pending" },
      { priority: "nice_to_have", status: "skipped" },
    ];
    expect(shouldTriggerRecondense(gaps)).toBe(true);
  });

  it("triggers recondense when no gaps exist (edge case)", () => {
    expect(shouldTriggerRecondense([])).toBe(true);
  });
});
