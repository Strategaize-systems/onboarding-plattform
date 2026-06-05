-- Migration 111 — V9 SLC-167 Pattern-Extraktion Migration-Luecke (POST-LAUNCH HOTFIX 2026-06-05)
--
-- Slice: SLC-167 — V9 Pattern-Extraktion (Sonnet) + Curation-UI + Cost-Cap (FEAT-073)
-- MIG-Doc-ID: MIG-056
-- ISSUE: ISSUE-092 entdeckt in /post-launch V9 RPT-422 2026-06-05 ~16:50 UTC
--
-- Zweck:
--   SLC-167 hat zwei neue CHECK-Werte eingefuehrt (per L-V9-7 / IMP-1055 Asymmetrie):
--     - ai_jobs.job_type = 'email_bulk_pattern_extract'      (ohne -tion-Suffix)
--     - ai_cost_ledger.role = 'email_bulk_pattern_extraction' (mit -tion-Suffix)
--   Migration 107 fuegte 'email_bulk_pre_filter' hinzu.
--   Migration 108 fuegte 'email_bulk_pii_redact' + 3 job_types (Pre-existing-Bug-Fix) hinzu.
--   Migration 109 ist View-Only (vw_bulk_email_cost_monthly).
--   Migration 110 ist knowledge_unit.source + block_checkpoint.checkpoint_type.
--
--   **NIEMAND fuegte 'email_bulk_pattern_extract' + 'email_bulk_pattern_extraction' hinzu.**
--
--   Impact pre-Migration-111:
--     (a) INSERT INTO ai_jobs (job_type='email_bulk_pattern_extract') in startPatternExtraction
--         Server-Action (SLC-167 MT-4) schlaegt mit CHECK-VIOLATION 'ai_jobs_job_type_check' fehl
--         → Pattern-Extraction-Pipeline ist BLOCKED.
--     (b) INSERT INTO ai_cost_ledger (role='email_bulk_pattern_extraction') in
--         handle-pattern-extraction-job.ts L532-543 schlaegt mit CHECK-VIOLATION fehl
--         → non-fatal try/catch in Worker, Pipeline laeuft technisch durch ABER
--           Cost-Audit-Trail fuer Sonnet ist broken + vw_bulk_email_cost_monthly
--           unterzaehlt Sonnet-Daten.
--
--   Discovery durch /post-launch V9 RPT-422 ai_cost_ledger Live-Check vs Code-Pfad
--   handle-pattern-extraction-job.ts:77 AI_COST_LEDGER_ROLE Constant. Cross-Verifikation
--   gegen Migration 106-110 zeigte beide Werte fehlen.
--
-- Pre-Verify (pre-Apply):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname IN ('ai_cost_ledger_role_check','ai_jobs_job_type_check');
--   → ai_cost_ledger: 18 Werte, fehlt 'email_bulk_pattern_extraction'
--   → ai_jobs: 18 Werte, fehlt 'email_bulk_pattern_extract'
--
-- Pre-Apply-Check:
--   SELECT COUNT(*) FROM ai_cost_ledger WHERE role='email_bulk_pattern_extraction';
--   → erwartet 0 (kein Pattern-Extraction-Run lief bisher in Production).
--   SELECT COUNT(*) FROM ai_jobs WHERE job_type='email_bulk_pattern_extract';
--   → erwartet 0.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT — wiederholte Apply-Versuche
-- schlagen nicht fehl, alte Werte-Liste wird durch neue ersetzt.
--
-- Apply-Procedure (per .claude/rules/sql-migration-hetzner.md):
--   1. base64 -w 0 sql/migrations/111_v9_pattern_extraction_role_and_job_type.sql
--   2. ssh root@<server> "echo 'BASE64' | base64 -d > /tmp/m111.sql"
--   3. ssh root@<server> "docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m111.sql"
--   4. Verify:
--        SELECT pg_get_constraintdef(oid) FROM pg_constraint
--        WHERE conname IN ('ai_cost_ledger_role_check','ai_jobs_job_type_check');
--        → ai_cost_ledger: 19 Werte (incl. 'email_bulk_pattern_extraction')
--        → ai_jobs: 19 Werte (incl. 'email_bulk_pattern_extract')

BEGIN;

-- ─── 1. ai_cost_ledger.role: + 'email_bulk_pattern_extraction' ────────────────
ALTER TABLE public.ai_cost_ledger
  DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check;

ALTER TABLE public.ai_cost_ledger
  ADD CONSTRAINT ai_cost_ledger_role_check CHECK (
    role IS NULL OR role = ANY (ARRAY[
      'analyst',
      'challenger',
      'chat',
      'memory',
      'embedding',
      'orchestrator',
      'sop_generator',
      'diagnosis_generator',
      'evidence_mapper',
      'dialogue_extractor',
      'bridge_engine',
      'walkthrough_pii_redactor',
      'walkthrough_step_extractor',
      'walkthrough_subtopic_mapper',
      'light_pipeline_block',
      'v8_1_augmentation',
      'email_bulk_pre_filter',
      'email_bulk_pii_redact',
      'email_bulk_pattern_extraction'
    ])
  );

-- ─── 2. ai_jobs.job_type: + 'email_bulk_pattern_extract' ──────────────────────
ALTER TABLE public.ai_jobs
  DROP CONSTRAINT IF EXISTS ai_jobs_job_type_check;

ALTER TABLE public.ai_jobs
  ADD CONSTRAINT ai_jobs_job_type_check CHECK (
    job_type IN (
      'bridge_generation',
      'diagnosis_generation',
      'dialogue_extraction',
      'dialogue_transcription',
      'evidence_extraction',
      'handbook_snapshot_generation',
      'knowledge_unit_condensation',
      'recondense_with_gaps',
      'sop_generation',
      'walkthrough_extract_steps',
      'walkthrough_map_subtopics',
      'walkthrough_redact_pii',
      'walkthrough_stub_processing',
      'walkthrough_transcribe',
      'lead_push_retry',
      'email_bulk_parse',
      'email_bulk_pre_filter',
      'email_bulk_thread_redact',
      'email_bulk_pattern_extract'
    )
  );

COMMIT;

-- Post-Apply RAISE NOTICE optional — die SELECT-Verify ist Quell-Truth.
