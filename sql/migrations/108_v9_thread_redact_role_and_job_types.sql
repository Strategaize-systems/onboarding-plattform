-- Migration 108 — V9 SLC-166 MT-6 ai_cost_ledger role 'email_bulk_pii_redact'
--                  + ai_jobs.job_type CHECK extension fuer 3 V9-Worker-Pfade
--
-- ARCHITECTURE.md V9-Section DEC-181 + Spec-Linie L177: Thread-Redact-Worker
-- schreibt pro V5-PII-Bedrock-Call einen ai_cost_ledger-Eintrag mit
-- role='email_bulk_pii_redact' (Pattern-Parallel zu role='email_bulk_pre_filter'
-- aus MIG-107).
--
-- ZUSATZ-DEFENSE — Pre-existing-Bug-Fix (MT-6 RPT-398 dokumentiert):
-- MIG-092 fuehrt ai_jobs.job_type CHECK mit 15 Werten ein. MIG-106 (SLC-165 MT-1
-- Schema) und MIG-107 (SLC-166 MT-2 cost-ledger role) erweitern das CHECK NICHT.
-- D.h. die in SLC-165 MT-2 enqueued `email_bulk_parse`, in SLC-166 MT-2
-- enqueued `email_bulk_pre_filter` UND in SLC-166 MT-3 enqueued
-- `email_bulk_thread_redact` waren bisher Live-CHECK-Violation. Code-Side
-- Tests umgehen das via Mock — Live wuerde der INSERT failen. MT-6 fixt
-- alle drei in einer Migration zusammen mit dem MT-6-Hauptzweck (role).
--
-- Ohne diese Migration:
--   (a) INSERT INTO ai_cost_ledger (role) VALUES ('email_bulk_pii_redact')
--       schlaegt mit CHECK-Constraint-Violation fehl. Thread-Redact-Worker
--       wuerde Cost-Audit silent verlieren ODER haerter — non-fatal Logger-
--       Fall faengt ihn (Pattern wie MT-2 Worker L427-438), aber Audit fehlt.
--   (b) INSERT INTO ai_jobs (job_type) VALUES ('email_bulk_thread_redact')
--       (in MT-3 filter-review approvePreFilterAndStartThreadRedact)
--       schlaegt mit ai_jobs_job_type_check Violation fehl → Approval-Button
--       crasht. Gleiches gilt fuer 'email_bulk_parse' (MT-1 actions.ts) und
--       'email_bulk_pre_filter' (Auto-enqueue nach Parse-Done in MT-2).
--
-- Apply auf Hetzner per .claude/rules/sql-migration-hetzner.md:
--   1. base64 -w 0 sql/migrations/108_v9_thread_redact_role_and_job_types.sql
--   2. ssh root@<server> "echo 'BASE64' | base64 -d > /tmp/m108.sql"
--   3. ssh root@<server> "docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m108.sql"
--   4. Verify:
--        SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ai_cost_ledger_role_check';
--        SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ai_jobs_job_type_check';
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.

BEGIN;

-- ─── 1. ai_cost_ledger.role: + 'email_bulk_pii_redact' ─────────────────────────
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
      'email_bulk_pii_redact'
    ])
  );

-- ─── 2. ai_jobs.job_type: + 'email_bulk_parse' + 'email_bulk_pre_filter'
--       + 'email_bulk_thread_redact' (Pre-existing-Bug-Fix aus SLC-165/166) ─
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
      'email_bulk_thread_redact'
    )
  );

COMMIT;
