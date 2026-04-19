# SLC-016 — SOP-Schema + Generation

## Zuordnung
- Feature: FEAT-012 (SOP Generation Backend)
- Version: V2
- Priority: High
- Depends on: SLC-013 (Orchestrator fuer Quality-Report)

## Ziel
SOPs koennen pro Block on-demand generiert werden. Neuer Worker-Job-Type sop_generation. Template-spezifischer SOP-Prompt. SOP-Daten in eigener Tabelle.

## Scope
- Migration 042: sop-Tabelle + RLS + Indexes
- Migration 045: ALTER template ADD sop_prompt JSONB
- Migration 048: RPC fuer SOP erstellen/aktualisieren
- SOP-Prompt (sop-prompt.ts) — template-spezifisch
- Worker: sop_generation Job-Type
- Server Action: SOP-Generierung triggern (Debrief-UI Button)
- Exit-Readiness Template um sop_prompt erweitern (UPDATE Migration)

## Nicht in Scope
- SOP-UI im Debrief (SLC-017)
- SOP-Export (SLC-017)
- PDF-Export (V2.1)
- SOP-Versionierung (V2.1)

## Acceptance Criteria
1. sop-Tabelle existiert mit RLS
2. template.sop_prompt-Spalte existiert
3. Exit-Readiness Template hat sop_prompt gesetzt
4. Server Action triggerSopGeneration() enqueued ai_job
5. Worker generiert SOP via Bedrock + speichert in sop-Tabelle
6. SOP-content hat korrektes JSON-Format (title, objective, steps[], risks[])
7. Kosten in ai_cost_ledger mit feature='sop'
8. npm run build + npm run test erfolgreich

### Micro-Tasks

#### MT-1: Migration 042_sop.sql
- Goal: sop-Tabelle wie in ARCHITECTURE.md
- Files: `sql/migrations/042_sop.sql`
- Expected behavior: Tabelle sop mit allen Spalten. RLS: strategaize_admin Full, tenant_admin Read eigener Tenant. Indexes auf (capture_session_id, block_key). GRANT authenticated + service_role.
- Verification: SQL-Syntax korrekt
- Dependencies: none

#### MT-2: Migration 045_template_v2_fields.sql
- Goal: Template-Tabelle um sop_prompt + owner_fields erweitern
- Files: `sql/migrations/045_template_v2_fields.sql`
- Expected behavior: ALTER template ADD COLUMN sop_prompt JSONB DEFAULT NULL, ADD COLUMN owner_fields JSONB DEFAULT NULL. Idempotent (DO $$ IF NOT EXISTS $$).
- Verification: SQL-Syntax korrekt
- Dependencies: none

#### MT-3: Migration 048_rpc_sop.sql + Exit-Readiness sop_prompt
- Goal: RPC + Exit-Readiness-Template sop_prompt setzen
- Files: `sql/migrations/048_rpc_sop.sql`
- Expected behavior: (1) rpc_create_sop(session_id, block_key, checkpoint_id, content JSONB, model TEXT, cost NUMERIC) — INSERT sop. (2) rpc_update_sop(sop_id, content JSONB) — UPDATE sop.content + updated_at. (3) UPDATE template SET sop_prompt = '{"system_prompt": "..."}' WHERE slug = 'exit_readiness'.
- Verification: SQL-Syntax korrekt
- Dependencies: MT-1, MT-2

#### MT-4: Migrationen auf Hetzner ausfuehren
- Goal: Alle 3 Migrationen auf Produktions-DB
- Files: keine Code-Aenderung
- Expected behavior: Tabelle sop + Spalten sop_prompt/owner_fields auf template + RPCs vorhanden
- Verification: `\d sop`, `\d template` zeigt neue Spalten
- Dependencies: MT-1, MT-2, MT-3

#### MT-5: SOP-Prompt erstellen
- Goal: Bedrock-Prompt fuer SOP-Generierung aus Knowledge Units
- Files: `src/workers/sop/sop-prompt.ts`, `src/workers/sop/types.ts`
- Expected behavior: System-Prompt Template (template.sop_prompt als Override, Default-Prompt als Fallback). Input: KU-Liste + quality_report + Template-Metadaten. Output: SOP-JSON (title, objective, prerequisites[], steps[], risks[], fallbacks[]).
- Verification: TypeScript kompiliert
- Dependencies: none

#### MT-6: Worker — sop_generation Job-Type
- Goal: SOP via Bedrock generieren und speichern
- Files: `src/workers/sop/handle-sop-job.ts`, `src/workers/condensation/claim-loop.ts`
- Expected behavior: (1) Registriere Job-Type 'sop_generation' in Claim-Loop. (2) Lade block_checkpoint + KUs + template.sop_prompt. (3) Bedrock-Call. (4) rpc_create_sop aufrufen. (5) ai_cost_ledger mit feature='sop'. (6) rpc_complete_ai_job.
- Verification: npm run build, Worker startet
- Dependencies: MT-4, MT-5

#### MT-7: Server Action — SOP-Generierung triggern
- Goal: Debrief-UI Button loest SOP-Generierung aus
- Files: `src/app/admin/debrief/[sessionId]/[blockKey]/sop-actions.ts`
- Expected behavior: triggerSopGeneration(sessionId, blockKey, checkpointId) — INSERT ai_job type='sop_generation'. Prueft: strategaize_admin-Rolle. Returns Job-ID.
- Verification: npm run build
- Dependencies: MT-4
