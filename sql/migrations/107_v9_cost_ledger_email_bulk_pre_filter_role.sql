-- Migration 107 — V9 SLC-166 MT-2 ai_cost_ledger role 'email_bulk_pre_filter'
--
-- ARCHITECTURE.md V9-Section DEC-181: Haiku-Klassifikations-Worker schreibt pro
-- Bedrock-Call einen ai_cost_ledger-Eintrag mit role='email_bulk_pre_filter'
-- (Pattern-Parallel zu DEC-167/v8_1_augmentation, Migration 105).
--
-- Ohne diese Migration: INSERT INTO ai_cost_ledger (role) VALUES ('email_bulk_pre_filter')
-- schlaegt mit CHECK-Constraint-Violation fehl. Pre-Filter-Worker (SLC-166 MT-2)
-- wuerde Cost-Audit silent verlieren.
--
-- PII-Redact-Role 'email_bulk_pii_redact' wird in einer separaten Migration
-- mit SLC-166 MT-6 (Thread-Redact-Worker) eingefuehrt — kein speculative add.
--
-- Apply auf Hetzner per sql-migration-hetzner.md Pattern:
--   1. base64 -w 0 sql/migrations/107_v9_cost_ledger_email_bulk_pre_filter_role.sql
--   2. ssh root@<server> "echo 'BASE64' | base64 -d > /tmp/m107.sql"
--   3. ssh root@<server> "docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m107.sql"
--   4. Verify: SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ai_cost_ledger_role_check';
--
-- Verifikations-Re-Smoke: nach SLC-166 MT-2 Worker-Pickup einmal triggern und
-- SELECT COUNT(*) FROM ai_cost_ledger WHERE role='email_bulk_pre_filter' > 0.

BEGIN;

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
      'email_bulk_pre_filter'
    ])
  );

COMMIT;
