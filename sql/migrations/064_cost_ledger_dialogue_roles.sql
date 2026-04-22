-- Migration 064: Extend ai_cost_ledger role CHECK for dialogue roles
-- SLC-031 QA Fix — add dialogue_extractor to allowed roles
-- Without this fix, cost logging INSERT fails mid-extraction,
-- leaving dialogue_session in 'processing' state with orphan KUs.
-- NOTE: Explicit public. schema prefix required (IMP-103)

ALTER TABLE public.ai_cost_ledger DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check;

ALTER TABLE public.ai_cost_ledger ADD CONSTRAINT ai_cost_ledger_role_check
  CHECK (role IN (
    'analyst',
    'challenger',
    'chat',
    'memory',
    'embedding',
    'orchestrator',
    'sop_generator',
    'diagnosis_generator',
    'evidence_mapper',
    'dialogue_extractor'
  ));
