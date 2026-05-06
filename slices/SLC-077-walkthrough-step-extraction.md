# SLC-077 — Walkthrough Stufe 2 Schritt-Extraktion

## Goal

Zweite Stufe der V5 Option 2 Methodik-Pipeline. Migration 085 deployen (`walkthrough_step` Tabelle + Indizes + RLS-Policies, 4-Rollen-Matrix). Neuer Worker-Job-Handler `walkthrough_extract_steps` nimmt redacted-KU aus SLC-076 als Input, ruft Bedrock-Sonnet (eu-central-1) mit Schritt-Extraktion-Prompt, persistiert pro extrahiertem SOP-Schritt eine Row in `walkthrough_step` (action, responsible, timeframe, success_criterion, dependencies, transcript_snippet, transcript_offset_start/end). Pipeline-Trigger advanced status `extracting → mapping` und enqueues Stufe 3 Job. Edge-Case: walkthrough mit N=0 extrahierten Schritten leitet trotzdem zu `mapping → pending_review` mit leerem Tree weiter.

## Feature

FEAT-037 (Walkthrough AI-Pipeline) — Stufe 2. Sequentiell nach SLC-076 PII-Redaction. Pattern-Reuse: V2 SOP-Generation-Pattern (FEAT-012, SLC-016).

## In Scope

### A — Migration 085 (`walkthrough_step` Tabelle)

Pfad: `sql/migrations/085_v5opt2_walkthrough_step.sql` (neu), per `sql-migration-hetzner.md`-Pattern auf Hetzner appliziert.

DDL gemaess MIG-032 (siehe `docs/MIGRATIONS.md` MIG-032 Format-Skizze):
- 18 Columns (id, tenant_id, walkthrough_session_id, step_number, action, responsible, timeframe, success_criterion, dependencies, transcript_snippet, transcript_offset_start, transcript_offset_end, edited_by_user_id, edited_at, deleted_at, created_at, updated_at + UNIQUE-Constraint walkthrough_session_id+step_number).
- 2 Indizes: `idx_walkthrough_step_session` (partial WHERE deleted_at IS NULL), `idx_walkthrough_step_tenant`.
- ENABLE ROW LEVEL SECURITY.
- 3 Policies (RLS-Translation auf real verwendete Helper-Funktionen `auth.user_role()` + `auth.user_tenant_id()`):
  - `walkthrough_step_select` (SELECT, 4-Rollen-Matrix gemaess ARCHITECTURE.md V5 Option 2).
  - `walkthrough_step_update` (UPDATE, strategaize_admin + tenant_admin eigener Tenant).
  - **Kein INSERT-Policy** — Worker schreibt via service_role (BYPASSRLS).
- `_set_updated_at`-Trigger auf BEFORE UPDATE.
- GRANT SELECT, UPDATE TO authenticated; GRANT ALL TO service_role.
- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / DROP POLICY IF EXISTS + CREATE POLICY.
- Pre-Apply-Backup pro `sql-migration-hetzner.md`.

### B — Bedrock-Prompt `step_extract.ts`

Pfad: `src/lib/ai/prompts/walkthrough/step_extract.ts` (neu).

- System-Prompt: "Du extrahierst SOP-Schritte aus einem redacted Walkthrough-Transkript."
- Output-Schema: JSON-Array `{ step_number, action, responsible?, timeframe?, success_criterion?, dependencies?, transcript_snippet, transcript_offset_start, transcript_offset_end }`.
- Beispiel-Input + Beispiel-Output (few-shot).
- Edge-Case-Guidance: "Wenn der Walkthrough zu unstrukturiert fuer Schritt-Extraktion ist, gib leeres Array `[]` zurueck."

### C — Worker `walkthrough-extract-steps-worker.ts`

Pfad: `src/workers/ai/walkthrough-extract-steps-worker.ts` (neu).

Pattern-Reuse aus existing AI-Worker:
- Polling-Loop: claim AI-Job mit `job_type='walkthrough_extract_steps'`.
- Lade walkthrough_session per `walkthroughSessionId` aus `payload`.
- Lade redacted-KU (source='walkthrough_transcript_redacted', evidence_refs.walkthrough_session_id=ws.id).
- Bedrock-Call ueber `bedrockClient.complete()` mit step_extract-Prompt + redacted-Text.
- Parse JSON-Output (Zod-Schema-Validation).
- Bulk-INSERT walkthrough_step pro Schritt mit step_number=1..N. Bei N=0: kein INSERT, Pipeline laeuft trotzdem weiter.
- ai_cost_ledger-Eintrag.
- Status-Maschine via `pipeline-trigger.ts` (aus SLC-076): `extracting` → `mapping` (auto-enqueue Stufe 3 `walkthrough_map_subtopics`-Job).
- Failure-Handling: try/catch + JSON-Parse-Fail → setStatus `failed` + error_log mit category='walkthrough_pipeline_failure', stage='extract_steps'.

### D — Vitest-Test mit ≥5 Test-Walkthroughs

Pfad: `src/workers/ai/__tests__/walkthrough-extract-steps.test.ts` (neu).

- 5 Test-Walkthrough-Transkripte (Fixtures unter `__tests__/fixtures/walkthrough-extracts/`).
- Pro Fixture: erwartete Schritt-Anzahl + erwartete Action-Substring-Matches.
- Test ruft Worker mit Bedrock-Mock (deterministischer Output) ODER real Bedrock (langsamer, Live-Run-Variante).
- Assertion: walkthrough_step-Rows pro Session in erwarteter Anzahl, step_number sequenziell 1..N.

## Micro-Tasks

### MT-1: Migration 085 Apply
- Goal: `walkthrough_step` Tabelle + Indizes + RLS live.
- Files: `sql/migrations/085_v5opt2_walkthrough_step.sql` (neu).
- Expected behavior: Tabelle existiert, RLS aktiv, 3 Policies registriert (oder 2 da kein INSERT-Policy), Trigger aktiv.
- Verification: Hetzner-Apply via base64-Pattern. `\d walkthrough_step` zeigt 18 Columns + 2 Indizes + 1 Trigger. `SELECT polname FROM pg_policy WHERE polrelid='walkthrough_step'::regclass` zeigt 2 Policies. Pre-Apply-Backup-CSV erzeugt.
- Dependencies: SLC-076 MT-1 (Migration 087 zuerst, weil knowledge_unit.source='walkthrough_transcript_redacted' Voraussetzung)

### MT-2: Bedrock-Prompt `step_extract.ts` + Zod-Schema
- Goal: Prompt + Output-Schema definiert.
- Files: `src/lib/ai/prompts/walkthrough/step_extract.ts` (neu), `src/lib/ai/prompts/walkthrough/step_extract.schema.ts` (neu).
- Expected behavior: Prompt-Modul exportiert systemPrompt + userPromptTemplate, Schema validiert JSON-Array.
- Verification: Zod-Schema-Test mit valid + invalid JSON.
- Dependencies: none

### MT-3: Worker `walkthrough-extract-steps-worker.ts`
- Goal: Worker laeuft, persistiert walkthrough_step-Rows, advances Status.
- Files: `src/workers/ai/walkthrough-extract-steps-worker.ts` (neu), `src/workers/index.ts` (modify — Job-Type-Registrierung).
- Expected behavior: Job laeuft, N walkthrough_step-Rows entstehen, status='mapping', ai_jobs-Eintrag fuer Stufe 3.
- Verification: Vitest-Mock + Live-Smoke gegen Coolify-Worker.
- Dependencies: MT-1, MT-2

### MT-4: Vitest-Suite ≥5 Test-Walkthroughs
- Goal: 5 Fixtures mit erwarteter Schritt-Anzahl + Action-Match-Patterns.
- Files: `src/workers/ai/__tests__/walkthrough-extract-steps.test.ts` (neu), `src/workers/ai/__tests__/fixtures/walkthrough-extracts/*.ts` (neu, 5 Fixtures).
- Expected behavior: Tests verifizieren Worker-Output-Konsistenz.
- Verification: `npm run test -- --run walkthrough-extract` PASS.
- Dependencies: MT-3

### MT-5: Edge-Case N=0 Walkthrough
- Goal: Pipeline-Resilienz bei leerem Schritt-Output.
- Files: bestehender Worker (Logik-Anpassung), Test-Fixture mit "unstrukturiertem" Walkthrough-Transkript.
- Expected behavior: walkthrough_step bleibt leer, status='mapping' wird gesetzt, Stufe 3 enqueued (Mapping-Worker handelt N=0 in SLC-078).
- Verification: Vitest mit N=0-Fixture, status-Verlauf-Assertion.
- Dependencies: MT-3, MT-4

## Out of Scope

- Auto-Mapping (Stufe 3) → SLC-078.
- Berater-Edit-UI fuer walkthrough_step → SLC-079.
- KU-Bruecke (walkthrough_step → knowledge_unit source='walkthrough') → V5.1 FEAT-038 (DEC-090).

## Risks / Mitigations

- **R1 — JSON-Parse-Fehler bei Bedrock-Output**: Zod-Schema-Validation faengt strukturelle Drift. Bei Parse-Fail Worker setzt `failed` + behaelt Bedrock-Raw-Output in error_log fuer Debug.
- **R2 — Schritt-Granularitaet zu fein/grob**: Berater korrigiert in SLC-079 via Edit + Soft-Delete. Erste Iteration mit ≥5 Test-Walkthroughs validiert ob Granularitaet in der Ziel-Range (3-15 Schritte typisch).
- **R3 — UNIQUE-Conflict bei step_number**: Bei Re-Run desselben Jobs (idempotency-bypass durch ai_jobs-Re-Queue) → DELETE existing walkthrough_step fuer ws.id zuerst, dann Bulk-INSERT. Worker-Pflicht.

## Verification

- Migration 085 live appliziert mit Pre-Apply-Backup.
- `npm run lint` 0/0.
- `npm run build` ohne Fehler.
- `npm run test -- --run walkthrough-extract` PASS auf 5+1 Fixtures.
- Live-Smoke: 1 echter Walkthrough durchlaeuft redacting → extracting → mapping (status-Verlauf + walkthrough_step-Rows in DB belegbar).

## Pflicht-Gates

- Migration 085 via `sql-migration-hetzner.md`-Pattern.
- Bedrock-Region `eu-central-1` (DSGVO-Pflicht).
- ≥5 Vitest-Fixtures mit erwarteter Schritt-Anzahl.
- N=0 Edge-Case getestet.

## Status

planned

## Created

2026-05-06
