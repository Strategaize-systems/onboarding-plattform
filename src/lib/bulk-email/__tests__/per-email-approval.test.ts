// V9.1 SLC-V9.1-B MT-1 — Vitest fuer Per-Email-Approval Pre-Cost-Estimate.
//
// Slice: SLC-V9.1-B (FEAT-077) / Spec MT-1 Verification.
// Pure-Functions: kein DB-/Bedrock-Call. Deterministisch.

import { describe, it, expect, afterEach } from "vitest";

import {
  DEFAULT_PER_EMAIL_BASELINE_EUR,
  DEFAULT_PER_EMAIL_APPROVAL_THRESHOLD_EUR,
  estimatePatternExtractionCost,
  requiresPerEmailApproval,
  resolvePerEmailBaselineEur,
  resolvePerEmailApprovalThresholdEur,
} from "../per-email-approval";

// ────────────────────────────────────────────────────────────────────────────
// Konstanten
// ────────────────────────────────────────────────────────────────────────────

describe("per-email-approval Defaults", () => {
  it("DEFAULT_PER_EMAIL_BASELINE_EUR = 0.006 (5 EUR/1000 * 1.2 Buffer)", () => {
    expect(DEFAULT_PER_EMAIL_BASELINE_EUR).toBeCloseTo(0.006, 6);
  });
  it("DEFAULT_PER_EMAIL_APPROVAL_THRESHOLD_EUR = 0.5 (DEC-197 Option B)", () => {
    expect(DEFAULT_PER_EMAIL_APPROVAL_THRESHOLD_EUR).toBe(0.5);
  });
});

describe("resolvePerEmailBaselineEur / resolvePerEmailApprovalThresholdEur", () => {
  it("Fallback ohne ENV", () => {
    expect(resolvePerEmailBaselineEur({})).toBeCloseTo(0.006, 6);
    expect(resolvePerEmailApprovalThresholdEur({})).toBe(0.5);
  });
  it("ENV-Override", () => {
    expect(
      resolvePerEmailBaselineEur({ V91_BULK_EMAIL_PER_EMAIL_BASELINE_EUR: "0.6" }),
    ).toBe(0.6);
    expect(
      resolvePerEmailApprovalThresholdEur({
        V91_BULK_EMAIL_PER_EMAIL_APPROVAL_THRESHOLD_EUR: "1.0",
      }),
    ).toBe(1.0);
  });
  it("Ungueltiger ENV-Wert faellt auf Default", () => {
    expect(
      resolvePerEmailBaselineEur({ V91_BULK_EMAIL_PER_EMAIL_BASELINE_EUR: "x" }),
    ).toBeCloseTo(0.006, 6);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// estimatePatternExtractionCost
// ────────────────────────────────────────────────────────────────────────────

describe("estimatePatternExtractionCost", () => {
  it("1000 Emails @ Baseline -> total ~6.0 EUR, per-Email ~0.006 EUR", () => {
    const est = estimatePatternExtractionCost(1000);
    expect(est.emailCount).toBe(1000);
    expect(est.perEmailEur).toBeCloseTo(0.006, 6);
    expect(est.totalEur).toBeCloseTo(6.0, 4);
  });

  it("100 Emails @ Baseline -> per-Email weit unter 0.50 Schwelle", () => {
    const est = estimatePatternExtractionCost(100);
    expect(est.perEmailEur).toBeCloseTo(0.006, 6);
    expect(est.totalEur).toBeCloseTo(0.6, 4);
  });

  it("Outlier-Override: 100 Emails @ 0.6 EUR/Email -> per-Email 0.6, total 60", () => {
    const est = estimatePatternExtractionCost(100, 0.6);
    expect(est.perEmailEur).toBe(0.6);
    expect(est.totalEur).toBeCloseTo(60, 4);
  });

  it("0 Emails -> emailCount 0 + totalEur 0 (perEmailEur bleibt die Baseline-Rate)", () => {
    const est = estimatePatternExtractionCost(0);
    expect(est.emailCount).toBe(0);
    expect(est.totalEur).toBe(0);
    expect(est.perEmailEur).toBeCloseTo(0.006, 6);
  });

  it("Negative/nicht-finite Inputs normalisieren auf 0", () => {
    expect(estimatePatternExtractionCost(-5).emailCount).toBe(0);
    expect(estimatePatternExtractionCost(Number.NaN).emailCount).toBe(0);
    expect(estimatePatternExtractionCost(50, -1).perEmailEur).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// requiresPerEmailApproval — Outlier-Guard (DEC-197)
// ────────────────────────────────────────────────────────────────────────────

describe("requiresPerEmailApproval", () => {
  it("Baseline-Estimate (0.006 EUR/Email) -> NICHT required (Outlier-Guard, kein Routine-Gate)", () => {
    const est = estimatePatternExtractionCost(100); // 0.006/Email
    expect(requiresPerEmailApproval(est, 0.5)).toBe(false);
  });

  it("Outlier-Estimate (0.6 EUR/Email > 0.5) -> required (MT-3 Pause-Pfad)", () => {
    const est = estimatePatternExtractionCost(100, 0.6);
    expect(requiresPerEmailApproval(est, 0.5)).toBe(true);
  });

  it("Genau auf der Schwelle (0.5 == 0.5) -> NICHT required (strikt groesser)", () => {
    const est = estimatePatternExtractionCost(10, 0.5);
    expect(requiresPerEmailApproval(est, 0.5)).toBe(false);
  });

  it("Knapp ueber Schwelle (0.51 > 0.5) -> required", () => {
    const est = estimatePatternExtractionCost(10, 0.51);
    expect(requiresPerEmailApproval(est, 0.5)).toBe(true);
  });

  it("Default-Threshold (0.5) wird genutzt wenn nicht uebergeben", () => {
    const baseline = estimatePatternExtractionCost(100);
    expect(requiresPerEmailApproval(baseline)).toBe(false);
    const outlier = estimatePatternExtractionCost(100, 0.7);
    expect(requiresPerEmailApproval(outlier)).toBe(true);
  });
});

// Kein ENV-Leak zwischen Tests.
afterEach(() => {
  delete process.env.V91_BULK_EMAIL_PER_EMAIL_BASELINE_EUR;
  delete process.env.V91_BULK_EMAIL_PER_EMAIL_APPROVAL_THRESHOLD_EUR;
});
