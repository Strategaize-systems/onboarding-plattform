# SLC-006 — Block-Submit + Checkpoint

- Feature: FEAT-003 (Teil 3/3)
- Status: planned
- Priority: High
- Created: 2026-04-14
- Delivery Mode: SaaS (TDD mandatory)
- Worktree: ja

## Goal
`tenant_admin` kann einen Block submitten. Submit erzeugt einen versionierten `block_checkpoint` (Typ `questionnaire_submit`) und enqueued einen `ai_jobs`-Eintrag fuer die Verdichtung. Block-Status wechselt auf `submitted`.

## In Scope
- Server Action `submitBlock(sessionId, blockKey)`
- RPC `rpc_create_block_checkpoint(p_session_id, p_block_key, p_checkpoint_type, p_content)` (Postgres-Funktion, SECURITY DEFINER mit RLS-Check)
- RPC `rpc_enqueue_ai_job(p_job_type, p_payload)` (voraussichtlich bereits aus Blueprint-Erbe oder Teil SLC-008)
- `content_hash` SHA-256 Berechnung in der RPC
- UI: Block-Seite bekommt Submit-Button; nach Submit Redirect auf Block-Liste; Block zeigt Status `submitted`
- Idempotenz-Schutz: doppelter Submit in < 2s → gleicher Checkpoint (oder klarer Fehler)

## Out of Scope
- Worker-Abarbeitung der Jobs (SLC-008)
- Exception-Text im Submit (SLC-007 liefert `content.exception`)
- Meeting-Final-Checkpoint (SLC-010)

## Acceptance
- Nach Submit: 1 neuer Row in `block_checkpoint` (Typ `questionnaire_submit`) + 1 neuer Row in `ai_jobs` (Status `pending`)
- `content_hash` ist SHA-256 des kanonisierten `content`-JSON
- Block-Status im UI = `submitted`
- 2-Tenant-RLS-Check: User Tenant B kann nicht in Tenant-A-Session submitten

## Dependencies
- SLC-001..005
- SLC-008 liefert Worker — hier bleibt Jobs `pending`, wird erst in SLC-008 abgearbeitet
- `ai_jobs`-Tabelle muss existieren — pruefen: Blueprint-Bestand oder neu in SLC-008 MT-1. **Rule-4-Entscheidung**: Falls `ai_jobs` noch nicht existiert, SLC-008 MT-1 vorziehen oder hier Migration 028a ergaenzen.

## Risks
- `ai_jobs`-Tabelle-Owner-Frage (siehe Dependencies)
- Content-Hashing: unterschiedliche JSON-Key-Reihenfolge → unterschiedliche Hashes. **Loesung**: Kanonisieren vor Hashing (sortierte Keys).

## Micro-Tasks

### MT-1: Klaerung ai_jobs-Tabelle
- Goal: Pruefen, ob `ai_jobs` aus Blueprint schon existiert. Wenn nicht: als eigene Migration 028 anlegen (analog OS-033). Wenn ja: nur `job_type`-Wert `knowledge_unit_condensation` dokumentieren.
- Files: ggf. `sql/migrations/028_ai_jobs_baseline.sql`
- Expected behavior: Am Ende existiert `ai_jobs` mit Spalten `id`, `tenant_id`, `job_type`, `payload jsonb`, `status`, `claimed_at`, `completed_at`, `error`, `created_at`.
- Verification: `\d ai_jobs` auf Prod.
- Dependencies: SLC-001

### MT-2: Migration 029 — RPC create_block_checkpoint
- Goal: Postgres-Funktion, die Checkpoint + Hash atomar schreibt.
- Files: `sql/migrations/029_rpc_create_block_checkpoint.sql`
- Expected behavior:
  ```sql
  CREATE OR REPLACE FUNCTION rpc_create_block_checkpoint(
    p_session_id uuid, p_block_key text, p_checkpoint_type text, p_content jsonb
  ) RETURNS uuid SECURITY DEFINER ...
  ```
  Berechnet SHA-256 auf `jsonb_strip_nulls(p_content)::text` (oder kanonisiert) und returniert `checkpoint_id`.
- Verification: `SELECT rpc_create_block_checkpoint(...)` liefert uuid; Row vorhanden.
- Dependencies: SLC-001, MT-1

### MT-3: Migration 030 — RPC enqueue_ai_job (falls noetig)
- Goal: Falls nicht Blueprint-Bestand, RPC fuer typed Enqueue.
- Files: `sql/migrations/030_rpc_enqueue_ai_job.sql` (optional)
- Expected behavior: `rpc_enqueue_ai_job(p_job_type, p_payload)` → uuid.
- Verification: Row in `ai_jobs` mit Status `pending`.
- Dependencies: MT-1

### MT-4: Server Action submitBlock
- Goal: Atomarer Flow Checkpoint + Enqueue.
- Files:
  - `src/app/(app)/capture/[sessionId]/block/[blockKey]/submit-action.ts`
  - `src/app/(app)/capture/[sessionId]/block/[blockKey]/submit-action.test.ts`
- Expected behavior: Sammelt aktuelle Antworten + (SLC-007) Exception + Chat-Kontext, ruft `rpc_create_block_checkpoint`, dann `rpc_enqueue_ai_job` mit `{ block_checkpoint_id }` Payload. Return: Erfolg.
- Verification: Test + Integrationstest.
- Dependencies: MT-2, MT-3

### MT-5: UI Submit-Button + Status-Refresh
- Goal: Button in Questionnaire-Form, post-submit Redirect + Refresh.
- Files: `src/app/(app)/capture/[sessionId]/block/[blockKey]/QuestionnaireForm.tsx` (erweitern)
- Expected behavior: Bei Klick: Confirm-Dialog ("Block wird versiegelt, Aenderungen ab jetzt erzeugen neuen Checkpoint"), dann Action. Nach Erfolg: Redirect auf Block-Liste, revalidate.
- Verification: Manuell.
- Dependencies: MT-4

### MT-6: Idempotenz-Test
- Goal: Doppelter Submit innerhalb 2s erzeugt nicht 2 Checkpoints.
- Files: `src/app/(app)/capture/[sessionId]/block/[blockKey]/__tests__/submit-idempotency.test.ts`
- Expected behavior: Zweiter Submit wird via `content_hash`-Dedup geblockt (RPC prueft letzten Checkpoint, returned existierende ID bei gleichem Hash in < 2s).
- Verification: Test gruen.
- Dependencies: MT-2, MT-4

## Verification Summary
- Build + Tests gruen
- Prod-DB: Block-Submit erzeugt genau 1 Checkpoint + 1 ai_job
- UI: Status wechselt auf `submitted`
- Doppel-Submit greift Idempotenz
