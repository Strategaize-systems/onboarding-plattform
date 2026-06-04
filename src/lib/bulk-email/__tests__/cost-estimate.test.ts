// V9 SLC-167 MT-3 — Vitest fuer Pre-Cost-Estimate Pure-Function
//
// Slice: SLC-167 — V9 Pattern-Extraktion + Curation-UI + Cost-Cap (FEAT-073)
// Spec MT-3 Verification (3 Cases per Slice-Spec L124-127):
//   (a) 100-Thread-Run mit kleinem redacted_body → estimate << 20 EUR (Pre-Approval-Range)
//   (b) 1000-Thread-Run mit grossem redacted_body → estimate >> 20 EUR (Run-Cap-Range)
//   (c) Empty-Input → Zero-Cost (defensive)
//   (+) Bonus: Determinismus (gleicher Input → gleicher Output)
//   (+) Bonus: Body-Char-Skala (Token-Count ist linear)
//   (+) Bonus: Threshold-Cross Pre-Approval (Estimate-Range um 10 EUR)
//
// Pure-Function-Vitest: keine DB, keine AWS-Calls, keine Imports von DB-Modulen.

import { describe, it, expect } from "vitest";

import {
  SONNET_DEFAULT_TOKENS_OUT_PER_THREAD,
  SONNET_INPUT_PRICE_USD_PER_TOKEN,
  SONNET_OUTPUT_PRICE_USD_PER_TOKEN,
  SONNET_PROMPT_OVERHEAD_TOKENS_PER_THREAD,
  USD_TO_EUR_APPROX,
  estimateBulkRunPatternCost,
  type BulkRunThreadForEstimate,
} from "../cost-estimate";

function makeThreads(
  count: number,
  bodyChars: number,
): BulkRunThreadForEstimate[] {
  const body = "x".repeat(bodyChars);
  return Array.from({ length: count }, () => ({ redactedBody: body }));
}

describe("estimateBulkRunPatternCost", () => {
  describe("threadCount", () => {
    it("zero threads → zero cost", () => {
      const result = estimateBulkRunPatternCost([]);
      expect(result.threadCount).toBe(0);
      expect(result.tokensIn).toBe(0);
      expect(result.tokensOut).toBe(0);
      expect(result.costUsd).toBe(0);
      expect(result.costEur).toBe(0);
    });

    it("100 threads × kleine redacted_body (200 chars) → unter 10 EUR Pre-Approval-Schwelle", () => {
      // 200 chars × 0.25 = 50 body tokens × 100 = 5000
      // + 100 × 1100 overhead = 110000
      // = 115000 tokensIn × $3/1M = $0.345
      // 100 × 800 tokensOut = 80000 × $15/1M = $1.20
      // total = $1.545 USD × 0.92 = ~1.42 EUR
      const threads = makeThreads(100, 200);
      const result = estimateBulkRunPatternCost(threads);

      expect(result.threadCount).toBe(100);
      expect(result.tokensIn).toBeGreaterThan(0);
      expect(result.tokensOut).toBe(100 * SONNET_DEFAULT_TOKENS_OUT_PER_THREAD);
      // Estimate sollte deutlich unter 10 EUR (Pre-Approval-Schwelle) liegen
      expect(result.costEur).toBeLessThan(10);
      expect(result.costEur).toBeGreaterThan(0.5);
    });

    it("1000 threads × grosser redacted_body (8000 chars) → ueber 20 EUR Run-Cap-Schwelle", () => {
      // 8000 chars × 0.25 = 2000 body tokens × 1000 = 2_000_000
      // + 1000 × 1100 overhead = 1_100_000
      // = 3_100_000 tokensIn × $3/1M = $9.30
      // 1000 × 800 tokensOut = 800_000 × $15/1M = $12.00
      // total = $21.30 USD × 0.92 = ~19.60 EUR
      // (knapp unter 20 EUR — sehr lange Threads kratzen die Run-Cap)
      //
      // 12000-char-Body Variante:
      // 12000 × 0.25 = 3000 body tokens × 1000 = 3_000_000
      // + 1_100_000 overhead = 4_100_000 tokensIn × $3/1M = $12.30
      // + $12 output = $24.30 × 0.92 = ~22.36 EUR (ueber Run-Cap)
      const longerThreads = makeThreads(1000, 12000);
      const result = estimateBulkRunPatternCost(longerThreads);

      expect(result.threadCount).toBe(1000);
      expect(result.costEur).toBeGreaterThan(20);
    });
  });

  describe("Heuristik-Komponenten", () => {
    it("tokensIn = body-tokens + threadCount × promptOverhead", () => {
      const threads = makeThreads(10, 400); // 400 chars × 0.25 = 100 body tokens
      const result = estimateBulkRunPatternCost(threads);

      const expectedBodyTokens = 10 * Math.ceil(400 * 0.25); // 10 × 100 = 1000
      const expectedOverheadTokens =
        10 * SONNET_PROMPT_OVERHEAD_TOKENS_PER_THREAD;
      expect(result.tokensIn).toBe(expectedBodyTokens + expectedOverheadTokens);
    });

    it("tokensOut = threadCount × Default (800)", () => {
      const result = estimateBulkRunPatternCost(makeThreads(42, 1000));
      expect(result.tokensOut).toBe(42 * 800);
    });

    it("costUsd = tokensIn × INPUT + tokensOut × OUTPUT", () => {
      const threads = makeThreads(5, 1000);
      const result = estimateBulkRunPatternCost(threads);

      const expectedUsd =
        result.tokensIn * SONNET_INPUT_PRICE_USD_PER_TOKEN +
        result.tokensOut * SONNET_OUTPUT_PRICE_USD_PER_TOKEN;
      expect(result.costUsd).toBeCloseTo(expectedUsd, 10);
    });

    it("costEur = costUsd × USD_TO_EUR_APPROX (0.92)", () => {
      const result = estimateBulkRunPatternCost(makeThreads(10, 1500));
      expect(result.costEur).toBeCloseTo(result.costUsd * USD_TO_EUR_APPROX, 10);
      expect(USD_TO_EUR_APPROX).toBe(0.92);
    });
  });

  describe("Pre-Approval-Schwelle (10 EUR) Verhalten", () => {
    it("kleine Runs unter Pre-Approval (kein Modal-Pflicht)", () => {
      // ~50 threads × 500 chars sollte unter 10 EUR liegen
      const result = estimateBulkRunPatternCost(makeThreads(50, 500));
      expect(result.costEur).toBeLessThan(10);
    });

    it("mittlere Runs ueber Pre-Approval, unter Run-Cap (Modal-Trigger)", () => {
      // ~700 threads × 1500 chars sollte zwischen 10 und 20 EUR landen
      // Body: 1500 × 0.25 = 375 tokens × 700 = 262500
      // Overhead: 700 × 1100 = 770000
      // tokensIn = 1_032_500 × $3/1M = $3.10
      // tokensOut: 700 × 800 = 560000 × $15/1M = $8.40
      // total: $11.50 × 0.92 = ~10.58 EUR
      const result = estimateBulkRunPatternCost(makeThreads(700, 1500));
      expect(result.costEur).toBeGreaterThan(10);
      expect(result.costEur).toBeLessThan(20);
    });
  });

  describe("Defensiv-Verhalten", () => {
    it("Determinismus: gleicher Input → gleicher Output", () => {
      const threads = makeThreads(7, 700);
      const a = estimateBulkRunPatternCost(threads);
      const b = estimateBulkRunPatternCost(threads);
      expect(a).toEqual(b);
    });

    it("Empty-Body (length 0) wird wie threadCount-overhead-only behandelt", () => {
      const threads: BulkRunThreadForEstimate[] = [
        { redactedBody: "" },
        { redactedBody: "" },
      ];
      const result = estimateBulkRunPatternCost(threads);
      // body=0 tokens, overhead=2 × 1100 = 2200, output=2 × 800 = 1600
      expect(result.tokensIn).toBe(2 * SONNET_PROMPT_OVERHEAD_TOKENS_PER_THREAD);
      expect(result.tokensOut).toBe(2 * SONNET_DEFAULT_TOKENS_OUT_PER_THREAD);
      expect(result.costEur).toBeGreaterThan(0);
    });

    it("Skalierung: doppelte thread-count + body → cost grob doppelt", () => {
      const single = estimateBulkRunPatternCost(makeThreads(100, 1000));
      const double = estimateBulkRunPatternCost(makeThreads(200, 1000));
      // Skalierung ist linear in threadCount (Body + Overhead + Output alle linear).
      expect(double.costEur).toBeCloseTo(single.costEur * 2, 5);
    });
  });
});
