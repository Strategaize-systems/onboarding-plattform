# SLC-131 — Partner-Slug Foundation + Public-Resolve-Endpoint (FEAT-052)

## Goal

Fundament fuer V7 Self-Signup-Funnel: jede `partner_organization` bekommt einen URL-baren `slug` (Migration 097 + Auto-Backfill + UNIQUE-Constraint), die TS-Slug-Generator-Lib `src/lib/partner/slug.ts` (Umlaut-Transliteration + Reserve-Slug-Check + Kollisions-Suffix), die Public-Resolve-Endpoint `GET /api/public/partner/[slug]/route.ts` (anonymer Browser-Aufruf, ohne Service-Key) und ein zweiter Pre-configured Rate-Limiter `partnerResolveLimiter` (60/h/IP) als Slug-Enumeration-Schutz.

Pre-Condition fuer SLC-132: der Public-Signup-Endpoint braucht den Slug-Lookup zur 404-`unknown_partner`-Pruefung. Ohne SLC-131 kann SLC-132 keine Slug-Aufloesung machen.

**Backend-only Slice.** Keine UI-Aenderung in V7 (Strategaize-Admin sieht den Auto-Slug optional in /admin/partners-Liste — V8+-Polish, hier nicht in Scope).

## Feature

FEAT-052 — Partner-Slug + Public-Resolve-Endpoint.

**Pattern-Reuse (per `strategaize-pattern-reuse.md`):**
- `src/lib/handbook/slugify.ts` (existiert seit V4.3, github-slugger-basiert) — Basis fuer `src/lib/partner/slug.ts`.
- `src/lib/rate-limit.ts` (V4.2 In-Memory-Pattern) — Erweiterung um Pre-configured `partnerResolveLimiter`.
- Migration-Idempotenz-Pattern aus V6 Migration 091 (`ADD COLUMN IF NOT EXISTS` + WHERE-Filter + `CREATE UNIQUE INDEX IF NOT EXISTS`).
- `.claude/rules/sql-migration-hetzner.md` fuer Migration-Apply-Procedure.
- `.claude/rules/coolify-test-setup.md` fuer Vitest gegen Coolify-DB im node:20-Container.

**Cross-Project-Pattern-Check:** Slug-Generator mit Reserve-Liste ist Standard-Web-Pattern, in keinem Strategaize-Repo bisher fuer Tenant-Entities umgesetzt. Neu-Implementierung gerechtfertigt — Memory-File `reference_partner_slug_pattern.md` wird in MT-7 angelegt fuer naechste Projekte.

## Background

`partner_organization` (Migration 090, V6) hat heute Spalten `id, tenant_id, display_name, primary_color, logo_url, partner_kind, contact_email, ...`, aber keinen Slug. Ohne Slug muesste die Landing-Page-URL die `tenant_id` als UUID enthalten (`/p/4f8c2a1b-...`) — nicht user-friendly, schwer zu kommunizieren, kein Co-Branding-Effekt.

V7 fuehrt den ersten Tenant-bezogenen Slug ein. Backfill ist Pflicht, weil bestehende V6-Partner-Datensaetze (z.B. `qa-steuerberater-demo`) sonst NOT NULL violierten.

## In Scope

### Schema-Aenderung (Migration 097)

1. `ALTER TABLE public.partner_organization ADD COLUMN IF NOT EXISTS slug text;`
2. Backfill DO-Block (idempotent): lower + translate(Umlaute) + regexp_replace(non-alphanum) + WHILE-Loop fuer Suffix-Kollisions-Resolver (`-2`, `-3`, ...).
3. `ALTER TABLE public.partner_organization ALTER COLUMN slug SET NOT NULL;` (nach Backfill).
4. `CREATE UNIQUE INDEX IF NOT EXISTS partner_organization_slug_lower_unique ON public.partner_organization (lower(slug));`
5. Live-Apply auf Hetzner per `sql-migration-hetzner.md` Pattern (base64 → docker exec psql -U postgres) + Pre-Apply-Backup.

### Reserve-Slugs-Liste

`src/lib/partner/reserved-slugs.ts`: hartcoded Set: `admin`, `api`, `public`, `p`, `partner`, `strategaize`, `auth`, `assets`, `_next`, `favicon.ico`. Used vom Public-Resolve-Endpoint (404-Treffer trotz DB-Hit) sowie vom Slug-Generator (Kollisions-Behandlung mit `-2`-Suffix als waere es ein Duplikat).

### Slug-Generator-Lib

`src/lib/partner/slug.ts` mit zwei Pure-Functions:

```typescript
export function generateSlug(displayName: string): string;
// Lowercase, ASCII-Transliteration ("Mueller & Partner StB" -> "mueller-partner-stb"),
// max 60 chars, only [a-z0-9-], trailing/leading Hyphen-Strip. Empty-String-Input
// -> wirft Error (Caller-Pflicht).

export function generateUniqueSlug(displayName: string, existingSlugs: Set<string>): string;
// Bei Kollision OR Reserve-Liste-Treffer: -2, -3, ... suffix bis frei.
```

Basis = github-slugger via `src/lib/handbook/slugify.ts` Reuse — German Umlauts werden durch `ae`/`oe`/`ue`/`ss` ersetzt (NICHT durch `a`/`o`/`u` — Lesbarkeit fuer Steuerberater wichtiger als ASCII-Minimalismus). Sonderzeichen `& . , : ; ! ?` werden zu `-`.

### createPartnerOrganization-Erweiterung

`src/app/admin/partners/actions.ts` `createPartnerOrganization` setzt `slug` automatisch vor INSERT. Liest existierende Slugs aus DB (`SELECT slug FROM partner_organization`), ruft `generateUniqueSlug(displayName, existingSlugs)`. Strategaize-Admin sieht den generierten Slug erst nach Insert (V7 = Auto, V8+ = optionaler manueller Override).

### Public-Resolve-Endpoint

`src/app/api/public/partner/[slug]/route.ts` (anonymer Public-Route):

- Auth: KEINE (Browser-Side fetch von IS-Landing-Page).
- Rate-Limit: `partnerResolveLimiter` 60/h/IP.
- Lookup: `SELECT display_name, logo_url, accent_color FROM partner_organization WHERE lower(slug) = lower($1)`.
- Reserve-Liste-Treffer (vor DB-Hit): 404 ohne DB-Query.
- Response 200: `{ display_name, logo_url, accent_color, has_active_diagnostic_template: boolean }`. KEINE PII, KEINE internen IDs, KEIN `contact_email`.
- Response 404: `{ error: "unknown_partner" }`.
- Response 429: `{ error: "rate_limit_exceeded", retry_after_seconds: number }`.
- Cache-Header: `Cache-Control: public, max-age=60` (1min — Branding-Aenderungen propagieren schnell).

`has_active_diagnostic_template` ist boolean — true wenn der Partner mindestens 1 aktives `partner_diagnostic_v1`-Template fuer seine Tenant-Hierarchie hat (`SELECT EXISTS(SELECT 1 FROM template WHERE slug='partner_diagnostic')`). Future-Proofing fuer pro-Partner-Templates.

### Rate-Limit-Erweiterung

`src/lib/rate-limit.ts` bekommt zwei neue Pre-configured Instances am Modul-Ende:

```typescript
export const partnerResolveLimiter = createRateLimiter({ max: 60, windowMs: 60 * 60 * 1000 });
// signupLimiter (3/h) kommt in SLC-132.
```

IP-Extraktion via `x-forwarded-for[0]` (DEC-138 Single-Hop-Trust). Helper `extractClientIp(request: Request): string` als shared Util in `src/lib/rate-limit.ts`.

### Vitest-Coverage

**Slug-Generator (`src/lib/partner/__tests__/slug.test.ts`):**
1. `generateSlug('Mueller & Partner StB')` → `'mueller-partner-stb'`.
2. `generateSlug('AB & CD Steuerberatung GmbH')` → `'ab-cd-steuerberatung-gmbh'`.
3. `generateSlug('   Test  ')` → `'test'` (Trim + Collapse).
4. `generateSlug('a'.repeat(100))` → 60 chars max.
5. `generateSlug('')` → throws Error.
6. `generateSlug('Steuerkanzlei Mueller-Schmidt &Co.')` → `'steuerkanzlei-mueller-schmidt-co'`.
7. `generateUniqueSlug('Foo', new Set(['foo']))` → `'foo-2'`.
8. `generateUniqueSlug('Foo', new Set(['foo', 'foo-2']))` → `'foo-3'`.
9. `generateUniqueSlug('Admin', new Set())` → `'admin-2'` (Reserve-Liste).

**Public-Resolve-Endpoint (`src/app/api/public/partner/__tests__/route.test.ts`):**
1. Bekannter Slug → 200 mit `display_name`, `logo_url`, `accent_color`, `has_active_diagnostic_template`. KEIN `contact_email` oder `tenant_id` in Response.
2. Unbekannter Slug → 404 `unknown_partner`.
3. Reserve-Slug `admin` → 404 (kein DB-Query).
4. 61. Request innerhalb 1h von derselben IP → 429.
5. `Cache-Control: public, max-age=60` Header gesetzt.

Tests laufen gegen Coolify-DB im node:20-Container per `coolify-test-setup.md`-Pattern.

### Quality-Gates am Slice-Ende

- ESLint 0/0 auf neuen + geaenderten Files.
- tsc EXIT=0 volltree.
- `npm run build` PASS lokal mit Dummy-ENVs.
- `npm run test` gegen Coolify-DB: alle pre-existing PASS + neue 14 Tests PASS, 0 Regression.

## Out of Scope

- **Subdomain-Mapping** (`<partner-slug>.partner.strategaize.de`) — V7+ Backlog-Kandidat.
- **Manueller Slug-Edit nach Anlage** durch Strategaize-Admin — V8+ (Risiko: alte Landing-Page-Links brechen).
- **Slug-Reservierung als DB-CHECK-Constraint** — V7 Application-Layer reicht, V8+ Defense-in-Depth.
- **Multi-Sprach-Slug-Varianten** — V7 ist deutsch-only.
- **Strategaize-Admin-UI** fuer Slug-Anzeige in `/admin/partners/new` Confirmation-Page — V8+ Polish.
- **Public-Signup-Endpoint** (separate Slice SLC-132).
- **Pen-Test-Cases** fuer Public-Resolve (separate Slice SLC-134, dort als Teil der Pen-Test-Suite).

## Acceptance Criteria

| AC | Beschreibung |
|---|---|
| AC-1 | Migration 097 existiert mit Header-Kommentar analog Migration 093 (ZIEL / IDEMPOTENZ / APPLY-PATTERN / PRE-APPLY-BACKUP-PFLICHT / VERIFIKATION). |
| AC-2 | Migration 097 ist idempotent: zweiter Apply ist No-Op (ADD COLUMN IF NOT EXISTS + WHERE slug IS NULL + CREATE UNIQUE INDEX IF NOT EXISTS). |
| AC-3 | Migration 097 LIVE auf Hetzner Coolify-Postgres mit Pre-Apply-Backup in `/opt/onboarding-plattform-backups/`. Verifikation: `\d partner_organization` zeigt `slug text NOT NULL` + `partner_organization_slug_lower_unique`-Index. |
| AC-4 | Alle V6-Bestand-Partner-Rows haben nach Backfill einen non-null Slug. `SELECT COUNT(*) FROM partner_organization WHERE slug IS NULL` → 0. |
| AC-5 | `src/lib/partner/reserved-slugs.ts` exportiert `RESERVED_SLUGS` Set mit min. 10 Eintraegen (admin/api/public/p/partner/strategaize/auth/assets/_next/favicon.ico). |
| AC-6 | `src/lib/partner/slug.ts` `generateSlug` + `generateUniqueSlug` exportiert, Umlaut-Transliteration via `ae`/`oe`/`ue`/`ss` deutsch-lesbar, max 60 chars, Empty-Input wirft Error. |
| AC-7 | `createPartnerOrganization` in `src/app/admin/partners/actions.ts` setzt automatisch `slug` vor INSERT, Reuse `generateUniqueSlug` + DB-Lookup existierender Slugs. |
| AC-8 | `GET /api/public/partner/[slug]/route.ts` existiert, kein Auth-Gate, Rate-Limit 60/h/IP via `partnerResolveLimiter`. |
| AC-9 | 200-Response enthaelt `display_name`, `logo_url`, `accent_color`, `has_active_diagnostic_template`. KEIN `contact_email`, KEIN `tenant_id`, KEINE anderen internen Felder. |
| AC-10 | 404-Response fuer unbekannten Slug UND fuer Reserve-Slug `admin`. Reserve-Slug-Check passiert VOR DB-Query (Vitest verifiziert via Mock-DB-Spy). |
| AC-11 | 429-Response nach 61. Request/IP/1h, `retry_after_seconds` als Integer im Body. |
| AC-12 | `Cache-Control: public, max-age=60` Header in 200-Response gesetzt. |
| AC-13 | Vitest 14 neue Cases PASS (9 Slug-Generator + 5 Endpoint) gegen Coolify-DB im node:20-Container. |
| AC-14 | Quality-Gates am Slice-Ende: ESLint 0/0, tsc EXIT=0, Build PASS lokal mit Dummy-ENVs, Vitest 0 Regression auf Baseline. |

## Pre-Conditions

- V6.4 STABLE (erfuellt — RPT-295 2026-05-18).
- Coolify-Postgres-Container erreichbar via `docker ps --format '{{.Names}}' | grep ^supabase-db`.
- Pre-Apply-Backup-Dir existiert: `/opt/onboarding-plattform-backups/`.
- TEST_DATABASE_URL fuer Vitest gegen Coolify-DB konfigurierbar.
- `src/lib/rate-limit.ts` aus V4.2 unveraendert verfuegbar (V7-Erweiterung ist additive Append).

## Stop-Gates

- **Keine V7-Self-Signup-Aktivierung in IS-Repo** vor SLC-131-LIVE (sonst Landing-Page-Fetch failt mit 404 oder 5xx).
- **Keine parallele Schema-Aenderung an `partner_organization`** ohne Cross-Check (Migration 097 hat exclusive-Lock-Effekt fuer Sekunden waehrend NOT NULL-Constraint).

## Micro-Tasks

### MT-1: Migration 097 anlegen + Live-Apply auf Hetzner

- **Goal:** SQL-Migration-File anlegen mit ADD COLUMN + DO-Block-Backfill (Umlaut-Translit + Kollisions-Suffix) + SET NOT NULL + CREATE UNIQUE INDEX, Header-Kommentar analog Migration 093, Live-Apply auf Coolify-Postgres mit Pre-Apply-Backup.
- **Files:**
  - `sql/migrations/097_v7_partner_organization_slug.sql` (NEU)
- **Expected behavior:**
  - Header-Kommentar mit ZIEL / IDEMPOTENZ / APPLY-PATTERN / PRE-APPLY-BACKUP-PFLICHT / VERIFIKATION (Block-Struktur identisch zu Migration 093).
  - Body in BEGIN..COMMIT.
  - DO-Block laeuft WHILE-Loop fuer Suffix-Resolver. Translit-Map enthaelt `aeoeueAOEUEss` Deutsch-spezifisch.
  - Re-Apply: ADD COLUMN IF NOT EXISTS skipped, WHERE slug IS NULL leer, SET NOT NULL idempotent (`ALTER ... SET NOT NULL` ist idempotent fuer bereits NOT NULL), CREATE UNIQUE INDEX IF NOT EXISTS skipped.
  - Live-Apply: Container-Name resolven (`docker ps --format '{{.Names}}' | grep ^supabase-db`), Pre-Apply-Backup mit `pg_dump partner_organization` ablegen, `docker exec -i <db-container> psql -U postgres -d postgres < /tmp/097.sql`.
- **Verification:**
  - `ls -la sql/migrations/097_v7_partner_organization_slug.sql` → File existiert.
  - `docker exec <db-container> psql -U postgres -d postgres -c "\d partner_organization"` zeigt `slug text NOT NULL` + Index `partner_organization_slug_lower_unique`.
  - `docker exec <db-container> psql -U postgres -d postgres -c "SELECT COUNT(*) FROM partner_organization WHERE slug IS NULL"` → 0.
  - `docker exec <db-container> psql -U postgres -d postgres -c "SELECT id, display_name, slug FROM partner_organization"` zeigt sinnvolle Slugs (z.B. `qa-steuerberater-demo`).
  - Second-Run idempotent: zweiter Apply gibt NOTICE-Output ohne Fehler.
- **Dependencies:** keine.

### MT-2: Reserve-Slugs-Liste anlegen

- **Goal:** Konstanten-File mit Set von System-Slugs, die nie als Partner-Slug akzeptiert werden.
- **Files:**
  - `src/lib/partner/reserved-slugs.ts` (NEU)
- **Expected behavior:**
  - Exportiert `RESERVED_SLUGS = new Set([...])` mit min. 10 Eintraegen: `admin`, `api`, `public`, `p`, `partner`, `strategaize`, `auth`, `assets`, `_next`, `favicon.ico`.
  - Helper-Funktion `isReservedSlug(slug: string): boolean` mit lower-case-Compare.
  - JSDoc-Kommentar mit Hinweis auf V7-Defense-in-Depth-Plan (V8+ als DB-CHECK).
- **Verification:**
  - `grep -c "^  '" src/lib/partner/reserved-slugs.ts` → mindestens 10 (mit `replace_all` nicht moeglich, aber line count via grep ok).
  - tsc EXIT=0 auf File.
- **Dependencies:** keine.

### MT-3: Slug-Generator-Lib anlegen + Vitest

- **Goal:** Pure-Functions `generateSlug` + `generateUniqueSlug` mit Umlaut-Transliteration + Kollisions-Suffix + Reserve-Slug-Behandlung, 9 Vitest gegen die Logik.
- **Files:**
  - `src/lib/partner/slug.ts` (NEU)
  - `src/lib/partner/__tests__/slug.test.ts` (NEU)
- **Expected behavior:**
  - `generateSlug`: input string, output kebab-case-string max 60 chars. Deutsche Umlaute via `translate`-Tabelle (`ä→ae`, `ö→oe`, `ü→ue`, `Ä→Ae` etc., `ß→ss`). Sonderzeichen-Set `& . , : ; ! ?` zu `-`. Reuse `slugify` aus `src/lib/handbook/slugify.ts` als interner Build-Block (NICHT 1:1 ueberlassen — Handbuch-Slugs sind kuerzer + ohne Umlaut-spezifische Logik).
  - `generateUniqueSlug`: nutzt `generateSlug` + Set-Lookup + Reserve-Set-Lookup. Bei Kollision: append `-2`, `-3`, ... bis frei.
  - Empty-Input wirft `Error('cannot generate slug from empty string')`.
  - Vitest deckt 9 Cases ab (siehe In-Scope Liste).
- **Verification:**
  - `docker run --rm --network <coolify-net> -v /opt/onboarding-plattform-test:/app -w /app -e TEST_DATABASE_URL='...' node:20 npx vitest run src/lib/partner/__tests__/slug.test.ts` → 9/9 PASS.
  - tsc EXIT=0 + ESLint 0/0 auf 2 Files.
- **Dependencies:** MT-2 (Reserve-Slugs-Liste).

### MT-4: createPartnerOrganization-Erweiterung um Auto-Slug

- **Goal:** Bei `INSERT INTO partner_organization` setzt der Server-Action automatisch einen eindeutigen Slug, basierend auf `display_name` + existierende Slugs aus DB.
- **Files:**
  - `src/app/admin/partners/actions.ts` (modify `createPartnerOrganization`-Funktion)
- **Expected behavior:**
  - Vor INSERT: `SELECT slug FROM partner_organization` → Set.
  - Aufruf `generateUniqueSlug(input.displayName, existingSlugs)`.
  - INSERT bekommt `slug: <generated>` mit.
  - Bei DB-Constraint-Violation (theoretisch Race-Condition mit anderem Admin-Insert): Catch + Retry mit nachgezogenem Lookup. Maximal 3 Retries, sonst Error.
  - Logging via existing-Logger-Pattern.
- **Verification:**
  - `grep "generateUniqueSlug" src/app/admin/partners/actions.ts` → 1 Treffer.
  - tsc EXIT=0 + ESLint 0/0.
  - Existing-Vitest fuer `createPartnerOrganization` (falls vorhanden) bleibt gruen.
- **Dependencies:** MT-3 (slug.ts existiert).

### MT-5: Rate-Limit-Lib erweitern um partnerResolveLimiter + extractClientIp Helper

- **Goal:** `src/lib/rate-limit.ts` bekommt einen Pre-configured Limiter fuer den Public-Resolve-Endpoint (60/h) und einen shared Helper `extractClientIp` (Reuse fuer SLC-132 `signupLimiter`).
- **Files:**
  - `src/lib/rate-limit.ts` (modify, additive append)
  - `src/lib/__tests__/rate-limit.test.ts` (modify oder erweitern)
- **Expected behavior:**
  - Export `partnerResolveLimiter = createRateLimiter({ max: 60, windowMs: 60 * 60 * 1000 })`.
  - Export `extractClientIp(request: Request): string` — liest `x-forwarded-for`-Header, splittet bei `,`, nimmt ersten Hop. Fallback `unknown` wenn Header fehlt.
  - Existing-Limiter-Pattern (V4.2) bleibt unveraendert.
- **Verification:**
  - `grep "partnerResolveLimiter\|extractClientIp" src/lib/rate-limit.ts` → 2 Treffer.
  - tsc EXIT=0 + ESLint 0/0.
  - Existing 60+ Rate-Limit-Vitest unveraendert PASS.
- **Dependencies:** keine (parallel zu MT-3+MT-4 moeglich, aber sequentiell der Klarheit halber).

### MT-6: Public-Resolve-Endpoint + Vitest

- **Goal:** `GET /api/public/partner/[slug]/route.ts` mit Reserve-Slug-Pre-Check + Rate-Limit + DB-Lookup + Cache-Header + sauberer 200/404/429-Response. 5 Vitest gegen die Endpoint-Logik.
- **Files:**
  - `src/app/api/public/partner/[slug]/route.ts` (NEU)
  - `src/app/api/public/partner/__tests__/route.test.ts` (NEU)
- **Expected behavior:**
  - Handler signature `export async function GET(request: Request, { params }: { params: { slug: string } })`.
  - Schritt 1: `isReservedSlug(params.slug)` → 404 ohne DB-Query.
  - Schritt 2: `extractClientIp(request)` + `partnerResolveLimiter.check(ip)` → 429 mit `Retry-After` Header + JSON Body.
  - Schritt 3: Supabase-Service-Role-Client SELECT `display_name, logo_url, accent_color FROM partner_organization WHERE lower(slug) = lower($1)`.
  - Schritt 4: Wenn null → 404 `unknown_partner`.
  - Schritt 5: `has_active_diagnostic_template` via `SELECT EXISTS(SELECT 1 FROM template WHERE slug='partner_diagnostic' AND ...)`.
  - Schritt 6: Response `NextResponse.json({...}, { status: 200, headers: { 'Cache-Control': 'public, max-age=60' }})`.
  - Audit-Log NICHT noetig fuer 200/404 (Resolve ist niedrigwertig + Public). Audit-Log NUR fuer 429 (DSGVO-Hash-Pattern, Category=`partner_resolve`).
- **Verification:**
  - `curl http://localhost:3000/api/public/partner/qa-steuerberater-demo` → 200 mit korrektem Body (lokal mit Dummy-ENV).
  - Vitest 5/5 PASS gegen Coolify-DB.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** MT-1 (DB-Schema), MT-2 (Reserve-Liste), MT-5 (Rate-Limit-Helper).

### MT-7: Quality-Gates + Cockpit-Records + Memory-File

- **Goal:** Slice-End-Gates ausfuehren, Records updaten, Memory-File `reference_partner_slug_pattern.md` anlegen.
- **Files:**
  - `slices/INDEX.md` (modify — SLC-131 status → done am Slice-Ende; vorher `in_progress`)
  - `planning/backlog.json` (modify — BL-106 status: open → in_progress → done)
  - `docs/STATE.md` (modify — Current Focus auf SLC-131 done, Immediate Next Step = SLC-132)
  - `docs/MIGRATIONS.md` (modify — MIG-041 wird LIVE-marked nach Apply, Cross-Link auf SLC-131)
  - `C:\Users\Admin\.claude\projects\c--strategaize-strategaize-dev-system\memory\reference_partner_slug_pattern.md` (NEU)
- **Expected behavior:**
  - ESLint 0/0 auf alle neuen + modifizierten TS-Files.
  - tsc EXIT=0 volltree.
  - `npm run build` PASS lokal mit Dummy-ENVs.
  - `npm run test` gegen Coolify-DB: alle pre-existing PASS + 14 neue PASS, 0 Regression.
  - slices/INDEX.md: V7-Sektion existiert mit SLC-131 status `done`.
  - backlog.json: BL-106 `done`, version `V7`.
  - Memory-File `reference_partner_slug_pattern.md` dokumentiert das Slug-Pattern fuer naechste Projekte (Cross-Repo-Reuse).
- **Verification:**
  - alle Quality-Gates PASS in einer Output-Zusammenfassung.
  - Memory-Index `MEMORY.md` updated mit neuer Reference-Memory.
- **Dependencies:** MT-1..MT-6 alle done.

## Execution Order

Empfohlene Reihenfolge: **MT-1 → MT-2 → MT-3 → MT-4 → MT-5 → MT-6 → MT-7**.

- MT-1 muss vor MT-4 weil createPartnerOrganization sonst gegen leere `slug`-Spalte INSERTed (Constraint-Violation).
- MT-2 muss vor MT-3 weil Slug-Generator Reserve-Liste konsumiert.
- MT-3 muss vor MT-4 weil createPartnerOrganization den Generator nutzt.
- MT-5 muss vor MT-6 weil Endpoint den Rate-Limiter nutzt.
- MT-6 nach MT-1 (DB-Schema) + MT-2 (Reserve-Liste) + MT-5 (Rate-Limit).
- MT-7 als finaler Records-Update.

MT-3 + MT-5 sind parallelisierbar (verschiedene Files, keine Cross-Deps).

## Estimated Effort

| MT | Aufwand |
|---|---|
| MT-1 Migration 097 | ~60min (SQL + DO-Block + Live-Apply + Backup + Verifikation) |
| MT-2 Reserve-Slugs | ~10min (Konstante + JSDoc) |
| MT-3 Slug-Generator | ~60min (Logik + 9 Vitest + Edge-Cases) |
| MT-4 createPartnerOrg-Erweiterung | ~30min (Server-Action-Diff + tsc) |
| MT-5 Rate-Limit-Helper | ~30min (Add-Limiter + extractIp + Tests) |
| MT-6 Public-Resolve-Endpoint | ~75min (Route-Handler + 5 Vitest) |
| MT-7 Records + Memory | ~30min |
| **Total** | **~5h (~1d Solo-Founder)** |

## Risks

- **R-1 (Low):** Migration 097 SET NOT NULL schlaegt fehl wenn Backfill-DO-Block einen leeren `display_name`-Row uebersieht. Mitigation: Pre-Apply-Check `SELECT id FROM partner_organization WHERE display_name IS NULL OR length(trim(display_name)) = 0` muss leer sein. Bei Treffer: Manual-Fix vor Migration.
- **R-2 (Low):** Backfill-Suffix-Resolver hat Race-Condition bei parallelem INSERT waehrend Migration-Apply. Mitigation: Migration-Apply in Wartungsfenster (Internal-Test-Mode = niedrige Last) oder in Transaction mit `LOCK TABLE partner_organization`.
- **R-3 (Low):** Reserve-Liste enthaelt nicht alle moeglichen Routen. Mitigation: Liste in `reserved-slugs.ts` ist erweiterbar, V8+ kann Liste aus tatsaechlichen Routen via Build-Script generieren.
- **R-4 (Very Low):** github-slugger-Output unterscheidet sich von Architekt-Erwartung bei exotischen Eingaben. Mitigation: Vitest 9 Cases inkl. Edge-Cases (Umlaut, Sonderzeichen, lange Namen, leerer String). Bei Drift: Test-Driven-Fix.
- **R-5 (Low):** Public-Resolve-Endpoint wird ueber andere Routen (z.B. `_next/static`) gerufen und Reserve-Slug-404 verhindert Standard-Routes. Mitigation: Route-Handler ist `app/api/public/partner/[slug]/route.ts` — Next.js routet niemals static-Assets durch diesen Handler.

## Worktree-Isolation

**Delivery Mode SaaS → Worktree-Isolation Mandatory.**

- Branch-Name: `slc-131-partner-slug-foundation` (analog SLC-130-Pattern).
- Push nach /qa MT-7 PASS, dann Merge nach `main` am Slice-Ende (per `feedback_slice_merge_at_end.md`).
- Status-Tracking: `slices/INDEX.md` Status `in_progress` waehrend Worktree aktiv, Update auf `done` post-Merge.

## Cross-Slice-Konsistenz

- Migration 097 fuegt sich in MIG-041 (sequenziell nach MIG-040 = Migration 096) ein. `docs/MIGRATIONS.md` MIG-041-Eintrag wird in MT-7 von "geplant" auf "LIVE" geupdated.
- Reuse-Quote: 100% bestehende Slugify-Lib + Rate-Limit-Lib. 0 neue npm-Packages.
- Kein Konflikt mit V6.4-Code (Diagnose-Werkzeug-Renderer beruehrt nicht `partner_organization`-Reads).
- Pre-Condition fuer SLC-132 erfuellt: Slug-Lookup-Function existiert (DB-Schema + Code-Path).

## References

- Memory `project_op_v7_architecture_done.md` — V7-Stand mit 10 DECs + Component-Layout
- `docs/ARCHITECTURE.md` V7-Sektion (Line 6076-6429)
- `features/FEAT-052-partner-slug-public-resolve.md` — Detail-Spec
- `reports/RPT-297.md` — Architecture-Completion-Report
- `sql/migrations/093_v63_partner_diagnostic_seed.sql` — Migration-Pattern-Vorlage
- `.claude/rules/sql-migration-hetzner.md` — Apply-Procedure
- `.claude/rules/coolify-test-setup.md` — Vitest-Pattern gegen Coolify-DB
- `.claude/rules/strategaize-pattern-reuse.md` — Pattern-Search-Pflicht
- DEC-130 (Slug-Backfill Auto idempotent), DEC-132 (Rate-Limit In-Memory), DEC-138 (IP-Trust)
