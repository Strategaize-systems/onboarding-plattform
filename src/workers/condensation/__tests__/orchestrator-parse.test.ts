import { describe, it, expect } from "vitest";
import { parseOrchestratorOutput } from "../parse-output";

describe("parseOrchestratorOutput", () => {
  it("parses a valid orchestrator output", () => {
    const raw = JSON.stringify({
      overall_score: 72,
      coverage: {
        covered_subtopics: ["A1 Grundverstaendnis", "A2 Marktposition"],
        missing_subtopics: ["A3 Wettbewerb"],
        coverage_ratio: "6/8",
      },
      evidence_quality: {
        strong_evidence: ["A1 — direkte Zahlenangaben"],
        weak_evidence: ["A4 — vage Aussagen"],
        no_evidence: ["A3 — keine Antwort"],
        score: 65,
      },
      consistency: {
        consistent: true,
        issues: [],
        score: 85,
      },
      gap_questions: [
        {
          question_text: "Wie hoch ist der Marktanteil?",
          context: "Marktposition ohne Zahlen",
          subtopic: "A2 Marktposition",
          priority: "required",
          related_ku_title: "Marktpositionierung",
        },
      ],
      recommendation: "needs_backspelling",
      recommendation_rationale: "Kernbereiche abgedeckt, aber A3 fehlt.",
    });

    const { output, warnings } = parseOrchestratorOutput(raw);

    expect(warnings).toHaveLength(0);
    expect(output.overall_score).toBe(72);
    expect(output.coverage.covered_subtopics).toEqual(["A1 Grundverstaendnis", "A2 Marktposition"]);
    expect(output.coverage.missing_subtopics).toEqual(["A3 Wettbewerb"]);
    expect(output.coverage.coverage_ratio).toBe("6/8");
    expect(output.evidence_quality.score).toBe(65);
    expect(output.consistency.consistent).toBe(true);
    expect(output.consistency.score).toBe(85);
    expect(output.gap_questions).toHaveLength(1);
    expect(output.gap_questions[0].question_text).toBe("Wie hoch ist der Marktanteil?");
    expect(output.gap_questions[0].priority).toBe("required");
    expect(output.gap_questions[0].related_ku_title).toBe("Marktpositionierung");
    expect(output.recommendation).toBe("needs_backspelling");
    expect(output.recommendation_rationale).toBe("Kernbereiche abgedeckt, aber A3 fehlt.");
  });

  it("handles markdown-fenced JSON", () => {
    const raw = "```json\n" + JSON.stringify({
      overall_score: 80,
      coverage: { covered_subtopics: [], missing_subtopics: [], coverage_ratio: "5/5" },
      evidence_quality: { strong_evidence: [], weak_evidence: [], no_evidence: [], score: 80 },
      consistency: { consistent: true, issues: [], score: 90 },
      gap_questions: [],
      recommendation: "sufficient",
      recommendation_rationale: "Alles OK.",
    }) + "\n```";

    const { output, warnings } = parseOrchestratorOutput(raw);

    expect(warnings).toHaveLength(0);
    expect(output.overall_score).toBe(80);
    expect(output.recommendation).toBe("sufficient");
  });

  it("clamps overall_score to 0-100", () => {
    const raw = JSON.stringify({
      overall_score: 150,
      coverage: { covered_subtopics: [], missing_subtopics: [], coverage_ratio: "0/0" },
      evidence_quality: { strong_evidence: [], weak_evidence: [], no_evidence: [], score: -10 },
      consistency: { consistent: true, issues: [], score: 200 },
      gap_questions: [],
      recommendation: "sufficient",
      recommendation_rationale: "",
    });

    const { output } = parseOrchestratorOutput(raw);

    expect(output.overall_score).toBe(100);
    expect(output.evidence_quality.score).toBe(0);
    expect(output.consistency.score).toBe(100);
  });

  it("normalizes invalid recommendation to 'sufficient'", () => {
    const raw = JSON.stringify({
      overall_score: 50,
      coverage: { covered_subtopics: [], missing_subtopics: [], coverage_ratio: "0/0" },
      evidence_quality: { strong_evidence: [], weak_evidence: [], no_evidence: [], score: 50 },
      consistency: { consistent: true, issues: [], score: 50 },
      gap_questions: [],
      recommendation: "maybe_ok",
      recommendation_rationale: "",
    });

    const { output, warnings } = parseOrchestratorOutput(raw);

    expect(output.recommendation).toBe("sufficient");
    expect(warnings).toContain('Recommendation "maybe_ok" normalized to "sufficient"');
  });

  it("caps gap_questions at 8", () => {
    const gaps = Array.from({ length: 12 }, (_, i) => ({
      question_text: `Question ${i}`,
      context: `Context ${i}`,
      subtopic: `Subtopic ${i}`,
      priority: "required",
    }));

    const raw = JSON.stringify({
      overall_score: 30,
      coverage: { covered_subtopics: [], missing_subtopics: [], coverage_ratio: "0/0" },
      evidence_quality: { strong_evidence: [], weak_evidence: [], no_evidence: [], score: 30 },
      consistency: { consistent: false, issues: ["Widerspruch"], score: 40 },
      gap_questions: gaps,
      recommendation: "critical_gaps",
      recommendation_rationale: "Zu viele Luecken.",
    });

    const { output } = parseOrchestratorOutput(raw);

    expect(output.gap_questions).toHaveLength(8);
    expect(output.recommendation).toBe("critical_gaps");
    expect(output.consistency.consistent).toBe(false);
    expect(output.consistency.issues).toEqual(["Widerspruch"]);
  });

  it("normalizes invalid priority to 'required'", () => {
    const raw = JSON.stringify({
      overall_score: 60,
      coverage: { covered_subtopics: [], missing_subtopics: [], coverage_ratio: "0/0" },
      evidence_quality: { strong_evidence: [], weak_evidence: [], no_evidence: [], score: 60 },
      consistency: { consistent: true, issues: [], score: 60 },
      gap_questions: [
        { question_text: "Q1", context: "C1", subtopic: "S1", priority: "important" },
        { question_text: "Q2", context: "C2", subtopic: "S2", priority: "nice_to_have" },
      ],
      recommendation: "sufficient",
      recommendation_rationale: "",
    });

    const { output, warnings } = parseOrchestratorOutput(raw);

    expect(output.gap_questions[0].priority).toBe("required");
    expect(output.gap_questions[1].priority).toBe("nice_to_have");
    expect(warnings.some((w) => w.includes("important"))).toBe(true);
  });

  it("handles missing fields gracefully", () => {
    const raw = JSON.stringify({
      overall_score: 45,
    });

    const { output } = parseOrchestratorOutput(raw);

    expect(output.overall_score).toBe(45);
    expect(output.coverage.covered_subtopics).toEqual([]);
    expect(output.coverage.missing_subtopics).toEqual([]);
    expect(output.evidence_quality.score).toBe(0);
    expect(output.consistency.consistent).toBe(true);
    expect(output.gap_questions).toEqual([]);
    expect(output.recommendation).toBe("sufficient");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseOrchestratorOutput("not json at all")).toThrow(
      "Orchestrator output is not valid JSON"
    );
  });
});
