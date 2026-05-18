/**
 * V7 SLC-134 MT-5 — Service-Key-Timing-Safe-Statistical-Test.
 *
 * Verifiziert, dass `verifyServiceKey` constant-time vergleicht (kein
 * Timing-Leak ueber Mismatch-Position). 4 Varianten, je N Iterationen,
 * Mean-Time-Differenz darf eine kleine Schwelle nicht ueberschreiten.
 *
 * Pattern-Reuse: crypto.timingSafeEqual garantiert constant-time bei
 * gleicher Buffer-Laenge. Test validiert das durch Mean-Time-Sampling
 * statt nur durch Code-Review.
 *
 * Bound-Choice: 200ns laut Slice-Spec MT-5. Wenn Hetzner-Coolify-CI das
 * nicht haelt (performance.now()-Aufloesung ~1us auf vielen Setups),
 * wird der Bound auf 500ns hochgesetzt + im Pen-Test-Report als
 * Residual-Risk dokumentiert (Slice R-3).
 */

import { describe, expect, it } from "vitest";

import { verifyServiceKey } from "../service-key";

const KEY_LEN = 64; // gleiche Laenge wie pentest-Default-Key
const ITERATIONS = 1000;

const CORRECT = "a".repeat(KEY_LEN);
const FIRST_BYTE_WRONG = "b" + "a".repeat(KEY_LEN - 1);
const LAST_BYTE_WRONG = "a".repeat(KEY_LEN - 1) + "b";
const ALL_DIFFERENT = "z".repeat(KEY_LEN);

/** Liefert Mean-Zeit pro Iteration in ms. */
function measureMean(headerValue: string, iterations: number): number {
  // Warm-up (V8 JIT) — 200 ungemessene Iterations
  for (let i = 0; i < 200; i++) {
    verifyServiceKey(headerValue, CORRECT);
  }
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    verifyServiceKey(headerValue, CORRECT);
  }
  const elapsed = performance.now() - t0;
  return elapsed / iterations;
}

describe("V7 SLC-134 MT-5 — verifyServiceKey Timing-Safe Statistical Test", () => {
  it("Mean-Time aller Varianten gleicher Laenge liegt innerhalb 200ns von Variante A (Slice-Bound)", () => {
    const meanA = measureMean(CORRECT, ITERATIONS);
    const meanB = measureMean(FIRST_BYTE_WRONG, ITERATIONS);
    const meanC = measureMean(LAST_BYTE_WRONG, ITERATIONS);
    const meanD = measureMean(ALL_DIFFERENT, ITERATIONS);

    // 200ns Bound (Slice MT-5). performance.now() liefert ms.
    const BOUND_MS = 0.0002; // 200ns = 0.0002ms

    const diffB = Math.abs(meanB - meanA);
    const diffC = Math.abs(meanC - meanA);
    const diffD = Math.abs(meanD - meanA);

    // Print fuer Pen-Test-Report (auch im PASS-Fall sichtbar)
    console.log(
      `[MT-5 timing] meanA=${(meanA * 1_000_000).toFixed(2)}ns  ` +
        `meanB=${(meanB * 1_000_000).toFixed(2)}ns (diff=${(diffB * 1_000_000).toFixed(2)}ns)  ` +
        `meanC=${(meanC * 1_000_000).toFixed(2)}ns (diff=${(diffC * 1_000_000).toFixed(2)}ns)  ` +
        `meanD=${(meanD * 1_000_000).toFixed(2)}ns (diff=${(diffD * 1_000_000).toFixed(2)}ns)`
    );

    expect(diffB).toBeLessThan(BOUND_MS);
    expect(diffC).toBeLessThan(BOUND_MS);
    expect(diffD).toBeLessThan(BOUND_MS);
  });

  it("Length-Mismatch wird in constant-time abgewiesen (kein Crash, kein Leak)", () => {
    // Buffer.length-Mismatch fuehrt zu return false vor timingSafeEqual.
    // Verifikation: 1000 Iterations Mean < 50us (vor Crash war ein
    // Length-Mismatch-Crash dokumentiert) UND result ist immer false.
    const shorter = "a".repeat(KEY_LEN - 10);
    const longer = "a".repeat(KEY_LEN + 10);

    let allFalse = true;
    const t0 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const r1 = verifyServiceKey(shorter, CORRECT);
      const r2 = verifyServiceKey(longer, CORRECT);
      if (r1 !== false || r2 !== false) {
        allFalse = false;
        break;
      }
    }
    const meanUs = ((performance.now() - t0) / (ITERATIONS * 2)) * 1000;

    expect(allFalse).toBe(true);
    expect(meanUs).toBeLessThan(50);
  });

  it("Verify-Correct-Key liefert true, Verify-Wrong-Key liefert false (Sanity)", () => {
    expect(verifyServiceKey(CORRECT, CORRECT)).toBe(true);
    expect(verifyServiceKey(FIRST_BYTE_WRONG, CORRECT)).toBe(false);
    expect(verifyServiceKey(LAST_BYTE_WRONG, CORRECT)).toBe(false);
    expect(verifyServiceKey(ALL_DIFFERENT, CORRECT)).toBe(false);
    expect(verifyServiceKey(null, CORRECT)).toBe(false);
    expect(verifyServiceKey("", CORRECT)).toBe(false);
  });
});
