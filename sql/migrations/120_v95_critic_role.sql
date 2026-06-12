-- ============================================================================
-- 120_v95_critic_role.sql — V9.5 SLC-V9.5-C: ai_cost_ledger.role + 'email_bulk_critic'
-- MIG-112 (docs/MIGRATIONS.md)
--
-- Slice: slices/SLC-V9.5-C-bounded-critic-gate.md (R-C-3 / AC-C-3)
-- DEC: DEC-216 (1 Synthese + 1 Critic, bounded)
--
-- Der bounded Critic-Pass (zweite LLM-Phase im email_bulk_synthesis-Worker)
-- schreibt seinen Cost-Audit-Eintrag mit role 'email_bulk_critic' in
-- ai_cost_ledger. Ohne CHECK-Erweiterung schlaegt der INSERT mit
-- CHECK-Violation fehl (non-fatal gefangen, aber Audit-Luecke).
--
-- KEIN ai_jobs.job_type-Add: der Critic laeuft im SELBEN Synthese-Job
-- (job_id = Synthese-Job-ID), es entsteht kein neuer Job-Typ.
--
-- Liste = LIVE-Stand 2026-06-12 (pg_get_constraintdef ai_cost_ledger_role_check,
-- 20 Werte — identisch mit 119_v95_synthesis_stage.sql) + 'email_bulk_critic'
-- (Rebuild vom Live-Stand per IMP-1228, live-verifiziert vor diesem File).
--
-- Verifikation nach Apply:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conname = 'ai_cost_ledger_role_check';
--   -- erwartet: 21 Werte inkl. 'email_bulk_critic'
-- ============================================================================

BEGIN;

ALTER TABLE public.ai_cost_ledger
  DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check;

ALTER TABLE public.ai_cost_ledger
  ADD CONSTRAINT ai_cost_ledger_role_check
  CHECK (role IS NULL OR role = ANY (ARRAY[
    'analyst', 'challenger', 'chat', 'memory', 'embedding', 'orchestrator',
    'sop_generator', 'diagnosis_generator', 'evidence_mapper',
    'dialogue_extractor', 'bridge_engine', 'walkthrough_pii_redactor',
    'walkthrough_step_extractor', 'walkthrough_subtopic_mapper',
    'light_pipeline_block', 'v8_1_augmentation', 'email_bulk_pre_filter',
    'email_bulk_pii_redact', 'email_bulk_pattern_extraction',
    'email_bulk_synthesis',
    'email_bulk_critic'        -- V9.5 SLC-V9.5-C (neu)
  ]));

COMMIT;
