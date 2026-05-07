-- Migration 087 — V5 Option 2 Stufe 1 PII-Redaction — CHECK-Erweiterungen
-- SLC-076 MT-1 (FEAT-037, DEC-081..091)
--
-- Zweck:
--   Additive CHECK-Erweiterungen, um die V5 Option 2 AI-Pipeline (PII-Redaction, Schritt-Extraktion,
--   Auto-Mapping) ueberhaupt persistierbar zu machen. Bestehende Werte bleiben gueltig.
--
--   1. walkthrough_session.status: 8 -> 11 Werte (+ 'redacting', 'extracting', 'mapping')
--   2. knowledge_unit.source:      9 -> 10 Werte (+ 'walkthrough_transcript_redacted')
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT — wiederholte Apply-Versuche schlagen nicht fehl.
--
-- Pre-Apply-Backup (Pflicht per sql-migration-hetzner.md):
--   psql -c "SELECT pg_get_constraintdef('walkthrough_session_status_check'::regclass)"
--   psql -c "SELECT pg_get_constraintdef('knowledge_unit_source_check'::regclass)"
--   -> Beide Outputs als CSV in /tmp/087_pre_backup.csv festhalten BEVOR diese Datei laeuft.
--
-- Apply-Pattern (per sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/087_v5opt2_status_and_source_extension.sql      (lokal)
--   echo '<BASE64>' | base64 -d > /tmp/087.sql                                  (server)
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/087.sql
--
-- Verifikation (regclass-Cast funktioniert NICHT fuer Constraint-Namen — nur fuer Tabellen/Views;
-- daher pg_constraint-Catalog-Lookup):
--   docker exec <db-container> psql -U postgres -d postgres -c \
--     "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--       WHERE conname IN ('walkthrough_session_status_check','knowledge_unit_source_check')
--       ORDER BY conname;"
--   -> walkthrough_session_status_check: 11 Werte
--   -> knowledge_unit_source_check:      10 Werte
--
-- Rollback:
--   ALTER TABLE walkthrough_session DROP CONSTRAINT walkthrough_session_status_check;
--   ALTER TABLE walkthrough_session ADD CONSTRAINT walkthrough_session_status_check
--     CHECK (status IN ('recording','uploading','uploaded','transcribing','pending_review',
--                       'approved','rejected','failed'));
--   ALTER TABLE knowledge_unit DROP CONSTRAINT knowledge_unit_source_check;
--   ALTER TABLE knowledge_unit ADD CONSTRAINT knowledge_unit_source_check
--     CHECK (source IN ('questionnaire','exception','ai_draft','meeting_final','manual',
--                       'evidence','dialogue','employee_questionnaire','walkthrough_transcript'));
--   (Pre-Apply-Backup-CSV bewahrt die exakte alte Definition.)

DO $mig087$ BEGIN

-- =============================================
-- 1. walkthrough_session.status — Status-Maschine erweitern
-- =============================================
ALTER TABLE public.walkthrough_session
  DROP CONSTRAINT IF EXISTS walkthrough_session_status_check;

ALTER TABLE public.walkthrough_session
  ADD CONSTRAINT walkthrough_session_status_check CHECK (status IN (
    -- V5-Foundation (Migration 083, unveraendert)
    'recording',
    'uploading',
    'uploaded',
    'transcribing',
    'pending_review',
    'approved',
    'rejected',
    'failed',
    -- V5 Option 2 NEU (Pipeline-Stufen)
    'redacting',
    'extracting',
    'mapping'
  ));

RAISE NOTICE 'MIG-087 (1/2): walkthrough_session.status check erweitert auf 11 Werte (+ redacting, extracting, mapping)';

-- =============================================
-- 2. knowledge_unit.source — Source erweitern um redacted-Variante
-- =============================================
ALTER TABLE public.knowledge_unit
  DROP CONSTRAINT IF EXISTS knowledge_unit_source_check;

ALTER TABLE public.knowledge_unit
  ADD CONSTRAINT knowledge_unit_source_check CHECK (source IN (
    -- Bestehend (unveraendert)
    'questionnaire',
    'exception',
    'ai_draft',
    'meeting_final',
    'manual',
    'evidence',
    'dialogue',
    'employee_questionnaire',
    'walkthrough_transcript',
    -- V5 Option 2 NEU (Pipeline-Stufe-1-Output, DEC-083)
    'walkthrough_transcript_redacted'
  ));

RAISE NOTICE 'MIG-087 (2/2): knowledge_unit.source check erweitert auf 10 Werte (+ walkthrough_transcript_redacted)';

END $mig087$;
