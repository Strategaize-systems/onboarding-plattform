-- Migration 118 — V9.1 SLC-V9.1-D MT-0 MIG-063 Setup-Lifecycle + DSGVO-Consent
--
-- Zweck:
--   email_inbound_endpoint um Setup-UI-Lifecycle (SLC-V9.1-D) erweitern:
--     - setup_token_created_at        — Zeitstempel der letzten Token-Generation
--                                       (Display "Token wird nur einmal gezeigt" + Regenerate-Audit)
--     - dsgvo_consent_text_version    — Version des bestaetigten Disclaimer-Texts
--     - dsgvo_consent_accepted_at     — Zeitstempel der DSGVO-Bestaetigung (7-Jahre-Audit)
--     - dsgvo_consent_user_id         — User der bestaetigt hat (FK auth.users, SET NULL bei User-Loeschung)
--   Plus status CHECK-Erweiterung um 'pending_setup':
--     Neuer Endpoint startet als 'pending_setup' (Setup-UI createInboundEndpoint),
--     wird durch confirmDsgvoDisclaimer (+ erfolgreichen Test-Send) auf 'active' gesetzt.
--
-- Source-of-Truth:
--   - slices/SLC-V9.1-D-setup-ui-admin-audit.md (MT-2 + AC-V9.1-D-3/-5)
--   - DEC-209 (Schema-Drift-Closure: as-built email_inbound_endpoint hatte keine
--             DSGVO-Consent-Spalten + kein 'pending_setup' — additive Migration statt
--             error_log-only, weil 7-Jahre-Consent queryable auf der Endpoint-Row sein muss)
--
-- Hintergrund (IMP-1189 Schema-Validation vor /backend):
--   Spec MT-2 schrieb dsgvo_consent_text_version / _accepted_at / _user_id + setup_token_created_at
--   auf email_inbound_endpoint und nutzte status 'pending_setup'. As-built MIG-057/112 hatte
--   keine dieser Spalten und CHECK (status IN ('active','paused','revoked')). Diese Migration
--   schliesst die Luecke additiv.
--
-- Idempotenz:
--   - ADD COLUMN IF NOT EXISTS auf allen 4 Spalten
--   - DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT fuer status-CHECK (V9-Standard-Pattern)
--   - Bestehende Rows (alle 'active' oder NULL-Consent) bleiben valide
--   - Column-Default bleibt 'active' (Bestand unveraendert); Setup-UI setzt 'pending_setup' explizit
--
-- Affected Areas:
--   email_inbound_endpoint (+4 Spalten, status-CHECK 3 -> 4 Werte). Keine neue Tabelle,
--   keine RLS-Aenderung (Spalten erben Table-RLS), keine neuen Indexes noetig,
--   GRANT ALL deckt neue Spalten ab. Kein Daten-Backfill noetig.
--
-- Apply-Pattern (per .claude/rules/sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/118_v91_inbound_endpoint_dsgvo_consent_setup_lifecycle.sql
--   echo '<BASE64>' | base64 -d > /tmp/118_v91.sql
--   ssh root@159.69.207.29 \
--     "docker exec -i \$(docker ps --format '{{.Names}}' | grep ^supabase-db) \
--      psql -U postgres -d postgres < /tmp/118_v91.sql"
--
-- Verifikation post-LIVE (V9.1-D AC-3/-5):
--   docker exec <db> psql -U postgres -d postgres -c "\d public.email_inbound_endpoint"
--   docker exec <db> psql -U postgres -d postgres \
--     -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='email_inbound_endpoint_status_check'"

BEGIN;

DO $mig063$ BEGIN

-- =============================================================================
-- 1. DSGVO-Consent + Setup-Token-Lifecycle Spalten
-- =============================================================================

ALTER TABLE public.email_inbound_endpoint
  ADD COLUMN IF NOT EXISTS setup_token_created_at timestamptz;

ALTER TABLE public.email_inbound_endpoint
  ADD COLUMN IF NOT EXISTS dsgvo_consent_text_version text;

ALTER TABLE public.email_inbound_endpoint
  ADD COLUMN IF NOT EXISTS dsgvo_consent_accepted_at timestamptz;

ALTER TABLE public.email_inbound_endpoint
  ADD COLUMN IF NOT EXISTS dsgvo_consent_user_id uuid REFERENCES auth.users ON DELETE SET NULL;

RAISE NOTICE 'MIG-063/118: email_inbound_endpoint +4 columns (setup_token_created_at + 3 dsgvo_consent_*) ensured';

-- =============================================================================
-- 2. status CHECK-Erweiterung um 'pending_setup'
-- =============================================================================
-- Bestand (MIG-057/112): CHECK (status IN ('active', 'paused', 'revoked'))
-- V9.1-D ergaenzt: 'pending_setup' (Endpoint vor erstem erfolgreichen Test-Send + DSGVO-Consent)
-- Inline-CHECK aus CREATE TABLE traegt den Postgres-Default-Namen
-- 'email_inbound_endpoint_status_check'.

ALTER TABLE public.email_inbound_endpoint
  DROP CONSTRAINT IF EXISTS email_inbound_endpoint_status_check;

ALTER TABLE public.email_inbound_endpoint
  ADD CONSTRAINT email_inbound_endpoint_status_check CHECK (
    status IN ('pending_setup', 'active', 'paused', 'revoked')
  );

RAISE NOTICE 'MIG-063/118: email_inbound_endpoint_status_check extended (3 -> 4 values, +pending_setup)';

END $mig063$;

COMMIT;
