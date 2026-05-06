-- Migration 082 — V5 Walkthrough-Mode / MIG-031 Teil 1 — CHECK-Constraint-Erweiterungen
-- SLC-071 MT-1 — V5 Foundation (FEAT-034, DEC-074..078)
--
-- Zweck:
--   Erweitert capture_session.capture_mode um 'walkthrough' (V4 hatte nur 'walkthrough_stub'-Spike).
--   Erweitert knowledge_unit.source um 'walkthrough_transcript' (Whisper-Output-Quelle).
--
-- Pattern:
--   DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT — idempotent, additive Erweiterung.
--   Bestehende Rows bleiben gueltig (Default-Constraint verbietet keine bisherigen Werte).
--
-- Pre-Apply-Backup-Empfehlung:
--   docker exec <db-container> pg_dump -U postgres --schema-only -d postgres \
--     > /opt/onboarding-plattform-backups/pre-mig-031_<timestamp>.sql
--
-- Apply-Pattern (per sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/082_v5_walkthrough_capture_mode.sql            (lokal)
--   echo '<BASE64>' | base64 -d > /tmp/082_v5.sql                            (server)
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/082_v5.sql
--
-- Verifikation:
--   docker exec <db-container> psql -U postgres -d postgres \
--     -c "\d+ public.capture_session" | grep capture_mode_check
--   docker exec <db-container> psql -U postgres -d postgres \
--     -c "\d+ public.knowledge_unit" | grep source_check

DO $mig031_part1$ BEGIN

-- =============================================
-- 1. capture_session.capture_mode CHECK-Erweiterung
-- =============================================
ALTER TABLE public.capture_session
  DROP CONSTRAINT IF EXISTS capture_session_capture_mode_check;

ALTER TABLE public.capture_session
  ADD CONSTRAINT capture_session_capture_mode_check
  CHECK (capture_mode IS NULL OR capture_mode IN (
    'questionnaire',
    'evidence',
    'dialogue',
    'employee_questionnaire',
    'walkthrough_stub',
    'walkthrough'
  ));

RAISE NOTICE 'MIG-031/082: capture_session.capture_mode CHECK extended with walkthrough';

-- =============================================
-- 2. knowledge_unit.source CHECK-Erweiterung
-- =============================================
ALTER TABLE public.knowledge_unit
  DROP CONSTRAINT IF EXISTS knowledge_unit_source_check;

ALTER TABLE public.knowledge_unit
  ADD CONSTRAINT knowledge_unit_source_check
  CHECK (source IN (
    'questionnaire',
    'exception',
    'ai_draft',
    'meeting_final',
    'manual',
    'evidence',
    'dialogue',
    'employee_questionnaire',
    'walkthrough_transcript'
  ));

RAISE NOTICE 'MIG-031/082: knowledge_unit.source CHECK extended with walkthrough_transcript';

END $mig031_part1$;
