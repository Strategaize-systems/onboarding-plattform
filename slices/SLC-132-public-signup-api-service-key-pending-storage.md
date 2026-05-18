# SLC-132 — Public-Signup-API + Service-Key-Auth + Rate-Limit + Pending-Storage (FEAT-051 + FEAT-053-Storage)

## Goal

Kern-Schnittstelle des V7 Self-Signup-Flows: der anonyme Public-Endpoint `POST /api/public/signup` der von der Intelligence-Plattform-Server-Side aufgerufen wird. Validiert Service-Key (timing-safe), IP-Rate-Limit (3/h), zod-Body, Email-Domain-Block-Liste, Partner-Slug-Resolve, Doppel-Signup-Check, schreibt `pending_signup`-Row mit SHA-256-Token-Hash + 24h TTL, sendet Verify-Email via IONOS-SMTP-Reuse, logt DSGVO-konform mit Hash-Only-Audit.

Migration 098 wird in diesem Slice mit-deployed (pending_signup-Tabelle + partner_client_mapping-Erweiterung um `invitation_source` + DSGVO-Consent-Spalten), weil ohne sie der Endpoint-INSERT keine Ziel-Tabelle hat. Verify-Endpoint kommt in SLC-133.

## Feature

FEAT-051 — Public-Signup-API + Service-Key-Auth + Rate-Limit (Haupt-Feature). FEAT-053 — Self-Signup Storage-Anteil (Migration 098 + Pending-Repo + Email-Template + Endpoint-Insert). Verify-Endpoint kommt in SLC-133.

**Pattern-Reuse (per `strategaize-pattern-reuse.md`):**
- DEC-107 Service-Key-Compare-Pattern aus V6 Lead-Push-Adapter (Onboarding→Business-System, hier Caller-Sinn umgekehrt = Callee). Bestaetigt durch RPT-297 Reuse-Audit.
- `src/lib/rate-limit.ts` V4.2 In-Memory-Pattern, erweitert um `signupLimiter` (SLC-131 fuegt `partnerResolveLimiter` hinzu; hier nur die zweite Instance).
- `error_log`-Audit-Pattern aus V6 SLC-106 (FEAT-046) — neue Category `public_signup` mit Hash-Only-Metadata.
- `src/lib/email.ts` V4.2 SMTP-Adapter mit IONOS DKIM verifiziert seit V4.2 Reminders. Neuer Template-Render-Helper landet als render-Function im selben File (per RPT-297 P-1 Empfehlung — kein Subfolder-Refactor in V7).
- Migration-Idempotenz-Pattern aus V6 Migration 091 (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT).
- `.claude/rules/sql-migration-hetzner.md` fuer Migration-Apply-Procedure.
- `.claude/rules/coolify-test-setup.md` fuer Vitest gegen Coolify-DB.

**Cross-Project-Pattern-Check (BLOCKING):**
- Service-Key-Endpoint-Pattern existiert im Onboarding-Repo selbst (Lead-Push-Adapter). 1:1 Reuse mit Caller-Sinn umgedreht.
- IONOS-SMTP-Pattern existiert seit V4.2. Neue render-Function additive.
- Zod-Validation-Pattern: `src/app/api/admin/*` Routes als Vorlage. Standard.

## Background

V6 Admin-Invite-Pattern (`src/app/api/admin/tenants/[tenantId]/invite/route.ts`) ist Push-Model: Strategaize-Admin oder Partner-Admin laedt manuell pro Mandant ein. Spammt nicht, weil interner Akteur. Self-Signup ist Pull-Model: anonymer Caller fuehrt zur Anlage einer DB-Row pro Aufruf. Ohne Schutz → DB-Bloat, Spam, DSGVO-Verstoss.

Schutz-Schichten in diesem Slice:
1. **Service-Key** — nur IS-Server-Side darf POSTen, nicht Browser-direkt. timing-safe-equal verhindert Timing-Attack.
2. **Rate-Limit** — 3/h/IP gegen automatisierte Signup-Waves. In-Memory-Akzeptanz (DEC-132): nach Container-Restart Reset, ok fuer Single-Container-Setup.
3. **Email-Domain-Block** — statische Liste der bekanntesten Wegwerf-Domains via ENV `PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS`.
4. **DSGVO-Consent-Pflicht** — `dsgvo_consent_accepted=true` Pflichtfeld, sonst 422.
5. **DSGVO-Datensparsamkeit** — Audit-Log hat nur SHA-256-Hashes, kein Klartext-Email / IP / Token.

Email-Verify selbst (Klick auf Link) kommt in SLC-133 — dieser Slice schreibt nur den Pending-Row + sendet Mail.

## In Scope

### Schema-Aenderung (Migration 098)

1. `CREATE TABLE IF NOT EXISTS public.pending_signup (id uuid PK, partner_tenant_id uuid FK tenant(id) ON DELETE CASCADE, email_lower text, first_name text, last_name text, company_name text NULL, dsgvo_consent_text_version text, dsgvo_consent_accepted_at timestamptz DEFAULT now(), verify_token_hash text, expires_at timestamptz, status text DEFAULT 'pending' CHECK (status IN ('pending','verified','expired')), verified_at timestamptz NULL, created_at timestamptz DEFAULT now())`.
2. UNIQUE-Index `pending_signup_partner_email_unique_pending` auf `(partner_tenant_id, email_lower) WHERE status='pending'` — kein doppeltes Pending pro Email+Partner, aber Re-Signup nach Expiry erlaubt.
3. Lookup-Index `pending_signup_token_hash_lookup` auf `verify_token_hash WHERE status='pending'`.
4. Cleanup-Index `pending_signup_expires_status` auf `(expires_at, status)`.
5. RLS enabled, KEINE Policies (default deny — nur service_role darf SELECT/INSERT/UPDATE/DELETE).
6. ALTER `partner_client_mapping` ADD `invitation_source text NOT NULL DEFAULT 'partner_invite'` + `dsgvo_consent_text_version text NULL` + `dsgvo_consent_accepted_at timestamptz NULL`.
7. CHECK-Constraint additive: `partner_client_mapping_invitation_source_check` auf `('partner_invite','self_signup')`. DROP IF EXISTS + ADD pattern.
8. Live-Apply per `sql-migration-hetzner.md`-Pattern + Pre-Apply-Backup.

### Service-Key-Verifier Lib

`src/lib/auth/service-key.ts`:

```typescript
import { timingSafeEqual } from 'node:crypto';

export function verifyServiceKey(headerValue: string | null, expectedKey: string | undefined): boolean;
// Beide Strings zu Buffer encoden. Bei Laengen-Mismatch: false (BEVOR timingSafeEqual,
// das crasht bei unterschiedlichen Buffer-Laengen). Bei Match: true.
// Sicher gegen undefined-Key (ENV nicht gesetzt) → wirft Error mit Hinweis auf
// PUBLIC_SIGNUP_SERVICE_KEY ENV-Pflicht.
```

`src/lib/auth/__tests__/service-key.test.ts`: 6 Tests inkl. 1000-Iter-Statistical-Test fuer Timing-Bound (Mean-Time pro Compare ueber 1000 Iter mit unterschiedlich-langem prefix-Mismatch vs. full-Match darf nicht ueber 100ns abweichen; Random-Seed fixiert).

### Rate-Limit-Erweiterung (signupLimiter)

`src/lib/rate-limit.ts` bekommt zweite Pre-configured Instance (additive; SLC-131 hat `partnerResolveLimiter`):

```typescript
export const signupLimiter = createRateLimiter({ max: 3, windowMs: 60 * 60 * 1000 });
```

Identifier-Compound im Endpoint: `${ip}::signup`. `extractClientIp` aus SLC-131 wiederverwendet.

### Pending-Signup-Repo

`src/lib/signup/pending-signup-repo.ts` mit drei Functions:

```typescript
export async function insertPendingSignup(input: {
  partner_tenant_id: string;
  email_lower: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  dsgvo_consent_text_version: string;
  verify_token_hash: string;
  ttl_hours: number;
}): Promise<{ id: string; expires_at: string }>;

export async function findActivePendingSignup(partner_tenant_id: string, email_lower: string): Promise<PendingSignupRow | null>;
// Liefert Pending-Row wenn status='pending' AND expires_at > now(), sonst null.

export async function findPendingByTokenHash(token_hash: string): Promise<PendingSignupRow | null>;
// SLC-133 nutzt diese Function; in SLC-132 schon implementiert + getestet.
```

Vitest 6 Cases (Insert + Find-Active + Find-By-Hash + 24h-Default + UNIQUE-Violation-Catch + Expired-Skip).

### Email-Template Render-Function

`src/lib/email.ts` bekommt neue Render-Function `renderSignupVerifyTemplate` (per RPT-297 P-1 Empfehlung, kein Subfolder-Refactor):

```typescript
export function renderSignupVerifyTemplate(input: {
  partner_display_name: string;
  partner_contact_email: string | null;  // wird als reply-to genutzt vom sendMail-Caller
  verify_url: string;
  expires_at_iso: string;
  recipient_first_name: string;
}): { subject: string; html: string; text: string };
```

Inhalt deutsch, Strategaize-Brand-Header, Hinweis auf Partner-Kanzlei, Verify-Link, Expiry-Hinweis (24h), Datenschutz-Link auf `/datenschutz` (V6.2). Plain-Text-Variante fuer Spam-Filter-Score.

### Public-Signup-Endpoint

`src/app/api/public/signup/route.ts`:

POST-Handler mit Schritt-fuer-Schritt-Pipeline gemaess ARCHITECTURE.md V7 Signup-Flow Schritt 6:

```
1. extractClientIp(request) → ip
2. verifyServiceKey(headers['x-strategaize-service-key'], ENV.PUBLIC_SIGNUP_SERVICE_KEY)
   → false: log error_log + return 401 'invalid_service_key' (NIE den expected-Key leaken)
3. signupLimiter.check(`${ip}::signup`)
   → false: log error_log + return 429 { retry_after_seconds }
4. await request.json() + zod-Schema-Validation
   → fail: return 422 { error: 'validation_failed', details: [...] }
5. Email-Domain-Block:
   - domain = email.split('@')[1].toLowerCase()
   - if blocked: return 422 { error: 'validation_failed', details: ['disposable_email_domain'] }
6. Slug → partner_tenant_id Lookup (Reuse Helper aus SLC-131)
   → null: return 404 { error: 'unknown_partner' }
7. findActivePendingSignup(partner_tenant_id, email_lower)
   → row: return 409 { error: 'email_already_signed_up' }
8. Cross-Check existing partner_client_mapping mit gleicher Email
   (JOIN profiles p ON p.tenant_id = pcm.client_tenant_id WHERE p.email = $1 AND pcm.partner_tenant_id = $2)
   → row: return 409 { error: 'email_already_signed_up' }
9. crypto.randomBytes(32).toString('hex') → token_clear
   sha256(token_clear) → token_hash
10. insertPendingSignup({..., verify_token_hash: token_hash, ttl_hours: 24})
    → { id, expires_at }
11. verify_url = `${ENV.PUBLIC_APP_URL}/auth/verify-signup?token=${token_clear}`
    renderSignupVerifyTemplate(...) → { subject, html, text }
    sendMail({ to: email, from: 'onboarding@strategaize.de',
               reply_to: partner_contact_email, subject, html, text })
    → bei SMTP-Fail: log error_log mit category='public_signup' level='error',
      ABER trotzdem 202 returnen (Mandant kann via Re-Signup retryen)
12. error_log INSERT (category='public_signup', level='info',
    metadata={ partner_slug, partner_tenant_id, email_hash, ip_hash, status=202 })
13. return 202 { status: 'pending_email_verify', expires_at: ISO8601 }
```

Helper: `hashWithSha256(value: string): string` als Util in `src/lib/auth/service-key.ts` (oder shared Crypto-File).

Audit-Log enthaelt **nur** SHA-256-Hashes. Klartext-Email NIE in error_log.metadata. Klartext-Token NIE in DB oder Logs.

### Vitest-Coverage

`src/app/api/public/signup/__tests__/route.test.ts` mit ~12 Cases:
1. Happy-Path: gueltiger Key + Slug + neue Email → 202 + pending_signup-Row + Email-Send-Mock-Call.
2. Kein Service-Key → 401.
3. Falscher Service-Key → 401.
4. 4. Request/h/IP → 429.
5. Body fehlt Pflicht-Feld → 422.
6. Email-Syntax invalid → 422.
7. dsgvo_consent_accepted=false → 422.
8. Email aus blocked-domain (`mailinator.com`) → 422 mit `details: ['disposable_email_domain']`.
9. Unbekannter Slug → 404.
10. Email bereits pending → 409.
11. Email bereits in `partner_client_mapping` cross-partner → noch erlaubt (1 Email = 1 Mandant pro Partner ist V7-Regel, NICHT pro Partner-Set). Verifizieren via existing FEAT-046-Pattern.
12. Audit-Log enthaelt nur Hash-Werte (RegEx `/[a-z0-9._-]+@/` darf in `error_log.metadata::text` NICHT matchen).

Tests laufen gegen Coolify-DB im node:20-Container. SAVEPOINT-Pattern bei erwarteten Errors (sonst `current transaction is aborted`-Cascade).

### Quality-Gates am Slice-Ende

- ESLint 0/0 auf alle neuen + geaenderten Files.
- tsc EXIT=0 volltree.
- `npm run build` PASS lokal mit Dummy-ENVs (inkl. `PUBLIC_SIGNUP_SERVICE_KEY=dummy`).
- `npm run test` gegen Coolify-DB: alle pre-existing PASS + 24 neue Tests (6 Service-Key + 6 Repo + 12 Endpoint) PASS, 0 Regression.

## Out of Scope

- **Verify-Endpoint** und Auto-Tenant-Provisioning → SLC-133.
- **TTL-Cleanup-Cron** → SLC-135.
- **Pen-Test-Suite-Erweiterung** mit allen 18 Negativ-Cases → SLC-134 (nutzt die Endpoint-Pipeline + Pending-Repo aus diesem Slice).
- **DB-basiertes Rate-Limit** fuer Multi-Replica-Setup → V8+.
- **Webhook-Notification an Partner-Admin** bei neuem Signup → V8+.
- **Captcha-Server-Verifikation** → V7.1-Sprint (Trigger-Schwelle DEC-137: > 50 Pending/24h ohne Verify).
- **Multi-Sprach-Variante der Error-Bodies** → V7 deutsch+englisch fuer technische Codes, NL kommt mit V8.
- **Multi-Sprach-Variante der Verify-Email** → V8+ NL.
- **Service-Key-Rotation-UI** im Admin-Bereich → V8+ (V7 = manuell-koordiniert per DEC-136).
- **Dual-Key-Support** fuer Zero-Downtime-Rotation → V8+.

## Acceptance Criteria

| AC | Beschreibung |
|---|---|
| AC-1 | Migration 098 existiert mit Header-Kommentar analog Migration 093 (ZIEL / IDEMPOTENZ / APPLY-PATTERN / PRE-APPLY-BACKUP-PFLICHT / VERIFIKATION). |
| AC-2 | Migration 098 ist idempotent: zweiter Apply ist No-Op (CREATE TABLE IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS + DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT). |
| AC-3 | Migration 098 LIVE auf Hetzner mit Pre-Apply-Backup. Verifikation: `\d pending_signup` zeigt 12 Spalten + CHECK-Constraint `pending_signup_status_check`. `\d partner_client_mapping` zeigt 3 neue Spalten (`invitation_source` NOT NULL DEFAULT 'partner_invite' + 2 DSGVO-Spalten). |
| AC-4 | Bestehende V6-partner_client_mapping-Rows haben nach Apply `invitation_source='partner_invite'` (DEFAULT-Backfill via PostgreSQL automatisch). |
| AC-5 | `src/lib/auth/service-key.ts` `verifyServiceKey` nutzt `timingSafeEqual` aus `node:crypto`, kein `===`-Compare. Wirft Error bei undefined-ENV-Key. |
| AC-6 | Vitest fuer Service-Key: 6 Cases PASS inkl. 1000-Iter-Statistical-Timing-Test (Random-Seed fixiert, deterministisch reproducible). |
| AC-7 | `signupLimiter` in `src/lib/rate-limit.ts` exportiert mit max=3, windowMs=3600000. |
| AC-8 | `src/lib/signup/pending-signup-repo.ts` exportiert 3 Functions, 6 Vitest PASS gegen Coolify-DB. |
| AC-9 | `src/lib/email.ts` `renderSignupVerifyTemplate` exportiert, deutsch, mit Verify-Link + Expiry-Hinweis + Datenschutz-Link. |
| AC-10 | `POST /api/public/signup` Endpoint mit 13-Schritt-Pipeline implementiert. Happy-Path liefert 202 + pending_signup-Row + Email-Send-Mock-Call. |
| AC-11 | 5 Error-Faelle (401 / 404 / 409 / 422 / 429) korrekt mit jeweiligem JSON-Body und HTTP-Status. |
| AC-12 | Service-Key-Compare nutzt timing-safe-equal (NICHT Standard-`===`). Vitest-Statistical-Test PASS. |
| AC-13 | Audit-Log fuer Happy-Path-202 enthaelt nur SHA-256-Hashes (`email_hash`, `ip_hash`), kein Klartext-Email/IP/Token. RegEx-Probe auf `@` im Metadata-Feld scheitert. |
| AC-14 | Rate-Limit-In-Memory-State Reset nach Container-Restart bewusst akzeptiert (in DEC-132 dokumentiert, nicht release-blockierend). |
| AC-15 | Vitest 24 neue Cases PASS (6 Service-Key + 6 Repo + 12 Endpoint) gegen Coolify-DB im node:20-Container. |
| AC-16 | Quality-Gates am Slice-Ende: ESLint 0/0, tsc EXIT=0, Build PASS lokal mit Dummy-ENVs, Vitest 0 Regression auf Baseline. |

## Pre-Conditions

- SLC-131 LIVE (Slug-Lookup + `partnerResolveLimiter` + `extractClientIp` verfuegbar).
- Migration 097 LIVE in DB.
- IONOS-SMTP-ENV konfiguriert (existing V4.2 ENV `IONOS_SMTP_*`).
- `PUBLIC_APP_URL` ENV gesetzt (existing V6, `https://onboarding.strategaizetransition.com`).
- `PUBLIC_SIGNUP_SERVICE_KEY` ENV in Coolify-Resource gesetzt (Generierung in SLC-135 MT-4, fuer SLC-132-Code-Side reicht Dummy-ENV `.env.local`).
- `PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS` ENV (Default-Wert `mailinator.com,guerrillamail.com,tempmail.io` ok fuer V7-Start).
- IONOS-Postfach `onboarding@strategaize.de` existiert oder Alias konfiguriert (DEC-134, User-Pflicht extern — SLC-135 verifiziert Pre-Deploy).

## Stop-Gates

- **Keine V7-Self-Signup-Aktivierung in IS-Repo** vor SLC-135 LIVE (Cron-Setup + Smoke-Test komplett).
- **Keine parallele Schema-Aenderung an `partner_client_mapping`** ohne Cross-Check (Migration 098 hat ALTER-Lock-Effekt).
- **Keine Endpoint-Aktivierung vor LIVE-IONOS-Postfach-Verifikation** — sonst 202-Response mit nicht-gesendeter Mail (user-sichtbarer Bug).

## Micro-Tasks

### MT-1: Migration 098 anlegen + Live-Apply auf Hetzner

- **Goal:** SQL-Migration mit pending_signup-Tabelle + 3 Indices + RLS-Enable + partner_client_mapping-Erweiterung + CHECK-Constraint, Header-Kommentar analog 093, Live-Apply mit Backup.
- **Files:**
  - `sql/migrations/098_v7_pending_signup_and_mapping_source.sql` (NEU)
- **Expected behavior:**
  - Header-Kommentar gemaess Standard-Block.
  - Body in BEGIN..COMMIT.
  - Idempotent: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT + CREATE INDEX IF NOT EXISTS.
  - Live-Apply auf Hetzner: Container-Name resolven, Pre-Apply-Backup mit `pg_dump partner_client_mapping`, `docker exec -i <db-container> psql -U postgres -d postgres < /tmp/098.sql`.
- **Verification:**
  - `docker exec <db-container> psql -U postgres -d postgres -c "\d pending_signup"` zeigt 12 Spalten.
  - `docker exec <db-container> psql -U postgres -d postgres -c "\d partner_client_mapping"` zeigt `invitation_source` mit DEFAULT `'partner_invite'`.
  - `SELECT COUNT(*) FROM partner_client_mapping WHERE invitation_source IS NULL` → 0.
  - `SELECT pg_get_indexdef(indexrelid) FROM pg_index WHERE indrelid='public.pending_signup'::regclass` zeigt 3 Indices.
  - Second-Run idempotent: zweiter Apply gibt NOTICE-Output ohne Fehler.
- **Dependencies:** keine.

### MT-2: Service-Key-Verifier Lib + Vitest

- **Goal:** timing-safe-equal Helper-Function + Statistical-Test.
- **Files:**
  - `src/lib/auth/service-key.ts` (NEU)
  - `src/lib/auth/__tests__/service-key.test.ts` (NEU)
- **Expected behavior:**
  - `verifyServiceKey(headerValue, expectedKey)` via `timingSafeEqual` mit Buffer-Length-Check (sonst Crash).
  - `hashWithSha256(value)` als Util-Function in selbem File (Reuse fuer Endpoint).
  - 6 Vitest: undefined-ENV → throws, leerer Key → false, falscher Key → false, korrekter Key → true, Laengen-Mismatch → false ohne Crash, 1000-Iter-Statistical-Timing-Test mit fixiertem Random-Seed.
- **Verification:**
  - Vitest 6/6 PASS.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** keine.

### MT-3: Rate-Limit-Lib um signupLimiter erweitern

- **Goal:** Zweite Pre-configured Instance.
- **Files:**
  - `src/lib/rate-limit.ts` (modify, additive append)
  - `src/lib/__tests__/rate-limit.test.ts` (modify, falls existing Test-Suite — sonst neu)
- **Expected behavior:**
  - Export `signupLimiter = createRateLimiter({ max: 3, windowMs: 60 * 60 * 1000 })`.
  - Vitest 2 neue Cases: 4. Call hit, Reset nach Window-Slide.
- **Verification:**
  - `grep "signupLimiter" src/lib/rate-limit.ts` → 1 Treffer.
  - tsc EXIT=0 + ESLint 0/0.
  - Existing-Rate-Limit-Vitest unveraendert PASS.
- **Dependencies:** SLC-131 MT-5 (extractClientIp-Helper existiert).

### MT-4: Pending-Signup-Repo + Vitest

- **Goal:** 3 DB-Access-Functions + 6 Vitest gegen Coolify-DB.
- **Files:**
  - `src/lib/signup/pending-signup-repo.ts` (NEU)
  - `src/lib/signup/__tests__/pending-signup-repo.test.ts` (NEU)
- **Expected behavior:**
  - `insertPendingSignup` nutzt Service-Role-Client (RLS-bypass), berechnet `expires_at = now() + ttl_hours * '1 hour'`.
  - `findActivePendingSignup` filtert auf status='pending' AND expires_at > now(). Lower-Case-Email-Compare.
  - `findPendingByTokenHash` Lookup-by-Hash (SLC-133 nutzt diese Function).
  - Vitest: Happy-Path-Insert + Find-Active + Find-By-Hash + 24h-Default-Expiry + UNIQUE-Violation-Catch (zweiter Pending fuer gleiche Email+Partner) + Expired-Filter (expires_at in Vergangenheit → null).
  - SAVEPOINT-Pattern bei erwartetem Constraint-Violation-Test.
- **Verification:**
  - Vitest 6/6 PASS gegen Coolify-DB.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** MT-1 (Schema live).

### MT-5: Email-Template Render-Function

- **Goal:** `renderSignupVerifyTemplate` in `src/lib/email.ts` mit Subject/HTML/Text-Variante deutsch.
- **Files:**
  - `src/lib/email.ts` (modify, additive append)
  - `src/lib/__tests__/email-render.test.ts` (NEU oder erweitern)
- **Expected behavior:**
  - Subject: "Bestaetigung der E-Mail-Adresse fuer Ihren Strategaize-Zugang ueber [Partner-Display-Name]" (max 78 chars laut RFC).
  - HTML mit `<a>`-Link + Strategaize-Brand-Header + 24h-Expiry-Hinweis + Datenschutz-Link `/datenschutz`.
  - Text-Variante: gleiche Info ohne HTML-Tags, fuer Spam-Filter.
  - Reply-To-Header wird vom Caller via `sendMail({reply_to})` gesetzt — Template-Function gibt Subject/HTML/Text zurueck, kein Reply-To-Logik.
  - 3 Vitest: HTML enthaelt verify_url, Text enthaelt verify_url, Subject enthaelt partner_display_name.
- **Verification:**
  - Vitest 3/3 PASS.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** keine.

### MT-6: Public-Signup-Endpoint Route + zod-Validation

- **Goal:** POST-Handler mit 13-Schritt-Pipeline, deferred Vitest in MT-7.
- **Files:**
  - `src/app/api/public/signup/route.ts` (NEU)
  - `src/lib/signup/signup-schema.ts` (NEU, zod-Schema export)
- **Expected behavior:**
  - zod-Schema deckt alle Body-Felder ab (partner_slug, email, first_name, last_name, company_name optional, dsgvo_consent_accepted literal-true, dsgvo_consent_text_version).
  - Email-Domain-Block via `process.env.PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS?.split(',')`.
  - Slug-Lookup via Service-Role-Client `SELECT id FROM tenant t JOIN partner_organization po ON po.tenant_id=t.id WHERE lower(po.slug)=lower($1)`.
  - Doppel-Check via `findActivePendingSignup` + JOIN-Query gegen `partner_client_mapping` + `profiles`.
  - Token-Generation via `crypto.randomBytes(32).toString('hex')` + `hashWithSha256`.
  - Email-Send via existing `sendMail`-Adapter mit `reply_to: partner_contact_email`.
  - Audit-Log via existing-error_log-Helper mit Hash-Only-Metadata.
  - 202-Response Body: `{ status: 'pending_email_verify', expires_at: ISO8601 }`.
- **Verification:**
  - `grep "POST" src/app/api/public/signup/route.ts` → 1 Treffer.
  - tsc EXIT=0 + ESLint 0/0.
  - Build PASS mit Dummy-ENVs.
- **Dependencies:** MT-1, MT-2, MT-3, MT-4, MT-5.

### MT-7: Public-Signup-Endpoint Vitest-Suite

- **Goal:** 12 Endpoint-Cases inkl. Happy-Path + alle 5 Error-Faelle + Audit-Log-DSGVO-Check.
- **Files:**
  - `src/app/api/public/signup/__tests__/route.test.ts` (NEU)
- **Expected behavior:**
  - Helper-Function `createSignupRequest({...overrides})` baut Request mit gueltigen Defaults.
  - Tests parametrisieren ueber Service-Key / Body / Domain-Block / Slug / Pending-Existence.
  - Email-Send wird via vi.mock('src/lib/email', () => ({ sendMail: vi.fn() })) gemockt.
  - DSGVO-Test pruefte error_log-Metadata via RegEx `/[a-z0-9._-]+@/` → muss FAIL beim Match (also keine `@` in Metadata).
  - SAVEPOINT-Pattern bei erwarteten DB-Errors.
- **Verification:**
  - Vitest 12/12 PASS gegen Coolify-DB.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** MT-6 (Endpoint existiert).

### MT-8: Quality-Gates + Cockpit-Records

- **Goal:** Slice-End-Gates + Records-Update.
- **Files:**
  - `slices/INDEX.md` (modify — SLC-132 status → done)
  - `planning/backlog.json` (modify — BL-107 → done)
  - `docs/STATE.md` (modify — Current Focus auf SLC-132 done, Next Step = SLC-133)
  - `docs/MIGRATIONS.md` (modify — MIG-042 LIVE-marked)
- **Expected behavior:**
  - ESLint 0/0 / tsc 0 / Build PASS / Vitest 0 Regression.
  - Records aktualisiert.
- **Verification:**
  - Alle Gates PASS in Output-Zusammenfassung.
- **Dependencies:** MT-1..MT-7 alle done.

## Execution Order

Strikt sequentiell mit 2 Parallelisierungs-Pockets:

**Phase 1 (sequentiell):** MT-1 (Schema-Live noetig fuer alles andere).

**Phase 2 (parallelisierbar):** MT-2 + MT-3 + MT-5 (verschiedene Files, keine Cross-Deps).

**Phase 3 (sequentiell):** MT-4 (braucht Schema), dann MT-6 (braucht alles), dann MT-7 (braucht Endpoint), dann MT-8 (Records-Update).

Empfohlene Reihenfolge der Atomic-Commits: **MT-1 → MT-2 → MT-3 → MT-4 → MT-5 → MT-6 → MT-7 → MT-8**.

## Estimated Effort

| MT | Aufwand |
|---|---|
| MT-1 Migration 098 | ~75min (SQL + Live-Apply + Backup + Verifikation pending_signup + mapping-extension) |
| MT-2 Service-Key + Statistical-Test | ~60min (Function + 6 Vitest, davon 1 Iter-Test) |
| MT-3 signupLimiter | ~15min (Append + 2 Tests) |
| MT-4 Pending-Repo | ~60min (3 Functions + 6 Vitest + SAVEPOINT) |
| MT-5 Email-Template | ~45min (Render-Function + HTML/Text/Subject + 3 Tests) |
| MT-6 Public-Signup-Endpoint | ~120min (13-Schritt-Pipeline + zod-Schema) |
| MT-7 Endpoint-Vitest-Suite | ~120min (12 Cases inkl. Mocks + DSGVO-Probe) |
| MT-8 Records + Gates | ~30min |
| **Total** | **~10h (~1.5d Solo-Founder)** |

## Risks

- **R-1 (Medium):** Migration 098 ADD CONSTRAINT `partner_client_mapping_invitation_source_check` schlaegt fehl wenn bestehende Rows einen anderen Wert als `partner_invite` oder `self_signup` haben. Mitigation: DEFAULT `'partner_invite'` setzt alle Bestand auf `'partner_invite'`. Pre-Apply-Check `SELECT DISTINCT invitation_source FROM partner_client_mapping` → wenn nicht leer und nicht in (`partner_invite`,`self_signup`,NULL): Manual-Fix.
- **R-2 (Low):** Service-Key-Statistical-Test ist flaky bei langsamem Test-Container. Mitigation: Threshold auf 200ns hochsetzen + Run mit `--retry=2`.
- **R-3 (Medium):** Email-Send schlaegt fehl waehrend Endpoint-202-Path. Akzeptiert per User-friendly Error-Logik: 202 wird trotzdem returnet, Mandant kann via Re-Signup retryen. error_log mit level='error' fuer Monitoring. Pflicht-Followup: SLC-133-Verify-Endpoint muss "Token nicht gefunden"-Page robust handeln (Mail-Kommt-Nicht-Szenario).
- **R-4 (Low):** Rate-Limit-In-Memory wird per Container-Restart umgangen. Akzeptiert per DEC-132. V7.1-Sprint-Trigger via DEC-137 wenn > 50 Pending/24h ohne Verify.
- **R-5 (Low):** Race-Condition zwischen findActivePendingSignup + insertPendingSignup (TOCTOU). Mitigation: UNIQUE-Constraint `pending_signup_partner_email_unique_pending` blockt zweiten Insert → 23505. Endpoint catched 23505 + returnt 409.
- **R-6 (Low):** Bedrock-Worker oder andere Service nutzen `error_log.category='public_signup'`-Filter und Volumen-Anstieg blockt Worker-Throughput. Mitigation: Volume erwartet niedrig (Internal-Test-Mode + dann erst gradual Live-Pilot). Worker hat eigene `category`-Filter ohne `public_signup`.

## Worktree-Isolation

**Delivery Mode SaaS → Worktree-Isolation Mandatory.**

- Branch-Name: `slc-132-public-signup-api`.
- Push nach /qa MT-8 PASS, dann Merge nach `main` am Slice-Ende.
- Status-Tracking: `slices/INDEX.md` Status `in_progress` waehrend Worktree aktiv, Update auf `done` post-Merge.

## Cross-Slice-Konsistenz

- Migration 098 fuegt sich in MIG-042 (sequenziell nach MIG-041 = Migration 097) ein.
- Reuse-Quote: ~80% (Service-Key + Rate-Limit + SMTP + Audit-Log alle reused). 0 neue npm-Packages.
- Pre-Condition fuer SLC-133 erfuellt: `findPendingByTokenHash` existiert + Endpoint hat pending_signup-Row angelegt.
- Pre-Condition fuer SLC-134 erfuellt: Service-Key-Endpoint + Rate-Limit-Endpoint testbar.

## References

- Memory `project_op_v7_architecture_done.md` — V7-Stand mit 10 DECs + Component-Layout
- `docs/ARCHITECTURE.md` V7-Sektion (Line 6076-6429)
- `features/FEAT-051-public-signup-api-service-key-rate-limit.md` — FEAT-051 Detail-Spec
- `features/FEAT-053-self-signup-email-verify-auto-provisioning.md` — FEAT-053 (Storage-Anteil hier)
- `reports/RPT-297.md` — Architecture-Completion-Report
- DEC-107 — Service-Key-Compare-Pattern (V6 Lead-Push Reuse-Anker)
- DEC-129 (Email-Verify Custom pending_signup), DEC-131 (Pending-TTL 24h), DEC-132 (Rate-Limit In-Memory), DEC-134 (Email-Sender), DEC-135 (Doppel-Signup 409), DEC-138 (IP-Trust)
- `.claude/rules/sql-migration-hetzner.md` — Apply-Procedure
- `.claude/rules/coolify-test-setup.md` — Vitest gegen Coolify-DB
- `.claude/rules/strategaize-pattern-reuse.md` — Reuse-Anker Service-Key + SMTP + Audit-Log
