/**
 * Simple in-memory rate limiter for server actions.
 * No external dependencies (no Redis/Upstash needed for MVP).
 *
 * Usage:
 *   const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });
 *   const result = limiter.check(ip);
 *   if (!result.allowed) return { error: result.error };
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterConfig {
  /** Maximum attempts allowed within the window */
  maxAttempts: number;
  /** Time window in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  error?: string;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

export function createRateLimiter(config: RateLimiterConfig) {
  // Each limiter gets its own store (login vs set-password are separate)
  const storeKey = `${config.maxAttempts}-${config.windowMs}-${Math.random()}`;
  const store = new Map<string, RateLimitEntry>();
  stores.set(storeKey, store);

  return {
    check(identifier: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(identifier);

      // No entry or window expired → reset
      if (!entry || now > entry.resetAt) {
        store.set(identifier, { count: 1, resetAt: now + config.windowMs });
        return { allowed: true, remaining: config.maxAttempts - 1 };
      }

      // Within window
      entry.count++;

      if (entry.count > config.maxAttempts) {
        const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
        return {
          allowed: false,
          remaining: 0,
          error: `Zu viele Versuche. Bitte warten Sie ${retryAfterSec} Sekunden.`,
        };
      }

      return { allowed: true, remaining: config.maxAttempts - entry.count };
    },
  };
}

// Pre-configured limiters for auth endpoints
export const loginLimiter = createRateLimiter({
  maxAttempts: 20,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

export const setPasswordLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});
