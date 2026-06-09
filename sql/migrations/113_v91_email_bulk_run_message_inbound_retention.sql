-- Migration 113 — V9.1 SLC-V9.1-A MT-2 MIG-058 email_bulk_run + email_message
-- Inbound-Source + Daily-Roll-Over + Retention-Foundation
--
-- Zweck:
--   ALTER bestehender V9-Tabellen um Inbound-Webhook-Pipeline-Felder:
--     - email_bulk_run (5 neue Spalten):
--         inbound_source       — 'mbox_upload' | 'forward_bucket'
--         endpoint_id          — FK auf email_inbound_endpoint (NULL fuer V9-Rows)
--         daily_anchor_date    — Daily-Roll-Over-Key fuer Continuous-Stream
--         retention_until      — Hard-Delete-Cron (SLC-V9.1-C)
--         soft_delete_at       — Soft-Delete-Cron (SLC-V9.1-C)
--     - email_message (2 neue Spalten):
--         raw_storage_path     — bulk-email-Bucket-Pfad zur Original-EML
--         received_at          — Webhook-Receive-Timestamp
--   Plus:
--     - email_bulk_run.status CHECK-Erweiterung um 'continuous'
--     - UNIQUE partial index fuer Daily-Roll-Over-Idempotenz
--     - 2 weitere Indexes fuer Retention-Cron + Storage-Lookup
--     - Backfill: V9-Bestand bekommt retention_until = created_at + 90d
--
-- Source-of-Truth:
--   - slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-2 + AC-V9.1-A-2)
--   - docs/ARCHITECTURE.md V9.1-Section Flow A (Daily-Roll-Over-Semantik)
--   - DEC-197 (Daily-Roll-Over per (tenant_id, endpoint_id, date)),
--     DEC-198 (90-Tage-Retention), DEC-199 (Soft-Delete vor Hard-Delete)
--
-- Idempotenz:
--   - ALTER TABLE ADD COLUMN IF NOT EXISTS (Postgres 9.6+, alle 7 Spalten)
--   - DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (status CHECK)
--   - CREATE INDEX IF NOT EXISTS auf allen 3 Indexes
--   - Backfill ist konditional (WHERE retention_until IS NULL) — Re-Run no-op
--
-- Apply-Pattern: identisch zu MIG-057 (siehe 112_v91_inbound_foundation.sql Header)
--
-- Verifikation post-LIVE (V9.1-A AC-2):
--   docker exec <db> psql -U postgres -d postgres -c "\d public.email_bulk_run"
--   docker exec <db> psql -U postgres -d postgres -c "\d public.email_message"
--   docker exec <db> psql -U postgres -d postgres \
--     -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint
--          WHERE conname='email_bulk_run_status_check'"
--   docker exec <db> psql -U postgres -d postgres \
--     -c "SELECT COUNT(*) FROM email_bulk_run WHERE retention_until IS NULL"
--   --> erwartet 0 nach Backfill

BEGIN;

DO $mig058$ BEGIN

-- =============================================================================
-- 1. email_bulk_run — 5 neue Spalten + status CHECK Erweiterung
-- =============================================================================

ALTER TABLE public.email_bulk_run
  ADD COLUMN IF NOT EXISTS inbound_source    text;

ALTER TABLE public.email_bulk_run
  ADD COLUMN IF NOT EXISTS endpoint_id       uuid REFERENCES public.email_inbound_endpoint(id) ON DELETE SET NULL;

ALTER TABLE public.email_bulk_run
  ADD COLUMN IF NOT EXISTS daily_anchor_date date;

ALTER TABLE public.email_bulk_run
  ADD COLUMN IF NOT EXISTS retention_until   timestamptz;

ALTER TABLE public.email_bulk_run
  ADD COLUMN IF NOT EXISTS soft_delete_at    timestamptz;

-- Default 'mbox_upload' fuer alle Bestand-Rows + Future-Inserts ohne expliziten Wert.
-- (ADD COLUMN ohne DEFAULT laesst NULL — wir setzen erst Default, dann NOT NULL.)
ALTER TABLE public.email_bulk_run
  ALTER COLUMN inbound_source SET DEFAULT 'mbox_upload';

UPDATE public.email_bulk_run
  SET inbound_source = 'mbox_upload'
  WHERE inbound_source IS NULL;

ALTER TABLE public.email_bulk_run
  ALTER COLUMN inbound_source SET NOT NULL;

-- inbound_source-CHECK
ALTER TABLE public.email_bulk_run
  DROP CONSTRAINT IF EXISTS email_bulk_run_inbound_source_check;
ALTER TABLE public.email_bulk_run
  ADD CONSTRAINT email_bulk_run_inbound_source_check
  CHECK (inbound_source IN ('mbox_upload', 'forward_bucket'));

-- status CHECK-Erweiterung um 'continuous'
-- Bestand (Stand MIG-051/106, 13 Werte):
--   uploaded, parsing, parsed, pre_filtering, pre_filtered, thread_redacting,
--   thread_redacted, pattern_extracting, pattern_extracted, curating,
--   importing, completed, failed
-- V9.1 ergaenzt (14 Werte total):
--   + continuous  (Continuous-Stream-Sammelbucket bis Pipeline-Trigger flippt)
ALTER TABLE public.email_bulk_run
  DROP CONSTRAINT IF EXISTS email_bulk_run_status_check;

ALTER TABLE public.email_bulk_run
  ADD CONSTRAINT email_bulk_run_status_check CHECK (status IN (
    'uploaded',
    'parsing',
    'parsed',
    'pre_filtering',
    'pre_filtered',
    'thread_redacting',
    'thread_redacted',
    'pattern_extracting',
    'pattern_extracted',
    'curating',
    'importing',
    'completed',
    'failed',
    'continuous'
  ));

RAISE NOTICE 'MIG-058/113: email_bulk_run +5 columns + inbound_source CHECK + status CHECK extended (continuous)';

-- =============================================================================
-- 2. email_message — 2 neue Spalten
-- =============================================================================

ALTER TABLE public.email_message
  ADD COLUMN IF NOT EXISTS raw_storage_path text;

ALTER TABLE public.email_message
  ADD COLUMN IF NOT EXISTS received_at      timestamptz;

RAISE NOTICE 'MIG-058/113: email_message +2 columns (raw_storage_path, received_at)';

-- =============================================================================
-- 3. Backfill — retention_until fuer V9-Bestand auf created_at + 90d
-- =============================================================================
-- Idempotent: nur Rows mit NULL werden gesetzt. Re-Run wirkt nicht.

UPDATE public.email_bulk_run
  SET retention_until = created_at + interval '90 days'
  WHERE retention_until IS NULL;

UPDATE public.email_message
  SET received_at = created_at
  WHERE received_at IS NULL;

RAISE NOTICE 'MIG-058/113: Backfill applied (retention_until + received_at)';

-- =============================================================================
-- 4. Indexes
-- =============================================================================

-- Retention-Cron-Lookup: alle Runs mit abgelaufener retention_until die noch
-- nicht soft-deleted sind (SLC-V9.1-C Cron, FAST PATH).
CREATE INDEX IF NOT EXISTS idx_email_bulk_run_retention_pending
  ON public.email_bulk_run(retention_until)
  WHERE soft_delete_at IS NULL;

-- Daily-Roll-Over: UNIQUE pro (tenant_id, endpoint_id, daily_anchor_date) — aber
-- nur fuer inbound_source='forward_bucket' (mbox_upload-Rows haben endpoint_id
-- NULL und brauchen keine Idempotenz hier).
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_bulk_run_forward_daily_roll
  ON public.email_bulk_run(tenant_id, endpoint_id, daily_anchor_date)
  WHERE inbound_source = 'forward_bucket' AND endpoint_id IS NOT NULL;

-- Storage-Lookup fuer Retention-Cron: alle email_message mit raw_storage_path,
-- damit Hard-Delete-Cron schnell den Bucket-Pfad pro Run findet.
CREATE INDEX IF NOT EXISTS idx_email_message_raw_storage_path
  ON public.email_message(raw_storage_path)
  WHERE raw_storage_path IS NOT NULL;

RAISE NOTICE 'MIG-058/113: 3 indexes ensured (retention_pending, forward_daily_roll UNIQUE, raw_storage_path)';

END $mig058$;

COMMIT;
