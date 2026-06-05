-- Migration 110 — V9 SLC-168 knowledge_unit.source + block_checkpoint.checkpoint_type CHECK Extensions
--
-- Slice: SLC-168 — V9 Handbuch-Integration + Audit + Source-Attribution-View (FEAT-074)
-- DEC: DEC-193 (Path-A-Lite — knowledge_unit-INSERT mit Source-Attribution im body-Markdown)
-- MIG-Doc-ID: MIG-055
--
-- Zweck:
--   Additive CHECK-Erweiterungen, damit SLC-168 importToHandbook() folgendes persistieren kann:
--     1. knowledge_unit-Rows mit `source = 'email_bulk'` (neue 11. Quelle, V9 Bulk-Email-Pattern)
--     2. block_checkpoint-Rows mit `checkpoint_type = 'email_bulk_import'` (Pseudo-Checkpoint
--        pro Bulk-Run, erfuellt die NOT NULL FK-Pflicht von knowledge_unit.block_checkpoint_id
--        ohne Schema-Bruch, fuenfter Typ neben den 4 bestehenden)
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT — wiederholte Apply-Versuche schlagen
-- nicht fehl. Pattern aus MIG-087 (Migration 087) + MIG-034 (Migration 091).
--
-- Pre-Apply-Backup (Pflicht per sql-migration-hetzner.md):
--   docker exec <db-container> psql -U postgres -d postgres -c \
--     "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--       WHERE conname IN ('knowledge_unit_source_check','block_checkpoint_checkpoint_type_check')
--       ORDER BY conname;" > /tmp/110_pre_backup.csv
--
-- Apply-Pattern (per .claude/rules/sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/110_v9_knowledge_unit_email_bulk_check.sql        (lokal)
--   echo '<BASE64>' | base64 -d > /tmp/110.sql                                    (server)
--   docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) \
--     psql -U postgres -d postgres < /tmp/110.sql
--
-- Verifikation post-LIVE:
--   docker exec <db-container> psql -U postgres -d postgres -c \
--     "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--       WHERE conname IN ('knowledge_unit_source_check','block_checkpoint_checkpoint_type_check')
--       ORDER BY conname;"
--   -> knowledge_unit_source_check: 11 Werte (+ email_bulk)
--   -> block_checkpoint_checkpoint_type_check: 5 Werte (+ email_bulk_import)
--
-- Rollback:
--   ALTER TABLE knowledge_unit DROP CONSTRAINT knowledge_unit_source_check;
--   ALTER TABLE knowledge_unit ADD CONSTRAINT knowledge_unit_source_check
--     CHECK (source IN ('questionnaire','exception','ai_draft','meeting_final','manual',
--                       'evidence','dialogue','employee_questionnaire',
--                       'walkthrough_transcript','walkthrough_transcript_redacted'));
--   ALTER TABLE block_checkpoint DROP CONSTRAINT block_checkpoint_checkpoint_type_check;
--   ALTER TABLE block_checkpoint ADD CONSTRAINT block_checkpoint_checkpoint_type_check
--     CHECK (checkpoint_type IN ('questionnaire_submit','meeting_final',
--                                'backspelling_recondense','auto_final'));
--   (Pre-Apply-Backup-CSV bewahrt die exakte alte Definition.)

DO $mig110$ BEGIN

-- =============================================================================
-- 1. knowledge_unit.source CHECK-Erweiterung um 'email_bulk' (DEC-193)
-- =============================================================================
-- Kanonische Liste der erlaubten Werte inkl. Bestandswerte aus MIG-087 (Migration 087)
-- + neuer V9-Wert 'email_bulk' fuer Bulk-Email-Import-Patterns.

ALTER TABLE public.knowledge_unit
  DROP CONSTRAINT IF EXISTS knowledge_unit_source_check;

ALTER TABLE public.knowledge_unit
  ADD CONSTRAINT knowledge_unit_source_check CHECK (source IN (
    -- V1-Foundation (Migration 021)
    'questionnaire',
    'exception',
    'ai_draft',
    'meeting_final',
    'manual',
    -- V3 Dialogue (Migration 060)
    'evidence',
    'dialogue',
    -- V4 Capture-Mode (Migration 067)
    'employee_questionnaire',
    -- V5 Walkthrough (Migration 082)
    'walkthrough_transcript',
    -- V5 Option 2 (Migration 087)
    'walkthrough_transcript_redacted',
    -- V9 SLC-168 NEU (DEC-193 — Path-A-Lite, Source-Attribution im body)
    'email_bulk'
  ));

RAISE NOTICE 'MIG-055 (1/2): knowledge_unit.source CHECK erweitert auf 11 Werte (+ email_bulk)';

-- =============================================================================
-- 2. block_checkpoint.checkpoint_type CHECK-Erweiterung um 'email_bulk_import' (DEC-193)
-- =============================================================================
-- Kanonische Liste inkl. Bestandswerte aus MIG-034 (Migration 091) + neuer V9-Wert
-- 'email_bulk_import' fuer den Pseudo-block_checkpoint pro Bulk-Run.
-- Der Pseudo-Checkpoint erfuellt die NOT NULL FK von knowledge_unit.block_checkpoint_id
-- ohne Schema-Bruch und ohne Loosen der bestehenden Datenintegritaets-Garantien.

ALTER TABLE public.block_checkpoint
  DROP CONSTRAINT IF EXISTS block_checkpoint_checkpoint_type_check;

ALTER TABLE public.block_checkpoint
  ADD CONSTRAINT block_checkpoint_checkpoint_type_check CHECK (checkpoint_type IN (
    -- V1-Foundation (Migration 021)
    'questionnaire_submit',
    'meeting_final',
    -- V3 Orchestrator (Migration 040)
    'backspelling_recondense',
    -- V6 Partner-Branding (Migration 091)
    'auto_final',
    -- V9 SLC-168 NEU (DEC-193 — Pseudo-Checkpoint pro Bulk-Run)
    'email_bulk_import'
  ));

RAISE NOTICE 'MIG-055 (2/2): block_checkpoint.checkpoint_type CHECK erweitert auf 5 Werte (+ email_bulk_import)';

END $mig110$;
