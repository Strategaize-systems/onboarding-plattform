# SLC-V9.8-A — Tag-Export-Propagation (themes → knowledge_unit)

- Version: V9.8
- Feature: FEAT-089
- Backlog: BL-505
- Status: planned
- Priority: High
- Created: 2026-06-18
- Parallel-Group: S1 (zuerst — erzeugt+befuellt die Spalte, die SLC-V9.8-B liest)
- MIG reserviert: **123** (`sql/migrations/123_v98_knowledge_unit_themes.sql`)
- Worktree (SaaS-Pflicht): Cumulative-Single-Branch `v9-8-tag-vokabular` (A vor B, EIN Master-Merge nach Gesamt-/qa)

## Ziel
Die im Bulk-Lauf erarbeiteten `themes` (`email_synthesized_unit.themes`, Mig 119) werden beim Promote ins Handbuch verlustfrei + queryable in die zugehoerige `knowledge_unit` uebernommen. Dafuer bekommt `knowledge_unit` erstmals eine dedizierte `themes text[]`-Spalte + GIN-Index (DEC-228). Forward-only.

## Architektur-Anker
- DEC-228: Theme-Export-Ziel = dedizierte `knowledge_unit.themes text[]` + GIN (nicht `metadata` JSONB) — Findbarkeit = Produktkern, queryable/facetten-faehig.
- Code-Gap (verifiziert): `handbook-import.ts::mapSynthesizedUnitToKnowledgeUnit` mappt heute `title`, `body`, `block_key`, `confidence`, `metadata` — **kein `themes`**. `KnowledgeUnitInsertInput` (Z.103) + `SynthesizedUnitForImport` (Z.56) tragen `themes` nicht. Der Caller `importToHandbook` (`curation/actions.ts`) baut `unitForImport` (Z.769) hand + `.insert(insertInput)` (Z.801) spreadet die Mapper-Ausgabe direkt.

## Akzeptanzkriterien
- **AC-A-1:** Migration 123 fuegt `knowledge_unit.themes text[] NOT NULL DEFAULT '{}'` + GIN-Index `idx_knowledge_unit_themes` hinzu. Additiv, kein Content-Backfill (Bestands-Rows = `'{}'`). NOT NULL+DEFAULT = Metadata-only-ALTER (PG11+, kein Table-Rewrite).
- **AC-A-2:** Promote (`importToHandbook`) schreibt `email_synthesized_unit.themes` verlustfrei in `knowledge_unit.themes` (Reihenfolge erhalten; `null`/leer → `'{}'`).
- **AC-A-3:** 0 Regression der bestehenden Promote-/Snapshot-Pipeline — `title`/`body`/`block_key`/`confidence`/`metadata` unveraendert, `rollbackLoop` intakt (SC-5).
- **AC-A-4:** Queryable — `WHERE themes && ARRAY[...]` / `@>` liefert die Unit (GIN-gestuetzt). DB-Test beweist Spalte + Index + eine Containment-Query.
- **AC-A-5:** `tsc` 0, `eslint` 0, hermetische Vitest GREEN, `next build` PASS.

## Micro-Tasks

### MT-1: Migration 123 (knowledge_unit.themes + GIN) + DB-Test
- Goal: dedizierte queryable `themes`-Spalte auf `knowledge_unit` live-bereit.
- Files: `sql/migrations/123_v98_knowledge_unit_themes.sql` (neu), `src/lib/db/__tests__/migration-123-knowledge-unit-themes.test.ts` (neu, node:20-Sidecar gegen Coolify-DB per `coolify-test-setup.md`).
- Expected behavior: `ALTER TABLE public.knowledge_unit ADD COLUMN IF NOT EXISTS themes text[] NOT NULL DEFAULT '{}';` + `CREATE INDEX IF NOT EXISTS idx_knowledge_unit_themes ON public.knowledge_unit USING gin (themes);` (Stil-Referenz Mig 119). Idempotent. Kein Backfill.
- Verification: `\d knowledge_unit` zeigt `themes` + GIN; `SELECT id FROM knowledge_unit WHERE themes @> ARRAY['x']` parsed/laeuft; 2. Apply = 0 Drift.
- Dependencies: none. (Live-Apply = /deploy, NICHT in der Slice — siehe R-A-1.)

### MT-2: Propagation in Promote-Pfad + Unit-Test
- Goal: `themes` flieesst Quelle → Mapper → INSERT.
- Files:
  - `src/lib/bulk-email/handbook-import.ts` — `SynthesizedUnitForImport` (+`themes: string[] | null`), `KnowledgeUnitInsertInput` (+`themes: string[]`), `mapSynthesizedUnitToKnowledgeUnit` setzt `themes: Array.isArray(args.unit.themes) ? args.unit.themes : []`.
  - `src/app/dashboard/bulk-email-import/[run_id]/curation/actions.ts` — die `units`-SELECT auf `email_synthesized_unit` um Spalte `themes` erweitern; `unitForImport` (Z.769) um `themes: unit.themes`. (`.insert(insertInput)` Z.801 spreadet automatisch — keine weitere Aenderung.)
  - Tests: `src/lib/bulk-email/__tests__/handbook-import.test.ts` (Mapper-Ausgabe enthaelt `themes`, inkl. null→`[]`), `src/app/dashboard/bulk-email-import/[run_id]/curation/__tests__/actions.test.ts` (Promote schreibt `themes`), `src/lib/db/__tests__/v95-bulk-e2e.test.ts` (e2e-Propagation, falls Sidecar-DB).
- Expected behavior: nach Promote enthaelt die neue `knowledge_unit`-Row exakt die `themes` der Quell-Unit.
- Verification: hermetische Vitest GREEN; `tsc`/`eslint` 0.
- Dependencies: MT-1 (Spalte existiert).

## Risiken & Dependencies
- **R-A-1 (Deploy-Ordering, BLOCKING fuer /deploy):** `.insert(insertInput)` spreadet `themes` → wuerde gegen eine DB ohne Spalte `column "themes" does not exist` werfen. Mitigation: im /deploy Migration 123 **vor** dem Coolify-Code-Redeploy live-applien (`sql-migration-hetzner.md`). Bewusst KEINE defensive metadata-artige Retry-ohne-themes-Logik (themes ist Kern, kein optionales Feld; Ordering kontrolliert das sauber).
- **R-A-2 (Table-Rewrite):** `NOT NULL DEFAULT '{}'` auf bestehender Tabelle — in PG11+ Metadata-only, kein Rewrite. Vor Apply bestaetigen (Row-Count `knowledge_unit` ist moderat).
- **Dependency:** keine (erster V9.8-Slice). Blockt SLC-V9.8-B (Vokabular-Quelle = diese Spalte).

## Out of Scope
Retroaktives Re-Tagging bestehender `knowledge_unit`-Rows; Tag-Facetten-Such-UI im Handbuch (V9.8 stellt nur die Daten + den Index bereit); `email_pattern.themes`→Extraktion (deferred, DEC-231).
