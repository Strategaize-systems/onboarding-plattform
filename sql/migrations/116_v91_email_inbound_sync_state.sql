-- Migration 116 — V9.1 SLC-V9.1-A MT-R2 MIG-061 Inbound IMAP Sync-State
--
-- REVISION R1 (DEC-205): IMAP-Pull-Reuse supersedes SES-Webhook (DEC-194).
-- Per-Endpoint inkrementeller IMAP-UID-Sync-State (Analog-Port aus
-- strategaize-business-system email_sync_state). Der Cron
-- /api/cron/inbound-email-imap-sync (MT-R6) liest/schreibt last_uid hier, damit
-- ImapFlow nur neue Mails (uid > last_uid) inkrementell zieht.
--
-- Source-of-Truth:
--   - slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-R2 + AC-R1-2)
--   - docs/ARCHITECTURE.md V9.1-Addendum REVISION-R1 (Flow A R1)
--   - DEC-205 (IMAP-Reuse), DEC-R1-2 (Default-Endpoint-Resolve)
--
-- RLS-Translation (DEC-001 kanonisch, identisch zu MIG-057/112):
--   auth.user_role()      -> 'strategaize_admin' | 'tenant_admin' | 'tenant_member' | 'employee'
--   auth.user_tenant_id() -> uuid (NULL fuer strategaize_admin Cross-Tenant)
--
-- Rollen-Matrix:
--   - strategaize_admin: FOR ALL Cross-Tenant (admin_all)
--   - tenant_admin (GF): SELECT own Tenant (read-only — Writes nur via service_role/Cron)
--   - tenant_member + employee: KEIN ACCESS (kein POLICY-Eintrag — Default-Deny)
--   - service_role: FOR ALL (Cron schreibt last_uid/status) — explizit + BYPASSRLS (Defense-in-Depth)
--
-- Idempotenz:
--   - CREATE TABLE IF NOT EXISTS
--   - DROP POLICY IF EXISTS + CREATE POLICY (V9-Standard-Pattern)
--   - CREATE INDEX IF NOT EXISTS
--
-- Apply-Pattern (per .claude/rules/sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/116_v91_email_inbound_sync_state.sql
--   echo '<BASE64>' | base64 -d > /tmp/116_v91.sql
--   ssh root@159.69.207.29 \
--     "docker exec -i \$(docker ps --format '{{.Names}}' | grep ^supabase-db) \
--      psql -U postgres -d postgres < /tmp/116_v91.sql"
--
-- Verifikation post-LIVE (AC-R1-2):
--   docker exec <db> psql -U postgres -d postgres -c "\d public.email_inbound_sync_state"
--   docker exec <db> psql -U postgres -d postgres \
--     -c "SELECT polname FROM pg_policy WHERE polrelid='public.email_inbound_sync_state'::regclass"
--   docker exec <db> psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"

BEGIN;

DO $mig061$ BEGIN

-- =============================================================================
-- 1. email_inbound_sync_state — Per-Endpoint inkrementeller IMAP-UID-State
-- =============================================================================
-- 1 Row pro Endpoint (PK endpoint_id). last_uid steuert den inkrementellen
-- ImapFlow-Fetch (uid > last_uid). status spiegelt den Lauf-Zustand fuer den
-- Cron-Overlap-Guard (R-R1-4). tenant_id ist denormalisiert fuer RLS-Performance
-- (vermeidet Join in Policy), konsistent mit email_forward_allowlist (MIG-057).

CREATE TABLE IF NOT EXISTS public.email_inbound_sync_state (
  endpoint_id         uuid        PRIMARY KEY
                                  REFERENCES public.email_inbound_endpoint ON DELETE CASCADE,
  tenant_id           uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  folder              text        NOT NULL DEFAULT 'INBOX',
  last_uid            bigint      NOT NULL DEFAULT 0,
  status              text        NOT NULL DEFAULT 'idle'
                                  CHECK (status IN ('idle', 'syncing', 'error')),
  last_sync_at        timestamptz,
  emails_synced_total integer     NOT NULL DEFAULT 0,
  error_message       text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_inbound_sync_state_tenant
  ON public.email_inbound_sync_state(tenant_id);

RAISE NOTICE 'MIG-061/116: email_inbound_sync_state table + index ensured';

-- =============================================================================
-- 2. RLS — ENABLE + Policy-Matrix (3 Policies)
-- =============================================================================

ALTER TABLE public.email_inbound_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_inbound_sync_state_admin_all     ON public.email_inbound_sync_state;
DROP POLICY IF EXISTS email_inbound_sync_state_tenant_select ON public.email_inbound_sync_state;
DROP POLICY IF EXISTS email_inbound_sync_state_service_write ON public.email_inbound_sync_state;

-- 2a. strategaize_admin: FOR ALL Cross-Tenant
CREATE POLICY email_inbound_sync_state_admin_all ON public.email_inbound_sync_state
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- 2b. tenant_admin (GF): SELECT own Tenant (read-only — kein INSERT/UPDATE/DELETE)
CREATE POLICY email_inbound_sync_state_tenant_select ON public.email_inbound_sync_state
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- 2c. service_role: FOR ALL (Cron-Sync schreibt last_uid/status). service_role
--     hat in Supabase BYPASSRLS — diese Policy ist Defense-in-Depth + Self-Doku.
CREATE POLICY email_inbound_sync_state_service_write ON public.email_inbound_sync_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

RAISE NOTICE 'MIG-061/116: RLS enabled + 3 policies created';

-- =============================================================================
-- 3. GRANTs auf authenticated + service_role
-- =============================================================================

GRANT ALL ON public.email_inbound_sync_state TO authenticated;
GRANT ALL ON public.email_inbound_sync_state TO service_role;

RAISE NOTICE 'MIG-061/116: GRANTs applied to authenticated + service_role';

-- =============================================================================
-- 4. updated_at trigger
-- =============================================================================

DROP TRIGGER IF EXISTS email_inbound_sync_state_updated_at ON public.email_inbound_sync_state;
CREATE TRIGGER email_inbound_sync_state_updated_at
  BEFORE UPDATE ON public.email_inbound_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

RAISE NOTICE 'MIG-061/116: email_inbound_sync_state.updated_at trigger created';

END $mig061$;

COMMIT;
