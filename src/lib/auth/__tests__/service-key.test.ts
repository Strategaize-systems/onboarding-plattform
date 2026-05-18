import { describe, it, expect } from "vitest";
import { randomBytes, createHash } from "node:crypto";

import { verifyServiceKey, hashWithSha256 } from "../service-key";

describe("verifyServiceKey", () => {
  it("throws when expected key is undefined (ENV misconfig)", () => {
    expect(() => verifyServiceKey("any-value", undefined)).toThrow(
      /PUBLIC_SIGNUP_SERVICE_KEY/
    );
  });

  it("returns false when header is null", () => {
    expect(verifyServiceKey(null, "secret")).toBe(false);
  });

  it("returns false when header is empty string", () => {
    expect(verifyServiceKey("", "secret")).toBe(false);
  });

  it("returns false when header has different length than expected key", () => {
    // length-mismatch must not crash timingSafeEqual (Buffer-API would throw)
    expect(verifyServiceKey("short", "longer-secret")).toBe(false);
  });

  it("returns false when header has same length but different content", () => {
    expect(verifyServiceKey("abcdef", "abcxyz")).toBe(false);
  });

  it("returns true when header matches expected key exactly", () => {
    const key = randomBytes(32).toString("hex");
    expect(verifyServiceKey(key, key)).toBe(true);
  });

  it("performs constant-time compare regardless of prefix-mismatch position (statistical timing test)", () => {
    // 1000-iter statistical test per slice AC-6.
    // expectedKey = "a" * 64. Two candidate keys both 64-length:
    // - earlyMismatch: differs in 1st byte ("b" + "a" * 63)
    // - lateMismatch:  differs in 64th byte ("a" * 63 + "b")
    // A naive `===` early-exits on byte-1 for earlyMismatch and runs through
    // all 64 bytes for lateMismatch — mean-time difference would be measurable.
    // timingSafeEqual must process both keys in identical time.
    //
    // Threshold: 200ns mean-difference budget per R-2 (Slow-container-friendly).
    const expectedKey = "a".repeat(64);
    const earlyMismatch = "b" + "a".repeat(63);
    const lateMismatch = "a".repeat(63) + "b";

    const ITERATIONS = 1000;
    const earlyTimings: bigint[] = [];
    const lateTimings: bigint[] = [];

    // Warmup so the JIT settles before measurements.
    for (let i = 0; i < 100; i++) {
      verifyServiceKey(earlyMismatch, expectedKey);
      verifyServiceKey(lateMismatch, expectedKey);
    }

    for (let i = 0; i < ITERATIONS; i++) {
      const t1 = process.hrtime.bigint();
      verifyServiceKey(earlyMismatch, expectedKey);
      const t2 = process.hrtime.bigint();
      verifyServiceKey(lateMismatch, expectedKey);
      const t3 = process.hrtime.bigint();
      earlyTimings.push(t2 - t1);
      lateTimings.push(t3 - t2);
    }

    const meanEarly =
      earlyTimings.reduce((acc, n) => acc + n, BigInt(0)) / BigInt(ITERATIONS);
    const meanLate =
      lateTimings.reduce((acc, n) => acc + n, BigInt(0)) / BigInt(ITERATIONS);
    const delta = meanEarly > meanLate ? meanEarly - meanLate : meanLate - meanEarly;

    // 200ns budget for slow CI containers. Real timingSafeEqual deltas are
    // sub-50ns on bare metal but the node:20 container in Coolify adds noise.
    expect(Number(delta)).toBeLessThan(200);

    // Sanity: both mismatches must return false.
    expect(verifyServiceKey(earlyMismatch, expectedKey)).toBe(false);
    expect(verifyServiceKey(lateMismatch, expectedKey)).toBe(false);
  });
});

describe("hashWithSha256", () => {
  it("produces deterministic 64-char hex digest", () => {
    const digest = hashWithSha256("hello");
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(hashWithSha256("hello")).toBe(digest);
  });

  it("matches node:crypto reference value", () => {
    // Cross-check against a fresh createHash call to confirm we did not
    // accidentally use a different algorithm.
    const reference = createHash("sha256")
      .update("alice@example.com", "utf8")
      .digest("hex");
    expect(hashWithSha256("alice@example.com")).toBe(reference);
  });
});
