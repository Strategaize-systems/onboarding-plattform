-- Migration 103 — V8 SLC-148 MT-6 — capture_session.metadata JSONB column
--
-- Adds a generic `metadata` JSONB slot on capture_session for deterministic
-- system-computed snapshots, separate from `answers` (which holds the
-- mandant-provided question responses).
--
-- First consumer (MT-6): V8 finalizeMandantenReport writes
--   metadata.v8_report_snapshot = { schemaVersion, finalizedAt, moduleScores,
--                                   sui, classification, stufenMapping,
--                                   hausaufgaben, reflexionen, hebel }
-- using `metadata = metadata || jsonb_build_object('v8_report_snapshot', $snapshot)`
-- (additive merge — preserves any other future keys).
--
-- The existing RESTRICTIVE policy `capture_session_strategaize_admin_snapshot_gated`
-- (MT-2 / Migration 102) gates the WHOLE row by `released_for_strategaize_review`,
-- so this column inherits the same access discipline without further policy work.
--
-- Idempotent via IF NOT EXISTS. Safe re-apply.

BEGIN;

ALTER TABLE public.capture_session
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.capture_session.metadata IS
  'V8 generic JSONB slot for system-computed snapshots (e.g. v8_report_snapshot from finalizeMandantenReport). Separate from `answers` which holds mandant-provided responses. Gated together with the row via released_for_strategaize_review (MIG-102 RESTRICTIVE policy).';

COMMIT;
