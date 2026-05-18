# FEAT-052 — Partner-Slug + Public-Resolve-Endpoint

**Version:** V7
**Status:** planned
**Created:** 2026-05-18

## Zweck

URL-bare Identifikation einer Partner-Kanzlei via Slug (`partner_organization.slug`), damit die Intelligence-Plattform-Landing-Page unter `intelligence.strategaize.com/p/<slug>` die richtigen Partner-Daten (display_name, logo, akzent-color) rendern kann. Slug ist die Brueckenstelle zwischen Landing-Page-URL und Onboarding-Plattform-Partner-Datensatz.

## Hintergrund

`partner_organization` (Migration 090, V6) hat heute Spalten `id, tenant_id, display_name, primary_color, logo_url, partner_kind, contact_email, ...`, aber keinen Slug. Ohne Slug muesste die Landing-Page-URL die `tenant_id` als UUID enthalten (`/p/4f8c2a1b-...`) — nicht user-friendly, schwer zu kommunizieren, kein Co-Branding-Effekt.

Slug-Mechanik ist Standard-Web-Pattern (existiert in vielen Repos ueber `github-slugger` fuer Handbook-Anchors, aber NICHT fuer Tenant-Entities). V7 fuehrt den ersten Tenant-bezogenen Slug ein.

## In Scope

- **Migration 097**: `partner_organization.slug text` Spalte hinzufuegen. UNIQUE-Index auf Lower-Case-Slug. NOT NULL nach Backfill.
- **Slug-Generator**: `src/lib/partner/slug.ts` mit:
  - `generateSlug(displayName: string): string` — Lowercase, ASCII-Transliteration (z.B. "Mueller & Partner StB" → "mueller-partner-stb"), max 60 chars, only `[a-z0-9-]`, trailing/leading Hyphen-Strip. Reuse `github-slugger` als Basis.
  - `generateUniqueSlug(displayName: string, existingSlugs: Set<string>): string` — bei Kollision `-2`, `-3`, ... suffix.
- **Backfill in Migration 097**: Alle existierenden `partner_organization`-Rows bekommen automatisch einen Slug aus `display_name` via SQL-Function (psql-side, idempotent). Bei Kollision wird `-N`-Suffix angewendet.
- **createPartnerOrganization-Erweiterung**: `src/app/admin/partners/actions.ts` `createPartnerOrganization` setzt `slug` automatisch bei Partner-Anlage. Strategaize-Admin kann optional einen manuellen Slug-Vorschlag uebergeben (UI-Erweiterung in V7 Frontend-Slice).
- **Public-Resolve-Endpoint `GET /api/public/partner/:slug`** (anonymer Public-Route, KEINE Service-Key-Auth — soll von Browser-Side der Landing-Page aufrufbar sein):
  - Response 200: `{ display_name, logo_url, accent_color, has_active_diagnostic_template: boolean }`. KEINE PII, KEINE internen IDs, KEIN contact_email.
  - Response 404: `{ error: "unknown_partner" }`.
  - Cache-Header: `Cache-Control: public, max-age=60` (1min — Branding-Aenderungen propagieren schnell, aber DDoS-Schutz vorhanden).
  - Light Rate-Limit (60 Requests / Stunde / IP) zur Slug-Enumeration-Verteidigung.
- **Strategaize-Admin-UI-Hinweis**: Im bestehenden Partner-Anlegen-Formular (`/admin/partners/new`) wird der generierte Slug angezeigt und ist read-only V7 (manueller Override als V8+).
- **Vitest-Coverage**: Slug-Generator-Edge-Cases (Umlaute, Sonderzeichen, lange Namen, leerer String, Kollisions-Suffix), Public-Resolve 200/404, Rate-Limit-Hit, `partner_organization.slug` UNIQUE-Constraint blockt Duplikate.

## Out of Scope

- Sub-Domain-Mapping (`<partner-slug>.partner.strategaize.de`) — V7+ Backlog-Kandidat.
- Manueller Slug-Edit nach Anlage durch Strategaize-Admin — V8+ (Risiko: alte Landing-Page-Links brechen).
- Slug-Reservierung (z.B. "admin", "api", "p", "public" duerfen nicht von Partnern verwendet werden) — V7 hartcoded Block-Liste, Erweiterung in V8+.
- Multi-Sprach-Slug-Varianten — V7 ist deutsch-only.

## Akzeptanzkriterien

- AC-1: Migration 097 appliziert idempotent (mehrfach laufbar) auf Coolify-DB, alle existierenden Partner haben einen Slug.
- AC-2: `partner_organization.slug` UNIQUE-Index blockt INSERT mit doppeltem Slug → DB-Error wird in `createPartnerOrganization` zu freundlicher Fehlermeldung umgewandelt.
- AC-3: `generateSlug('Mueller & Partner StB')` → `'mueller-partner-stb'`.
- AC-4: `generateSlug('AB & CD Steuerberatung GmbH')` zweimal in Folge ohne Konflikt → `'ab-cd-steuerberatung-gmbh'` + `'ab-cd-steuerberatung-gmbh-2'`.
- AC-5: `GET /api/public/partner/mueller-partner-stb` → 200 mit `display_name`, `logo_url`, `accent_color`, `has_active_diagnostic_template`. KEIN `contact_email` oder `tenant_id` in Response.
- AC-6: `GET /api/public/partner/unknown` → 404. `GET /api/public/partner/admin` (Reserve-Liste) → 404.
- AC-7: 61. Request innerhalb 1h von derselben IP an `/api/public/partner/*` → 429.
- AC-8: `Cache-Control: public, max-age=60` Header gesetzt.
- AC-9: Vitest 100% Coverage auf `slug.ts`-Generator + Public-Resolve-Endpoint-Routes.
- AC-10: Reserve-Liste statischer Slugs (`admin`, `api`, `public`, `p`, `partner`, `strategaize`, `auth`) wird abgelehnt.

## Abhaengigkeiten

- **Pattern-Reuse**: `src/lib/handbook/slugify.ts` (existiert seit V4.3, github-slugger-basiert) — wird als Basis-Helper fuer `partner/slug.ts` adaptiert.
- **Pattern-Reuse**: Migration-Idempotenz-Pattern aus V6 Migration 091 (`ON CONFLICT DO NOTHING` + WHERE-Filter).
- **Pattern-Reuse**: `error_log`-Audit-Pattern (FEAT-051 reused).
- **Pattern-Reuse**: Rate-Limit aus FEAT-051 (zweite Limit-Instance fuer Resolve-Endpoint mit anderer Identifier-Compound).
- **Hard-Dep**: Migration 097 muss VOR FEAT-051 Endpoint-Deploy live sein (Slug-Lookup ist Pre-Condition fuer Signup-Endpoint).

## Reuse-Anker

- `src/lib/handbook/slugify.ts` → Basis fuer `src/lib/partner/slug.ts`.
- Migration 091-Idempotenz-Pattern (V6 partner_branding_config) → MIG-097.
- Reserve-Liste fuer Slugs in Server-Side-Constants (`src/lib/partner/reserved-slugs.ts`).
