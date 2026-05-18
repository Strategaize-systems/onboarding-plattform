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
  /**
   * Seconds until the window resets. Only set when allowed=false.
   * Public endpoints use this directly as the `Retry-After` header and
   * surface it in the JSON body (SLC-131 MT-6).
   */
  retryAfterSeconds?: number;
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
        const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds,
          error: `Zu viele Versuche. Bitte warten Sie ${retryAfterSeconds} Sekunden.`,
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

// V7 SLC-131 — Slug-Enumeration-Schutz fuer Public-Resolve-Endpoint
// `GET /api/public/partner/[slug]`. 60 Requests pro Stunde pro IP.
export const partnerResolveLimiter = createRateLimiter({
  maxAttempts: 60,
  windowMs: 60 * 60 * 1000, // 1 hour
});

// V7 SLC-132 — Spam-Schutz fuer Public-Signup-Endpoint
// `POST /api/public/signup`. 3 Signup-Anfragen pro Stunde pro IP.
// DEC-132: In-Memory akzeptiert (Single-Container), Reset bei Restart.
// DEC-137 Trigger-Schwelle fuer V7.1-Captcha-Sprint: >50 Pending/24h
// ohne Verify-Klick.
export const signupLimiter = createRateLimiter({
  maxAttempts: 3,
  windowMs: 60 * 60 * 1000, // 1 hour
});

/**
 * Extrahiert die Client-IP fuer Rate-Limit-Identification aus dem
 * `x-forwarded-for`-Header. Coolify+Traefik schreibt den Header bei
 * jedem Request — single-hop trust per DEC-138.
 *
 * Bei Multi-Hop `x-forwarded-for: 1.2.3.4, 5.6.7.8` wird der erste
 * Eintrag (originaler Client) genommen. Fallback `unknown` wenn Header
 * fehlt (z.B. interner Service-Call ohne Proxy).
 */
export function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff && xff.length > 0) {
    const first = xff.split(",")[0]?.trim();
    if (first && first.length > 0) return first;
  }
  return "unknown";
}
