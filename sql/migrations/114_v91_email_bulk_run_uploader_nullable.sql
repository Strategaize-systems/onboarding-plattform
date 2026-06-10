-- Migration 114 — V9.1 SLC-V9.1-A MT-4 MIG-059 email_bulk_run.uploader_user_id nullable
--
-- Zweck:
--   forward_bucket-Continuous-Runs (DEC-200) werden vom Inbound-Webhook
--   (system-Pfad, kein menschlicher Uploader) angelegt. Die Spalte
--   email_bulk_run.uploader_user_id (FK auth.users) ist mbox-Upload-spezifisch
--   und kann fuer forward_bucket nicht sinnvoll gesetzt werden.
--
--   DEC-202: uploader_user_id wird nullable. Webhook setzt NULL bei forward_bucket.
--   mbox_upload-Runs (V9-Pfad) setzen den Wert weiterhin (keine Verhaltensaenderung).
--
-- Source-of-Truth:
--   - slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-4, Flow A Schritt 14)
--   - docs/DECISIONS.md DEC-202 (Founder-Entscheidung 2026-06-10: nullable statt
--     System-Service-User oder Tenant-Admin-Lookup)
--
-- Idempotenz:
--   - ALTER COLUMN DROP NOT NULL ist idempotent (Re-Run = no-op).
--   - FK + Spalte bleiben unveraendert; nur die NOT-NULL-Constraint faellt.
--
-- Apply-Pattern: identisch zu MIG-057 (siehe 112_v91_inbound_foundation.sql Header)
--
-- Verifikation post-LIVE (AC-V9.1-A-7):
--   docker exec <db> psql -U postgres -d postgres -c "\d public.email_bulk_run"
--   --> uploader_user_id jetzt nullable (kein 'not null' mehr)

BEGIN;

DO $mig059$ BEGIN

ALTER TABLE public.email_bulk_run
  ALTER COLUMN uploader_user_id DROP NOT NULL;

RAISE NOTICE 'MIG-059/114: email_bulk_run.uploader_user_id is now nullable (forward_bucket system-runs, DEC-202)';

END $mig059$;

COMMIT;
