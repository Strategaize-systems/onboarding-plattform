import { describe, it, expect, vi } from "vitest";

import {
  signupLimiter,
  createRateLimiter,
  extractClientIp,
  passwordResetIpLimiter,
  passwordResetAccountLimiter,
} from "../rate-limit";

describe("signupLimiter (V7 SLC-132)", () => {
  // Use a unique identifier per test so concurrent tests do not collide
  // (signupLimiter is module-scoped — the in-memory store survives across
  // tests in the same process).

  it("allows the first 3 requests per identifier and rejects the 4th with retryAfterSeconds", () => {
    const id = `ip-${Math.random()}::signup`;
    expect(signupLimiter.check(id).allowed).toBe(true);
    expect(signupLimiter.check(id).allowed).toBe(true);
    expect(signupLimiter.check(id).allowed).toBe(true);

    const fourth = signupLimiter.check(id);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.retryAfterSeconds).toBeLessThanOrEqual(60 * 60);
    expect(fourth.error).toMatch(/Sekunden/);
  });

  it("resets the window after windowMs elapses (verified via fresh limiter + Date.now mock)", () => {
    // Use a fresh limiter so the module-scoped signupLimiter store is not
    // polluted by other tests. Same config as production signupLimiter
    // (3 attempts, 1 hour window).
    const limiter = createRateLimiter({
      maxAttempts: 3,
      windowMs: 60 * 60 * 1000,
    });

    const id = "test-window-slide";
    const baseTime = 1_700_000_000_000;
    const spy = vi.spyOn(Date, "now").mockReturnValue(baseTime);

    try {
      // Exhaust the limit at baseTime
      expect(limiter.check(id).allowed).toBe(true);
      expect(limiter.check(id).allowed).toBe(true);
      expect(limiter.check(id).allowed).toBe(true);
      expect(limiter.check(id).allowed).toBe(false);

      // Slide time past the window (1h + 1ms)
      spy.mockReturnValue(baseTime + 60 * 60 * 1000 + 1);

      // First request in the new window must be allowed again
      const afterSlide = limiter.check(id);
      expect(afterSlide.allowed).toBe(true);
      expect(afterSlide.remaining).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("passwordResetIpLimiter (V10.3 SLC-186 MT-3)", () => {
  it("allows the first 5 requests per identifier and rejects the 6th", () => {
    const id = `ip-${Math.random()}::pwreset-ip`;
    expect(passwordResetIpLimiter.check(id).allowed).toBe(true);
    expect(passwordResetIpLimiter.check(id).allowed).toBe(true);
    expect(passwordResetIpLimiter.check(id).allowed).toBe(true);
    expect(passwordResetIpLimiter.check(id).allowed).toBe(true);
    expect(passwordResetIpLimiter.check(id).allowed).toBe(true);

    const sixth = passwordResetIpLimiter.check(id);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
    expect(sixth.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    expect(sixth.error).toMatch(/Sekunden/);
  });

  it("resets the window after windowMs elapses (fresh limiter + Date.now mock)", () => {
    const limiter = createRateLimiter({
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
    });

    const id = "test-pwreset-ip-window";
    const baseTime = 1_700_000_000_000;
    const spy = vi.spyOn(Date, "now").mockReturnValue(baseTime);

    try {
      for (let i = 0; i < 5; i++) {
        expect(limiter.check(id).allowed).toBe(true);
      }
      expect(limiter.check(id).allowed).toBe(false);

      spy.mockReturnValue(baseTime + 15 * 60 * 1000 + 1);

      const afterSlide = limiter.check(id);
      expect(afterSlide.allowed).toBe(true);
      expect(afterSlide.remaining).toBe(4);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("passwordResetAccountLimiter (V10.3 SLC-186 MT-3)", () => {
  it("allows the first 3 requests per account and rejects the 4th", () => {
    const id = `email-${Math.random()}@example.com`;
    expect(passwordResetAccountLimiter.check(id).allowed).toBe(true);
    expect(passwordResetAccountLimiter.check(id).allowed).toBe(true);
    expect(passwordResetAccountLimiter.check(id).allowed).toBe(true);

    const fourth = passwordResetAccountLimiter.check(id);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.retryAfterSeconds).toBeLessThanOrEqual(60 * 60);
    expect(fourth.error).toMatch(/Sekunden/);
  });

  it("resets the window after windowMs elapses (fresh limiter + Date.now mock)", () => {
    const limiter = createRateLimiter({
      maxAttempts: 3,
      windowMs: 60 * 60 * 1000,
    });

    const id = "test-pwreset-account-window";
    const baseTime = 1_700_000_000_000;
    const spy = vi.spyOn(Date, "now").mockReturnValue(baseTime);

    try {
      expect(limiter.check(id).allowed).toBe(true);
      expect(limiter.check(id).allowed).toBe(true);
      expect(limiter.check(id).allowed).toBe(true);
      expect(limiter.check(id).allowed).toBe(false);

      spy.mockReturnValue(baseTime + 60 * 60 * 1000 + 1);

      const afterSlide = limiter.check(id);
      expect(afterSlide.allowed).toBe(true);
      expect(afterSlide.remaining).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("extractClientIp (SLC-131 reuse anchor)", () => {
  // Smoke-test that signupLimiter callers can rely on the SLC-131 helper.
  // Detailed coverage lives with the SLC-131 partner-resolve endpoint tests.
  it("returns 'unknown' when x-forwarded-for header is missing", () => {
    const req = new Request("https://example.com");
    expect(extractClientIp(req)).toBe("unknown");
  });

  it("returns the first IP from a comma-separated x-forwarded-for chain", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(extractClientIp(req)).toBe("1.2.3.4");
  });
});
