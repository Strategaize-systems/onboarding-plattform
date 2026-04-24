-- Migration 073b: ai_cost_ledger role CHECK um 'bridge_engine' erweitern
-- SLC-035 MT-1 — Bridge-Engine Backend (FEAT-023)
--
-- Bridge-Worker logged pro Bedrock-Call einen Eintrag mit:
--   role='bridge_engine', feature='bridge_template_refine' | 'bridge_free_form'
--
-- feature hat keinen CHECK (seit Migration 040 frei waehlbar). role hingegen
-- hat einen CHECK (zuletzt Migration 064) — ohne diese Erweiterung wuerde
-- jeder Bedrock-Call-Log-INSERT waehrend der Bridge-Generierung fehlschlagen.

BEGIN;

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
    'dialogue_extractor',
    'bridge_engine'
  ));

COMMIT;
