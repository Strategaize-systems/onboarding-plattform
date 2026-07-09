# SLC-195 — V20 Auth/Secrets-Cleanup

- Feature: FEAT-112 (BL-539)
- Status: planned
- Priority: High
- Delivery Mode: SaaS → kumulativer Branch `v20-security-hardening` (nach SLC-194)
- Architektur: PRD §V20, ARCHITECTURE §X, ISSUE-126 / 123 / 131 / 132 / 128
- Migrationen: keine (reiner Code)

## Goal
Auth-/Secrets-Restklasse schliessen: account-scoped Login-Lockout (ISSUE-126), recording-ready Path-Traversal + timingSafe (ISSUE-123), verifyCronSecret-timingSafe-Sweep über 7 Routes (ISSUE-131), Logger-Redaction (ISSUE-132), partner-slug `.eq` (ISSUE-128).

## In Scope
Login account-Lockout; recording-ready-Härtung; cron-Secret timingSafeEqual-Helper + 7 Routes; Logger-redactSecrets; partner-slug ILIKE→eq (2 Routes).

## Out of Scope
DB-Änderungen. recording-ready-Re-Aktivierung (bleibt middleware-unerreichbar; nur härten VOR jeder künftigen Aktivierung). LLM-Cost-Cap (deferred).

## Verified-Against-Code-Reality (§X.2 + FEAT-112-Grounding)
| Pfad | Status | Befund |
|---|---|---|
| `src/app/login/actions.ts:19` | MODIFY | `loginLimiter.check(ip)` — IP-only, kein account-scope |
| `src/lib/rate-limit.ts:37-70,127-136` | MODIFY | `createRateLimiter` + `passwordResetAccountLimiter` (P-081, account-scoped) reuse-Vorlage |
| `src/app/api/dialogue/recording-ready/route.ts:33,74` | MODIFY | Secret `!==` + `readFile(body.file_path)` Traversal; NICHT im Allowlist |
| `src/lib/auth/service-key.ts:36-62` | Referenz | `timingSafeEqual` + Length-Check-Muster (reuse) |
| `src/app/api/cron/*/route.ts` (7) | MODIFY | alle `!==`, kein `verifyCronSecret` |
| `src/lib/auth/cron-secret.ts` | NEU | darf nicht existieren |
| `src/lib/logger.ts:20-35` | MODIFY | metadata ungeredactet in error_log |
| `src/lib/logger/redact.ts` | NEU | `redactSecrets` (P-092) existiert nicht → Port |
| `src/app/api/public/partner/[slug]/route.ts:83`, `src/app/api/public/signup/route.ts:197` | MODIFY | `.ilike(slug)` unescaped |

Die 7 cron-Routes (MT-2 Pre-Audit-Grep bestätigt exakt): `knowledge-embed-reconcile`, `inbound-email-imap-sync`, `email-bulk-pipeline-trigger`, `bulk-email-retention-sweep`, `pending-signup-cleanup`, `capture-reminders`, `walkthrough-cleanup`.

## Symbol-/API-Verifikation
- `createRateLimiter({maxAttempts,windowMs})` → `.check(key)` → `{allowed}` (rate-limit.ts:37-70). `loginLimiter`, `passwordResetAccountLimiter`, `passwordResetIpLimiter`. Neu: `loginAccountLimiter` analog passwordResetAccountLimiter.
- `timingSafeEqual` via `verifyServiceKey(headerValue, expectedKey)` (service-key.ts:36-62, Buffer-Length-Check first). Neu `verifyCronSecret` gleiche Struktur.
- `logToDb`/`LogEntry` (logger.ts:20-35). `redactSecrets(obj)` = neuer Pure-Helper (P-092: Key-Whitelist-Masking).
- PostgREST `.ilike(col,val)` → `.eq(col, val.toLowerCase())`.

## Test-Infra-Klassifikation (vitest node-env)
- **Pure-Mock-Vitest**: `loginAccountLimiter` (N Fehlversuche/account → lockout, IP-Rotation wirkungslos); `verifyCronSecret` (korrekt/falsch/Length-Mismatch, timing-safe); `redactSecrets` (Keys maskiert, Nicht-Secrets intakt); slug `.eq` (Wildcard `%` matcht nicht mehr). Pfad `src/**/*.test.ts` + Route-Test-Seam (`route.test.ts`).
- **Live-Smoke** (/qa, optional): Login-Lockout-Verhalten gegen deployten Stand (Founder-Selbsttest).

## Reuse-Claim-Verifikation
- **P-081** Login-Lockout peek-before-signin + account-scoped Bucket — Muster real in rate-limit.ts (passwordResetAccountLimiter:132-136) + [[login_rate_limit_peek_pattern]]. Für Login übernehmen (peek-before-signin + generische Error-Message).
- **service-key.ts** timingSafeEqual (36-62) als verbatim-Struktur-Vorlage für `verifyCronSecret`.
- **P-092** Logger-Redaction — `redactSecrets` NICHT im Repo (FEAT-112-Grounding) → Neu-Port aus Pattern-Library (Wrapper- vs Integrations-Variante nach logger.ts-Ziel entscheiden). Quell-Header Pflicht.

## Micro-Tasks

### MT-1: Account-scoped Login-Lockout [backend]
- Goal: Brute-Force via IP-Rotation gegen einen Account schliessen.
- Files: `src/lib/rate-limit.ts` (MODIFY, +`loginAccountLimiter`), `src/app/login/actions.ts` (MODIFY, peek-before-signin account+ip), `src/app/login/actions.test.ts` (NEU/MODIFY, Pure-Mock).
- Expected: `loginAccountLimiter` (z.B. 5/15min account-scoped) zusätzlich zum IP-Limiter; peek VOR signInWithPassword, generische Error-Message (kein Account-Enumeration), account-Bucket auf emailLower.
- Verification: Pure-Mock: N Fehlversuche gleicher Account über wechselnde IPs → Lockout; erfolgreicher Login resettet; Fehlermeldung generisch.
- Dependencies: none.

### MT-2: verifyCronSecret timingSafeEqual-Helper + 7 Routes [backend] (Sweep — Pre-Audit)
- Goal: Timing-safe Secret-Vergleich über alle cron-Routes.
- Files: `src/lib/auth/cron-secret.ts` (NEU, `verifyCronSecret`), `src/lib/auth/cron-secret.test.ts` (NEU, Pure-Mock), 7× `src/app/api/cron/*/route.ts` (MODIFY).
- Expected: MT-Start = read-only Grep-Audit aller `x-cron-secret`/`CRON_SECRET`-Vergleiche (Done-Gate: 0 Treffer `secret !== expected` in cron-Routes danach). Helper spiegelt service-key.ts (Buffer-Length-Check + timingSafeEqual). Alle 7 Routes rufen `verifyCronSecret`.
- Verification: Pure-Mock-Test Helper (korrekt/falsch/Length); Grep `!== .*CRON_SECRET` in cron-Routes = 0; alle 7 Routes bauen.
- Dependencies: none.

### MT-3: Logger-Redaction (P-092-Port) [backend]
- Goal: Secrets nicht ungeredactet in error_log.
- Files: `src/lib/logger/redact.ts` (NEU, `redactSecrets`), `src/lib/logger/redact.test.ts` (NEU, Pure-Mock), `src/lib/logger.ts` (MODIFY, metadata durch redactSecrets).
- Expected: `redactSecrets` maskiert Key-Whitelist (token/secret/password/key/authorization/email o.ä.) rekursiv; logToDb wendet es auf `metadata` (+ ggf. message) an. Quell-Header P-092.
- Verification: Pure-Mock: Secret-Keys → `[REDACTED]`, Nicht-Secrets intakt, verschachtelte Objekte.
- Dependencies: none.

### MT-4: recording-ready timingSafe + Path-Traversal-Guard [backend]
- Goal: Route härten VOR jeder künftigen Re-Aktivierung.
- Files: `src/app/api/dialogue/recording-ready/route.ts` (MODIFY), `src/app/api/dialogue/recording-ready/route.test.ts` (NEU, Pure-Mock/Route-Seam).
- Expected: Secret-Vergleich timing-safe (verifyServiceKey/verifyCronSecret-Muster); `body.file_path` gegen Allowlist/`path.resolve`+Prefix-Check validieren (nur erlaubtes Jibri-Recording-Verzeichnis), Traversal (`..`) abweisen.
- Verification: Test: falscher Secret → 401 (timing-safe); `../`-Pfad → 400; gültiger Pfad → ok.
- Dependencies: MT-2 (Helper-Reuse möglich).

### MT-5: partner-slug `.ilike`→`.eq` [backend]
- Goal: Wildcard-Injection schliessen.
- Files: `src/app/api/public/partner/[slug]/route.ts` (MODIFY), `src/app/api/public/signup/route.ts` (MODIFY), Route-Test (NEU/MODIFY, Pure-Mock).
- Expected: beide `.ilike("slug", x)` → `.eq("slug", x.toLowerCase())` (+ slug-Charset-Guard falls sinnvoll). Konsistent mit Slug-Write-Konvention.
- Verification: Test: `acme%` matcht nicht mehr mehrere Partner; exakter slug matcht.
- Dependencies: none.

## Cross-Slice-Dependencies
- **blockiert-von:** SLC-194 (kumulativer Branch — auf SLC-194-HEAD aufsetzen).
- **blockiert:** keine (letzter V20-Slice).
- **Shared:** `src/lib/rate-limit.ts` (MT-1), `src/lib/auth/*` (MT-2/MT-4 timingSafe-Helper) — MT-4 kann MT-2-Helper reusen.
- **Reihenfolge:** MT-2 vor MT-4 (Helper). Rest unabhängig.

## Acceptance Criteria
- AC-195-1 [Pure-Mock]: Login-Lockout account-scoped, IP-Rotation wirkungslos, generische Fehlermeldung.
- AC-195-2 [Pure-Mock]: `verifyCronSecret` timing-safe; Grep `!==`-CRON_SECRET in cron-Routes = 0 (alle 7 migriert).
- AC-195-3 [Pure-Mock]: `redactSecrets` maskiert Secret-Keys rekursiv, logger nutzt es.
- AC-195-4 [Pure-Mock]: recording-ready timing-safe + `../`-Traversal abgewiesen.
- AC-195-5 [Pure-Mock]: partner-slug `.eq` (2 Routes), Wildcard wirkungslos.
- AC-195-6: tsc 0 / eslint 0 / next build PASS / Vitest 0 Regression + neue Tests grün.
