-- Migration 053: Fix ai_cost_ledger role CHECK constraint
-- SLC-023 QA Fix — add sop_generator + diagnosis_generator to allowed roles
-- Without this fix, cost logging silently fails for SOP and Diagnosis jobs

ALTER TABLE ai_cost_ledger DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check;

ALTER TABLE ai_cost_ledger ADD CONSTRAINT ai_cost_ledger_role_check
  CHECK (role IN (
    'analyst',
    'challenger',
    'chat',
    'memory',
    'embedding',
    'orchestrator',
    'sop_generator',
    'diagnosis_generator'
  ));
