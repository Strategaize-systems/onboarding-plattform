-- Migration 095 — V6.3 SLC-105 Hotfix ISSUE-076 ai_cost_ledger light_pipeline_block role
--
-- Problem (gefunden in /qa SLC-105 Live-Smoke 2026-05-17, RPT-284):
--   ai_cost_ledger_role_check verbietet role='light_pipeline_block'. Die
--   Light-Pipeline (light-pipeline.ts:342) schreibt diesen role-Wert pro
--   Block-Bedrock-Call. INSERT failt mit CHECK-Constraint-Violation, der
--   Fehler wird via captureException geschluckt — Cost wird NIE persistiert.
--   AC-14 ("Bedrock-Kosten pro Run werden in ai_cost_ledger protokolliert")
--   ist damit silent broken.
--
-- Fix: CHECK-Constraint um 'light_pipeline_block' erweitern.
--
-- Apply auf Hetzner per sql-migration-hetzner.md Pattern:
--   1. base64 -w 0 sql/migrations/095_v63_cost_ledger_light_pipeline_role.sql
--   2. ssh root@159.69.207.29 "echo 'BASE64' | base64 -d > /tmp/m095.sql && docker exec -i supabase-db-bwkg80w04wgccos48gcws8cs-<suffix> psql -U postgres -d postgres < /tmp/m095.sql"
--   3. Verify: SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ai_cost_ledger_role_check';
--
-- Verifikations-Re-Smoke: nochmal eine Diagnose-Session laufen lassen und
-- SELECT COUNT(*) FROM ai_cost_ledger WHERE role='light_pipeline_block'
-- sollte 6 zurueckgeben.

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
      'light_pipeline_block'
    ])
  );

COMMIT;
