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

    // SLC-195 MT-1 (P-081): peek-before-signin — liest den Zaehler OHNE zu
    // inkrementieren. Fuer Login-Lockout: peek VOR signInWithPassword (gesperrte
    // Anfrage beruehrt GoTrue nicht), Count nur bei Fehlversuch via check(),
    // clear() bei Erfolg. `allowed=false` sobald bereits maxAttempts Fehlversuche
    // im Fenster liegen (der naechste waere der geblockte).
    peek(identifier: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(identifier);
      if (!entry || now > entry.resetAt) {
        return { allowed: true, remaining: config.maxAttempts };
      }
      if (entry.count >= config.maxAttempts) {
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

    // Setzt den Zaehler fuer einen Identifier zurueck (erfolgreicher Login soll
    // nie gesperrt werden — P-081 clearRateLimit).
    clear(identifier: string): void {
      store.delete(identifier);
    },
  };
}

// Pre-configured limiters for auth endpoints
// IP-scoped Flood-Bremse (zaehlt jeden Login-Versuch pro IP).
export const loginLimiter = createRateLimiter({
  maxAttempts: 20,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

// SLC-195 MT-1 (ISSUE-126, P-081): account-scoped Login-Lockout (Key = email
// lowercase), IP-UNABHAENGIG — schliesst verteilten Brute-Force via IP-Rotation
// gegen einen einzelnen Account. peek-before-signin, Count nur bei Fehlversuch,
// clear() bei Erfolg (siehe login/actions.ts). 5 Fehlversuche / 15 min.
export const loginAccountLimiter = createRateLimiter({
  maxAttempts: 5,
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

// V7.2 SLC-139 — Schutz vor Tracker-Bug-Floods + DDoS
// `POST /api/diagnose-event`. 600 Events pro Stunde pro Session-ID
// (10 Events/Minute Headroom: question_start + question_answer + 12
// heartbeats/min + okkasionelle helper_text_open). Per Session-ID statt
// IP, weil mehrere Mandanten hinter einer NAT moeglich sind (Coworking,
// Buero, Familie). Session-ID ist UUID → Pseudo-Identifier.
export const diagnoseEventLimiter = createRateLimiter({
  maxAttempts: 600,
  windowMs: 60 * 60 * 1000, // 1 hour
});

// V7.2 SLC-141 — Spam-Schutz fuer Bericht-Email-Send (FEAT-060 AC-5).
// `sendDiagnoseReportByEmail` Server-Action. 5 Versende pro Stunde pro
// capture_session_id. Identifier ist die Session-UUID statt User-ID,
// weil ein User mehrere Sessions parallel haben kann und sich nicht
// gegenseitig blockieren sollen. SMTP-Provider ist die echte Grenze; das
// Limit verhindert versehentliche Email-Floods (Doppelklick, Retry-Loop
// bei zwischenzeitlichem SMTP-Fehler).
export const diagnoseReportEmailLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
});

// V10.3 SLC-186 MT-3 — Passwort-Reset-Anforderung. Zwei Buckets nach
// P-081-Muster: IP-scoped (Brute-Force/Flood-Schutz) + account-scoped
// (Key = email lowercase), damit ein Angreifer nicht durch IP-Rotation
// unbegrenzt Reset-Mails an eine fremde Adresse ausloesen kann.
export const passwordResetIpLimiter = createRateLimiter({
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

// account-scoped Bucket per P-081-Muster (Key = email lowercase).
export const passwordResetAccountLimiter = createRateLimiter({
  maxAttempts: 3,
  windowMs: 60 * 60 * 1000, // 60 minutes
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
