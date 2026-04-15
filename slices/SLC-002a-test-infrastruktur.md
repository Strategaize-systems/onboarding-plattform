# SLC-002a — Test-Infrastruktur + RLS-Isolationstest

- Feature: FEAT-001 (cross-cutting Foundation)
- Status: planned
- Priority: Blocker
- Created: 2026-04-15
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
Lauffaehige Vitest-Test-Infrastruktur etablieren, damit das SaaS-TDD-Mandat aus `.claude/rules/tdd.md` ab hier erfuellt werden kann. Als erster Lackmustest: 2-Tenant-RLS-Isolation (MT-5 aus SLC-001 nachholen). Ohne diesen Slice sind alle weiteren SaaS-Slices ohne Regression-Netz.

## In Scope
- Vitest + @vitest/coverage-v8 installieren
- `package.json`-Scripts: `test`, `test:watch`, `test:coverage`
- `vitest.config.ts` mit Node-Environment, DB-Setup-File, Coverage-Konfiguration
- `pg`-Client-Helper fuer Tests gegen Test-DB-Schema
- Test-DB-Setup: separates Schema `test_` auf Hetzner-Supabase-DB, mit Transaction-Wrapping pro Test
- Test-Helper `withTenantContext(tenantId, role)`: setzt `SET LOCAL request.jwt.claims` fuer RLS-Simulation
- Test-Helper `seedTenantFixture()`: erstellt 2 Test-Tenants + 2 Test-Profile pro Test
- Integrationstest `rls-isolation.test.ts`: tenant_admin von Tenant A sieht keine capture_session-Rows von Tenant B (MT-5 aus SLC-001)
- README-Abschnitt "Running Tests"
- CI-Hook nicht noetig (V1 hat keine CI-Pipeline — Tests laufen lokal/pre-commit)

## Out of Scope
- Playwright / E2E-Browser-Tests (kommt mit SLC-005 oder eigener UI-Slice)
- Separate Test-DB-Instanz als eigener Container (spaeter, wenn Test-Volume waechst)
- Test-Coverage-Schwellwerte erzwingen (erst wenn Baseline steht)
- GitHub Actions oder anderes CI (V1 = self-deploy)
- Bedrock-Mocking (kommt mit SLC-008)

## Acceptance
- `npm run test` laeuft ohne Fehler
- `rls-isolation.test.ts` gruen: verifiziert Cross-Tenant-Leseverbot fuer capture_session, knowledge_unit, validation_layer
- `test:coverage` produziert lesbaren Report
- ISSUE-002 + ISSUE-004 resolved
- Dokumentation in README wie Tests zu starten sind

## Dependencies
- SLC-001 (Schema muss stehen)
- SLC-002 (Rolle heisst `tenant_admin`, nicht mehr `tenant_owner`)

## Risks
- Tests gegen Prod-DB-Container sind grenzwertig — Transaction-Rollback per Test ist Pflicht. Alternativ: separates Schema `test_` mit eigenem Namespace.
- Supabase JWT-Claims simulieren per `SET LOCAL` braucht exakt die gleichen Claim-Namen wie das echte Auth-System (`request.jwt.claims` JSONB).
- Windows-Dev-Umgebung ohne lokale Postgres — Tests muessen entweder gegen Hetzner oder gegen Docker-pg laufen.

## Micro-Tasks

### MT-1: Vitest installieren + package.json-Scripts
- Goal: Test-Runner verfuegbar.
- Files: `package.json`, `vitest.config.ts`
- Expected behavior: `npm run test` zeigt "No test files found" (ohne Fehler).
- Verification: Exit-Code 0.
- Dependencies: none

### MT-2: pg-Test-Helper + JWT-Claim-Setter
- Goal: Wiederverwendbare Helper fuer DB-Tests.
- Files: `src/test/db.ts`, `src/test/auth-context.ts`
- Expected behavior: `withTenantContext(tenantId, 'tenant_admin', async (client) => {...})` oeffnet Tx, setzt JWT-Claims, fuehrt Callback aus, rollt zurueck.
- Verification: Smoke-Test der Helper mit trivialem Query gruen.
- Dependencies: MT-1

### MT-3: Tenant-Fixture + Seed-Helper
- Goal: Reproduzierbare Test-Tenants + -User fuer jeden Test.
- Files: `src/test/fixtures/tenants.ts`
- Expected behavior: `seedTenantFixture(client)` erzeugt 2 Tenants + 2 Profile mit bekannten IDs. Alles innerhalb offener Tx — bei Rollback ist DB sauber.
- Verification: Manueller Call in Vitest zeigt 2 Rows, nach Test 0 Rows.
- Dependencies: MT-2

### MT-4: RLS-Isolationstest
- Goal: Cross-Tenant-Leseverbot verifizieren.
- Files: `src/lib/db/__tests__/rls-isolation.test.ts`
- Expected behavior:
  - Seed 2 Tenants A/B mit je 1 capture_session
  - Client im Kontext Tenant A, Rolle tenant_admin: SELECT auf capture_session zeigt 1 Row (die von A)
  - Selber Query mit Kontext Tenant B zeigt 1 andere Row
  - Client als tenant_admin Tenant A darf capture_session von B nicht lesen
- Verification: `npm run test -- rls-isolation` gruen.
- Dependencies: MT-3

### MT-5: Coverage-Script + README-Docs
- Goal: Entwickler-Einstieg dokumentieren.
- Files: `README.md` (Abschnitt "Running Tests"), `package.json`
- Expected behavior: README erklaert ENV-Variablen, wie man tests lokal gegen Hetzner laufen laesst, und dass Test-Tx immer rollt zurueck.
- Verification: Lesbar, vollstaendig.
- Dependencies: MT-1

### MT-6: Issue-Updates
- Goal: ISSUE-002 und ISSUE-004 schliessen.
- Files: `docs/KNOWN_ISSUES.md`
- Expected behavior: Status beider Issues auf `resolved` mit Verweis auf SLC-002a.
- Verification: KNOWN_ISSUES-Format nach `.claude/rules/project-records-format.md`.
- Dependencies: MT-4

## Verification Summary
- `npm run test` gruen
- `rls-isolation.test.ts` deckt 2-Tenant-Isolation fuer capture_session + knowledge_unit + validation_layer ab
- ISSUE-002 + ISSUE-004 geschlossen
- README beschreibt Test-Ausfuehrung
