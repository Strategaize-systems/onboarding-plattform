-- Migration 098: V7 pending_signup + partner_client_mapping-Erweiterung
-- SLC-132 MT-1 (FEAT-051 + FEAT-053-Storage, MIG-042) — DEC-129/131/135/138, RPT-298
--
-- ZIEL
-- ====
-- 1) Neue Tabelle `public.pending_signup` als Inbox fuer Self-Signup-Anfragen.
--    Tracks: partner_tenant_id, email_lower, first_name, last_name, optionale
--    Firma, DSGVO-Consent-Version + Timestamp, SHA-256-Token-Hash, 24h TTL,
--    Status-Maschine ('pending'/'verified'/'expired'), verified_at.
-- 2) UNIQUE-Index `(partner_tenant_id, email_lower) WHERE status='pending'`
--    blockiert doppeltes Pending pro (Partner, Email), erlaubt aber Re-Signup
--    nach Expiry (UNIQUE-Filter trifft expired-Rows nicht).
-- 3) Lookup-Indices fuer Verify-Endpoint (SLC-133) + Cleanup-Cron (SLC-135).
-- 4) RLS-Enable ohne Policies → default deny. Nur service_role bypasses RLS
--    fuer Public-Endpoint-Inserts via createAdminClient.
-- 5) `partner_client_mapping`-Erweiterung um 3 Spalten:
--    - invitation_source NOT NULL DEFAULT 'partner_invite' (Auto-Backfill
--      fuer V6-Bestand via DEFAULT).
--    - dsgvo_consent_text_version (optional, gefuellt bei self_signup).
--    - dsgvo_consent_accepted_at (optional, gefuellt bei self_signup).
-- 6) CHECK-Constraint `partner_client_mapping_invitation_source_check`
--    additive, restringiert auf ('partner_invite','self_signup'). DROP IF
--    EXISTS + ADD CONSTRAINT-Pattern aus V6 Migration 091 reused.
--
-- SCHEMA-KORREKTUR
-- ================
-- ARCHITECTURE.md V7-Block (Line 6166) schreibt `REFERENCES public.tenant(id)`
-- (Singular). Live-DB hat aber `public.tenants` (Plural) — bestehende FKs in
-- `partner_client_mapping`/`partner_organization` referenzieren bereits
-- `tenants(id)`. Diese Migration nutzt korrekt `tenants(id)`.
-- (Pre-Apply-Schema-Check per IMP-613 hat den Drift gecatched.)
--
-- IDEMPOTENZ
-- ==========
-- CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS + CREATE INDEX IF
-- NOT EXISTS + DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.
-- Zweiter Apply ist No-Op (PostgreSQL gibt NOTICE-Output ohne Fehler).
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/098_v7_pending_signup_and_mapping_source.sql
--   echo '<BASE64>' | base64 -d > /tmp/098_v7.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/098_v7.sql
--
-- PRE-APPLY-CHECK (R-1 aus Slice)
-- ===============================
--   docker exec <db-container> psql -U postgres -d postgres -c \
--     "SELECT DISTINCT invitation_source FROM public.partner_client_mapping
--      WHERE invitation_source IS NOT NULL"
--   → Erwartet leer (Spalte existiert noch nicht) ODER alle Werte in
--     ('partner_invite','self_signup'). Andernfalls Manual-Fix vor
--     CHECK-Constraint-Add.
--
-- PRE-APPLY-BACKUP-PFLICHT
-- ========================
--   docker exec <db-container> pg_dump -U postgres -d postgres \
--     --table=public.partner_client_mapping \
--     > /opt/onboarding-plattform-backups/pre-mig-042-098_$(date +%Y%m%d_%H%M%S).sql
--
-- VERIFIKATION (nach Apply)
-- =========================
--   \d pending_signup
--     → 12 Spalten (id, partner_tenant_id, email_lower, first_name, last_name,
--       company_name, dsgvo_consent_text_version, dsgvo_consent_accepted_at,
--       verify_token_hash, expires_at, status, verified_at, created_at)
--       — eigentlich 13 Spalten inkl. created_at.
--     → CHECK-Constraint `pending_signup_status_check`
--       CHECK status IN ('pending','verified','expired').
--     → 3 Indices: PRIMARY KEY + unique_pending + token_hash_lookup +
--       expires_status.
--     → FK partner_tenant_id → tenants(id) ON DELETE CASCADE.
--     → RLS enabled, 0 Policies.
--   \d partner_client_mapping
--     → 3 neue Spalten: invitation_source (NOT NULL DEFAULT 'partner_invite'),
--       dsgvo_consent_text_version, dsgvo_consent_accepted_at.
--     → CHECK-Constraint `partner_client_mapping_invitation_source_check`.
--   SELECT COUNT(*) FROM partner_client_mapping WHERE invitation_source IS NULL
--     → 0 (PostgreSQL fuellt DEFAULT bei ADD COLUMN ... DEFAULT).

BEGIN;

-- 1. pending_signup-Tabelle anlegen
CREATE TABLE IF NOT EXISTS public.pending_signup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email_lower text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  company_name text NULL,
  dsgvo_consent_text_version text NOT NULL,
  dsgvo_consent_accepted_at timestamptz NOT NULL DEFAULT now(),
  verify_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pending_signup_status_check CHECK (status IN ('pending','verified','expired'))
);

-- 2. UNIQUE: kein doppeltes Pending pro Email+Partner (Re-Signup nach Expiry erlaubt)
CREATE UNIQUE INDEX IF NOT EXISTS pending_signup_partner_email_unique_pending
  ON public.pending_signup (partner_tenant_id, email_lower)
  WHERE status = 'pending';

-- 3. Lookup-Index fuer Verify-Endpoint (SLC-133)
CREATE INDEX IF NOT EXISTS pending_signup_token_hash_lookup
  ON public.pending_signup (verify_token_hash)
  WHERE status = 'pending';

-- 4. Lookup-Index fuer Cleanup-Cron (SLC-135)
CREATE INDEX IF NOT EXISTS pending_signup_expires_status
  ON public.pending_signup (expires_at, status);

-- 5. RLS enable ohne Policies → default deny. service_role bypasses RLS.
ALTER TABLE public.pending_signup ENABLE ROW LEVEL SECURITY;

-- 6. partner_client_mapping um invitation_source + DSGVO-Consent-Spalten erweitern
ALTER TABLE public.partner_client_mapping
  ADD COLUMN IF NOT EXISTS invitation_source text NOT NULL DEFAULT 'partner_invite';

ALTER TABLE public.partner_client_mapping
  ADD COLUMN IF NOT EXISTS dsgvo_consent_text_version text NULL;

ALTER TABLE public.partner_client_mapping
  ADD COLUMN IF NOT EXISTS dsgvo_consent_accepted_at timestamptz NULL;

-- 7. CHECK-Constraint additive auf invitation_source (DROP IF EXISTS + ADD pattern)
ALTER TABLE public.partner_client_mapping
  DROP CONSTRAINT IF EXISTS partner_client_mapping_invitation_source_check;
ALTER TABLE public.partner_client_mapping
  ADD CONSTRAINT partner_client_mapping_invitation_source_check
    CHECK (invitation_source IN ('partner_invite','self_signup'));

COMMIT;
