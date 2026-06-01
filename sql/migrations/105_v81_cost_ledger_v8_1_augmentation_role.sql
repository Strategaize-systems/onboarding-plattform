-- Migration 105 — V8.1 SLC-161 MT-5 ai_cost_ledger role 'v8_1_augmentation'
--
-- ARCHITECTURE.md V8.1 Line 7521: "ai_cost_ledger Tabelle (V6+, Constraint-Erweiterung
-- V6.3 Migration 095 vorhanden — V8.1-Eintraege passen rein)". Diese Migration ergaenzt
-- den CHECK-Constraint analog zu Migration 095 (light_pipeline_block) um den V8.1-Role.
--
-- Ohne diese Migration: INSERT INTO ai_cost_ledger (role) VALUES ('v8_1_augmentation')
-- schlaegt mit CHECK-Constraint-Violation fehl. Bedrock-Cost-Audit-Trail waere silent
-- broken (V6.3-Erfahrung per Migration 095 Header-Kommentar: "Fehler via captureException
-- geschluckt — Cost wird NIE persistiert").
--
-- Apply auf Hetzner per sql-migration-hetzner.md Pattern:
--   1. base64 -w 0 sql/migrations/105_v81_cost_ledger_v8_1_augmentation_role.sql
--   2. ssh root@159.69.207.29 "echo 'BASE64' | base64 -d > /tmp/m105.sql"
--   3. ssh root@159.69.207.29 "docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m105.sql"
--   4. Verify: SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ai_cost_ledger_role_check';
--
-- Verifikations-Re-Smoke: nach SLC-162 Outro-Render einmal triggern und
-- SELECT COUNT(*) FROM ai_cost_ledger WHERE role='v8_1_augmentation' sollte > 0 zurueckgeben.

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
      'v8_1_augmentation'
    ])
  );

COMMIT;
