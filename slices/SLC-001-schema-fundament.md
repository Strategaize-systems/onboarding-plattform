# SLC-001 — Schema-Fundament

- Feature: FEAT-001
- Status: planned
- Priority: Blocker
- Created: 2026-04-14
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja (alle V1-Slices)

## Goal
5 neue Kerntabellen (`template`, `capture_session`, `block_checkpoint`, `knowledge_unit`, `validation_layer`) inklusive RLS-Policies auf dem selfhosted Supabase anlegen. Basis fuer alle folgenden Slices. Query-Layer-Abstraktion in generischem Naming.

## In Scope
- Migration 021: Basis-Tabellen + PK/FK + RLS enable
- Migration 022: RLS-Policies (tenant_admin / tenant_member / strategaize_admin)
- Migration 023: Indizes (`capture_session.tenant_id`, `knowledge_unit.block_checkpoint_id`, `block_checkpoint.capture_session_id`, `validation_layer.knowledge_unit_id`)
- Migration 024: Helper-Checks (`auth.user_tenant_id()`, `auth.user_role()` nur pruefen, nicht neu anlegen — bereits Blueprint-Bestand)
- Migration 025: Seed-Infra (leere `template`-Tabelle, Test-Tenants werden ueber bestehende Blueprint-Seeds gesetzt)
- `src/lib/db/capture-session-queries.ts` — generische Query-Schicht fuer capture_session
- `src/lib/db/knowledge-unit-queries.ts` — generisch
- `src/lib/db/template-queries.ts` — generisch
- Tests: RLS-Isolation (2-Tenant-Test), CRUD-Baseline

## Out of Scope
- Rollen-Umbenennung `tenant_owner → tenant_admin` (SLC-002)
- Template-Content (SLC-003)
- ai_jobs-Tabelle + Claim-RPCs (SLC-008, OS-Portierung)

## Acceptance
- Migration auf Hetzner-DB ausgefuehrt (per Rule `sql-migration-hetzner`)
- `\dt` zeigt alle 5 Tabellen mit RLS enabled
- 2-Tenant-RLS-Test: `tenant_admin` von Tenant A sieht keine Rows von Tenant B
- Query-Layer enthaelt keine Blueprint-spezifischen Strings (`questionnaire`, `debrief_item`, `block_session`)
- Alle neuen Tests gruen (`npm run test`)

## Dependencies
- Keine (Fundament-Slice)

## Risks
- Blueprint hat bereits `blueprint_block_sessions` / `blueprint_debrief_items` — Naming-Kollisionen vermeiden
- `strategaize_admin` Admin-Policy muss Cross-Tenant-Read zulassen, aber nicht Service-Role-Bypass im Browser

## Micro-Tasks

### MT-1: Migration 021 — Kerntabellen + FK
- Goal: 5 Tabellen in einer idempotenten SQL-Migration anlegen.
- Files: `sql/migrations/021_core_capture_schema.sql`
- Expected behavior: `CREATE TABLE IF NOT EXISTS` fuer alle 5 Tabellen mit Spalten aus `docs/ARCHITECTURE.md` Abschnitt Data Model. FKs auf `tenants`, `auth.users`. `ENABLE ROW LEVEL SECURITY` pro Tabelle.
- Verification: `docker exec ... psql -c "\d capture_session"` zeigt alle Spalten, RLS=on.
- Dependencies: none

### MT-2: Migration 022 — RLS-Policies
- Goal: Lese-/Schreib-Policies pro Tabelle fuer 3 Rollen.
- Files: `sql/migrations/022_core_capture_rls.sql`
- Expected behavior: Policies `{table}_tenant_read`, `{table}_tenant_write`, `{table}_admin_read`, `{table}_admin_write` analog Blueprint-Muster. Admin-Policies nur via `auth.user_role() = 'strategaize_admin'`.
- Verification: 2-Tenant-Test via `psql` mit wechselnder `auth.jwt()`-Simulation; Tenant-A-User sieht 0 Rows aus Tenant B.
- Dependencies: MT-1

### MT-3: Migration 023 — Indizes
- Goal: Performance-Indizes fuer haeufige Filter.
- Files: `sql/migrations/023_core_capture_indexes.sql`
- Expected behavior: Indizes auf Tenant-Filter + FK-Spalten.
- Verification: `\di` zeigt neue Indizes.
- Dependencies: MT-1

### MT-4: Query-Layer generisch
- Goal: TypeScript-Queries fuer `capture_session`, `knowledge_unit`, `template` ohne Blueprint-spezifische Begriffe.
- Files:
  - `src/lib/db/capture-session-queries.ts`
  - `src/lib/db/knowledge-unit-queries.ts`
  - `src/lib/db/template-queries.ts`
  - `src/lib/db/capture-session-queries.test.ts`
  - `src/lib/db/knowledge-unit-queries.test.ts`
- Expected behavior: CRUD + `listByTenant`, `getByIdScoped` (RLS-respecting). Zod-Schemas fuer Row-Typen.
- Verification: `npm run test -- capture-session-queries`, `knowledge-unit-queries` gruen; Tests decken Happy + Not-Found + Cross-Tenant-Block ab.
- Dependencies: MT-1, MT-2

### MT-5: 2-Tenant-RLS-Integrationstest
- Goal: Automatisierter Test, der RLS gegen echte Testdaten verifiziert.
- Files: `src/lib/db/__tests__/rls-isolation.test.ts`
- Expected behavior: Seed 2 Tenants, INSERT 1 capture_session pro Tenant, Select als Tenant-A-User ergibt nur 1 Row, als strategaize_admin 2 Rows.
- Verification: `npm run test -- rls-isolation` gruen.
- Dependencies: MT-1..MT-4

### MT-6: Migration auf Hetzner ausfuehren
- Goal: Migrationen 021-023 laut Rule `sql-migration-hetzner` ausfuehren.
- Files: keine Code-Aenderungen.
- Expected behavior: Base64-Transport, `postgres`-User, Verifikation `\d table`.
- Verification: `\dt` auf Prod zeigt 5 neue Tabellen.
- Dependencies: MT-1..MT-3 (nicht MT-4/5 — Tests lokal)

## Verification Summary
- Build: `npm run build`
- Tests: `npm run test`
- DB: `\dt`, `\d capture_session`, `\d knowledge_unit` auf Hetzner
- RLS: 2-Tenant-Test gruen
