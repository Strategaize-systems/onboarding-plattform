# SLC-003 — Template + Exit-Readiness-Content

- Feature: FEAT-002
- Status: planned
- Priority: High
- Created: 2026-04-14
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
Das Exit-Readiness-Template als erste Template-Instanz anlegen: Inhalt (Bloecke, Fragen, Reihenfolge, Pflichtflags) aus Blueprint V3.4 in die neue `template`-Tabelle portieren. Semver-Version.

## In Scope
- Migration 027: Seed-Insert fuer Template `exit_readiness` v1.0.0 mit vollstaendigem `blocks`-JSON
- Extraction-Script `scripts/port-exit-readiness-from-blueprint.ts` (einmalig, committed)
- Source der Bloecke: Blueprint V3.4 DB-Export oder Blueprint-Seed-Files
- Test: Template ist lesbar via `getTemplateBySlug('exit_readiness')` und enthaelt N Bloecke (erwartete Anzahl aus Blueprint)

## Out of Scope
- Template-Editor-UI (V2+)
- Zweites Template (V2+)
- Versioned Content-Updates mid-session (Q8 — template_version wird pro Session eingefroren)

## Acceptance
- `SELECT * FROM template WHERE slug = 'exit_readiness'` liefert 1 Row mit nicht-leerem `blocks`
- Anzahl Bloecke und Fragen entspricht Blueprint V3.4
- `template.version = '1.0.0'`
- Tests gruen (`npm run test -- template-queries`)

## Dependencies
- SLC-001 (template-Tabelle muss existieren)

## Risks
- Blueprint-Content-Struktur passt nicht 1:1 auf neue `blocks jsonb`-Shape — Mapping-Aufwand
- Content-Aenderungen aus Blueprint V3.5 sind irrelevant (Content wird eingefroren)

## Micro-Tasks

### MT-1: Blueprint-Content extrahieren
- Goal: Blueprint-V3.4-Bloecke + Questions als JSON extrahieren.
- Files:
  - `scripts/port-exit-readiness-from-blueprint.ts`
  - `data/seed/exit-readiness-v1.0.0.json` (Output)
- Expected behavior: Script liest Blueprint-Seed-Source (zu ermitteln: `blueprint-plattform/sql/seeds/*` oder DB-Export), transformiert in `blocks`-Shape (id, key, title, description, questions[], order, required_bool) und schreibt JSON-Datei.
- Verification: `node --loader ts-node/esm scripts/port-exit-readiness-from-blueprint.ts` produziert Datei mit erwarteter Bloeck-Anzahl (N aus Blueprint).
- Dependencies: Zugriff auf Blueprint-Repo

### MT-2: Migration 027 — Template-Seed
- Goal: Exit-Readiness-Template in DB einfuegen.
- Files: `sql/migrations/027_seed_exit_readiness_template.sql`
- Expected behavior: `INSERT INTO template (slug, name, version, description, blocks) VALUES ('exit_readiness', 'Exit-Readiness', '1.0.0', '...', '<blocks-jsonb>') ON CONFLICT (slug) DO NOTHING`.
- Verification: `SELECT slug, version, jsonb_array_length(blocks) FROM template` zeigt Row mit erwarteter Array-Laenge.
- Dependencies: MT-1

### MT-3: Template-Query-Tests
- Goal: `getTemplateBySlug` + `listTemplates` verifizieren.
- Files: `src/lib/db/template-queries.test.ts` (erweitern aus SLC-001 MT-4)
- Expected behavior: Test laedt `exit_readiness`, pruft Struktur (blocks.length > 0, jedes block hat `key`, `questions`).
- Verification: `npm run test -- template-queries` gruen.
- Dependencies: MT-2

### MT-4: Migration auf Hetzner
- Goal: 027 auf Prod ausrollen.
- Files: keine.
- Expected behavior: Base64-Transport (Rule sql-migration-hetzner). Migration-File kann gross sein (jsonb) — ggf. via gzip+base64 falls >1MB.
- Verification: `SELECT slug, version FROM template` auf Prod.
- Dependencies: MT-2

## Verification Summary
- Seed-Datei committed, Migration deployed
- `npm run test -- template-queries` gruen
- Prod-DB enthaelt `exit_readiness` v1.0.0
