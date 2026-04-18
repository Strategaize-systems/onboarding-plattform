// Output Parser — JSON extraction + validation for analyst and challenger outputs.
// Handles non-deterministic LLM responses: markdown fences, trailing text, etc.

import type {
  AnalystOutput,
  ChallengerOutput,
  ChallengerVerdict,
} from "./types";

/** Extract JSON from a potentially messy LLM response */
export function extractJSON(raw: string): string {
  let text = raw.trim();

  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Try to find JSON object boundaries
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  return text;
}

/** Validate and normalize analyst output */
export function parseAnalystOutput(
  raw: string,
  expectedBlockKey: string,
  knownQuestionIds: string[]
): { output: AnalystOutput; warnings: string[] } {
  const warnings: string[] = [];
  const jsonStr = extractJSON(raw);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Analyst output is not valid JSON: ${jsonStr.substring(0, 200)}...`);
  }

  // Validate required fields
  if (!Array.isArray(parsed.debrief_items)) {
    throw new Error("Analyst output missing 'debrief_items' array");
  }

  // Normalize block_key
  const blockKey = String(parsed.block_key || expectedBlockKey);

  // Normalize debrief items
  const items = (parsed.debrief_items as Record<string, unknown>[]).map(
    (item, idx) => {
      // Validate and normalize unit_type
      const unitType = normalizeUnitType(String(item.unit_type || "observation"));
      if (unitType !== item.unit_type) {
        warnings.push(`Item ${idx}: unit_type "${item.unit_type}" normalized to "${unitType}"`);
      }

      // Validate confidence
      const confidence = normalizeConfidence(String(item.confidence || "medium"));

      // Validate priority
      const priority = normalizePriority(String(item.priority || "P2"));
      if (priority !== item.priority) {
        warnings.push(`Item ${idx}: priority "${item.priority}" normalized to "${priority}"`);
      }

      // Validate traffic_light
      const trafficLight = normalizeTrafficLight(String(item.traffic_light || "yellow"));

      // Validate effort
      const effort = normalizeEffort(String(item.effort || "M"));
      if (effort !== item.effort) {
        warnings.push(`Item ${idx}: effort "${item.effort}" normalized to "${effort}"`);
      }

      // Validate scores
      const maturity = clampScore(Number(item.maturity) || 0);
      const risk = clampScore(Number(item.risk) || 0);
      const leverage = clampScore(Number(item.leverage) || 0);

      // Validate evidence_refs
      const evidenceRefs = Array.isArray(item.evidence_refs)
        ? (item.evidence_refs as string[]).filter((ref) => {
            if (!knownQuestionIds.includes(ref)) {
              warnings.push(`Item ${idx}: evidence_ref "${ref}" not in known question IDs`);
              return false;
            }
            return true;
          })
        : [];

      if (evidenceRefs.length === 0) {
        warnings.push(`Item ${idx} ("${item.subtopic}"): no valid evidence_refs`);
      }

      return {
        subtopic: String(item.subtopic || `Subtopic ${idx + 1}`),
        unit_type: unitType,
        title: String(item.title || "Untitled"),
        current_state: String(item.current_state || ""),
        target_state: String(item.target_state || ""),
        body: String(item.body || ""),
        confidence,
        maturity,
        risk,
        leverage,
        priority,
        traffic_light: trafficLight,
        recommendation: String(item.recommendation || ""),
        next_step: String(item.next_step || ""),
        owner: String(item.owner || ""),
        effort,
        dependencies: Array.isArray(item.dependencies)
          ? (item.dependencies as string[])
          : [],
        tags: Array.isArray(item.tags) ? (item.tags as string[]) : [],
        evidence_refs: evidenceRefs,
      };
    }
  );

  // Normalize ko_assessment
  const koAssessment = Array.isArray(parsed.ko_assessment)
    ? (parsed.ko_assessment as Record<string, unknown>[]).map((ko) => ({
        question_id: String(ko.question_id || ""),
        flag: String(ko.flag || ""),
        status: normalizeKoStatus(String(ko.status || "ok")),
        note: String(ko.note || ""),
      }))
    : [];

  const output: AnalystOutput = {
    block_key: blockKey,
    debrief_items: items,
    ko_assessment: koAssessment,
    sop_gaps: normalizeStringArray(parsed.sop_gaps),
    cross_block_observations: normalizeStringArray(parsed.cross_block_observations),
    confidence_notes: normalizeStringArray(parsed.confidence_notes),
    challenger_responses: Array.isArray(parsed.challenger_responses)
      ? (parsed.challenger_responses as Record<string, unknown>[]).map((r) => ({
          finding_id: String(r.finding_id || ""),
          response: String(r.response || ""),
        }))
      : undefined,
  };

  return { output, warnings };
}

/** Validate and normalize challenger output */
export function parseChallengerOutput(raw: string): {
  output: ChallengerOutput;
  warnings: string[];
} {
  const warnings: string[] = [];
  const jsonStr = extractJSON(raw);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Challenger output is not valid JSON: ${jsonStr.substring(0, 200)}...`);
  }

  // Validate verdict
  const verdict = normalizeVerdict(String(parsed.verdict || "NEEDS_REVISION"));
  if (verdict !== parsed.verdict) {
    warnings.push(`Verdict "${parsed.verdict}" normalized to "${verdict}"`);
  }

  // Parse findings
  const findings = Array.isArray(parsed.findings)
    ? (parsed.findings as Record<string, unknown>[]).map((f, idx) => ({
        id: String(f.id || `F-${idx + 1}`),
        category: String(f.category || ""),
        severity: normalizeSeverity(String(f.severity || "minor")),
        title: String(f.title || ""),
        description: String(f.description || ""),
        affected_items: Array.isArray(f.affected_items)
          ? (f.affected_items as string[])
          : [],
        expected_action: String(f.expected_action || ""),
        evidence: f.evidence ? String(f.evidence) : undefined,
      }))
    : [];

  // Parse statistics
  const stats = (parsed.statistics as Record<string, unknown>) || {};
  const statistics = {
    total_findings: Number(stats.total_findings) || findings.length,
    critical: Number(stats.critical) || findings.filter((f) => f.severity === "critical").length,
    major: Number(stats.major) || findings.filter((f) => f.severity === "major").length,
    minor: Number(stats.minor) || findings.filter((f) => f.severity === "minor").length,
    notes: Number(stats.notes) || findings.filter((f) => f.severity === "note").length,
    subtopic_coverage: String(stats.subtopic_coverage || "unknown"),
  };

  const output: ChallengerOutput = {
    verdict,
    verdict_rationale: String(parsed.verdict_rationale || ""),
    findings,
    statistics,
    positive_observations: normalizeStringArray(parsed.positive_observations),
  };

  return { output, warnings };
}

// --- Normalization helpers ---

function normalizeUnitType(raw: string): "finding" | "risk" | "action" | "observation" {
  const lower = raw.toLowerCase().trim();
  if (lower === "finding") return "finding";
  if (lower === "risk") return "risk";
  if (lower === "action") return "action";
  return "observation";
}

function normalizeConfidence(raw: string): "low" | "medium" | "high" {
  const lower = raw.toLowerCase().trim();
  if (lower === "low") return "low";
  if (lower === "high") return "high";
  return "medium";
}

function normalizePriority(raw: string): "P0" | "P1" | "P2" | "P3" {
  const upper = raw.toUpperCase().trim();
  if (upper === "P0" || upper === "CRITICAL") return "P0";
  if (upper === "P1" || upper === "HIGH") return "P1";
  if (upper === "P2" || upper === "MEDIUM") return "P2";
  if (upper === "P3" || upper === "LOW") return "P3";
  return "P2";
}

function normalizeTrafficLight(raw: string): "red" | "yellow" | "green" {
  const lower = raw.toLowerCase().trim();
  if (lower === "red") return "red";
  if (lower === "green") return "green";
  return "yellow";
}

function normalizeEffort(raw: string): "S" | "M" | "L" {
  const upper = raw.toUpperCase().trim();
  if (upper === "S" || upper === "XS" || upper === "SMALL") return "S";
  if (upper === "L" || upper === "XL" || upper === "LARGE") return "L";
  return "M";
}

function normalizeKoStatus(raw: string): "critical" | "warning" | "ok" {
  const lower = raw.toLowerCase().trim();
  if (lower === "critical") return "critical";
  if (lower === "warning") return "warning";
  return "ok";
}

function normalizeVerdict(raw: string): ChallengerVerdict {
  const upper = raw.toUpperCase().replace(/[^A-Z_]/g, "");
  if (upper === "ACCEPTED") return "ACCEPTED";
  if (upper === "ACCEPTED_WITH_NOTES" || upper === "ACCEPTEDWITHNOTES")
    return "ACCEPTED_WITH_NOTES";
  if (upper === "REJECTED") return "REJECTED";
  return "NEEDS_REVISION";
}

function normalizeSeverity(raw: string): "critical" | "major" | "minor" | "note" {
  const lower = raw.toLowerCase().trim();
  if (lower === "critical") return "critical";
  if (lower === "major") return "major";
  if (lower === "note") return "note";
  return "minor";
}

function normalizeStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((v) => String(v)).filter((v) => v.trim().length > 0);
}

function clampScore(val: number): number {
  return Math.max(0, Math.min(10, Math.round(val)));
}
