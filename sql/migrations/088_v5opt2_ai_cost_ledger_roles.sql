-- Migration 088 — V5 Option 2 ai_cost_ledger.role CHECK-Erweiterung
-- SLC-076 /qa Hotfix (RPT-183) — entdeckte beim Live-Smoke 4 PII-Redactions ohne Cost-Eintrag.
--
-- Zweck:
--   Bestehende ai_cost_ledger.role CHECK enthaelt nur V1-V4 Roles. Drei neue V5-Option-2-Pipeline-
--   Roles muessen ergaenzt werden, damit cost-tracking fuer die 3 Bedrock-Pipeline-Stufen funktioniert.
--   Stage 1 (PII) wird hier deployt; Stage 2 (extractor) + Stage 3 (mapper) sind Vorbereitungs-Anker
--   fuer SLC-077 + SLC-078 — Add-Forward, kein Drift bei spaeterem Apply.
--
--   Bestehende 11 Roles bleiben unveraendert:
--     analyst, challenger, chat, memory, embedding, orchestrator,
--     sop_generator, diagnosis_generator, evidence_mapper,
--     dialogue_extractor, bridge_engine
--   NEU 3 V5-Option-2-Pipeline-Roles:
--     walkthrough_pii_redactor (SLC-076 Stage 1, live)
--     walkthrough_step_extractor (SLC-077 Stage 2, vorbereitet)
--     walkthrough_subtopic_mapper (SLC-078 Stage 3, vorbereitet)
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.
--
-- Pre-Apply-Backup (per sql-migration-hetzner.md):
--   psql -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ai_cost_ledger_role_check'"
--
-- Apply-Pattern:
--   base64 -w 0 sql/migrations/088_v5opt2_ai_cost_ledger_roles.sql
--   echo '<BASE64>' | base64 -d > /tmp/088.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/088.sql
--
-- Verifikation:
--   docker exec <db-container> psql -U postgres -d postgres -c \
--     "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ai_cost_ledger_role_check'"
--   -> 14 Roles sichtbar
--
-- Rollback:
--   ALTER TABLE ai_cost_ledger DROP CONSTRAINT ai_cost_ledger_role_check;
--   ALTER TABLE ai_cost_ledger ADD CONSTRAINT ai_cost_ledger_role_check
--     CHECK (role IS NULL OR role = ANY (ARRAY[
--       'analyst','challenger','chat','memory','embedding','orchestrator',
--       'sop_generator','diagnosis_generator','evidence_mapper',
--       'dialogue_extractor','bridge_engine'
--     ]));
--   Voraussetzung: keine Rows mit role IN ('walkthrough_pii_redactor', 'walkthrough_step_extractor',
--   'walkthrough_subtopic_mapper').

DO $mig088$ BEGIN

ALTER TABLE public.ai_cost_ledger
  DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check;

ALTER TABLE public.ai_cost_ledger
  ADD CONSTRAINT ai_cost_ledger_role_check CHECK (role IS NULL OR role = ANY (ARRAY[
    -- Bestehend (unveraendert)
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
    -- V5 Option 2 NEU
    'walkthrough_pii_redactor',
    'walkthrough_step_extractor',
    'walkthrough_subtopic_mapper'
  ]));

RAISE NOTICE 'MIG-088: ai_cost_ledger.role CHECK erweitert auf 14 Werte (+ walkthrough_pii_redactor, walkthrough_step_extractor, walkthrough_subtopic_mapper)';

END $mig088$;
