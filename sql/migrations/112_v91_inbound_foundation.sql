-- Migration 112 — V9.1 SLC-V9.1-A MT-2 MIG-057 Inbound-Foundation Schema
--
-- Zweck:
--   3 neue V9.1-Tabellen fuer Inbound-Webhook-Pipeline:
--     - email_inbound_endpoint        — Tenant-Catchall-Endpoint mit Setup-Token
--     - email_forward_allowlist       — Optional Sender-Allowlist pro Endpoint
--     - email_validation_reject_log   — Audit-Trail aller silent-drop-Rejects
--   Plus ai_jobs.job_type CHECK-Erweiterung um 2 V9.1-Werte:
--     - email_bulk_pipeline_trigger   — Periodischer Pipeline-Trigger (SLC-V9.1-B)
--     - email_bulk_retention_sweep    — Storage-Retention-Cron (SLC-V9.1-C)
--
-- Source-of-Truth:
--   - slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-2 + AC-V9.1-A-1)
--   - docs/ARCHITECTURE.md V9.1-Section (Component-Spec, RLS-Layout)
--   - DEC-194 (Vendor-Adapter), DEC-200 (Catchall-Slug-Probing-Mitigation),
--     DEC-201 (3-Schicht-Defense)
--
-- RLS-Translation (DEC-001 kanonisch, identisch zu V9 MIG-106):
--   auth.user_role()      -> 'strategaize_admin' | 'tenant_admin' | 'tenant_member' | 'employee'
--   auth.user_tenant_id() -> uuid (NULL fuer strategaize_admin Cross-Tenant)
--
-- Rollen-Matrix V9.1:
--   - strategaize_admin: SELECT Cross-Tenant + INSERT Cross-Tenant (Audit + Provisioning)
--   - tenant_admin (GF):
--       email_inbound_endpoint:      SELECT + INSERT + UPDATE own Tenant
--       email_forward_allowlist:     SELECT + INSERT + DELETE own Tenant
--       email_validation_reject_log: SELECT own Tenant (read-only — nur service_role INSERTet via Webhook)
--   - tenant_member + employee: KEIN ACCESS V9.1 (kein POLICY-Eintrag — Default-Deny)
--
-- Idempotenz:
--   - CREATE TABLE IF NOT EXISTS auf allen 3 Tabellen
--   - DROP POLICY IF EXISTS + CREATE POLICY (V9-Standard-Pattern)
--   - ALTER ai_jobs DROP CONSTRAINT + ADD CONSTRAINT (kanonische Erweiterungs-Form)
--   - CREATE INDEX IF NOT EXISTS auf allen Indexes
--
-- Apply-Pattern (per .claude/rules/sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/112_v91_inbound_foundation.sql
--   echo '<BASE64>' | base64 -d > /tmp/112_v91.sql
--   ssh root@159.69.207.29 \
--     "docker exec -i \$(docker ps --format '{{.Names}}' | grep ^supabase-db) \
--      psql -U postgres -d postgres < /tmp/112_v91.sql"
--
-- Verifikation post-LIVE (V9.1-A AC-1):
--   docker exec <db> psql -U postgres -d postgres -c "\d public.email_inbound_endpoint"
--   docker exec <db> psql -U postgres -d postgres -c "\d public.email_forward_allowlist"
--   docker exec <db> psql -U postgres -d postgres -c "\d public.email_validation_reject_log"
--   docker exec <db> psql -U postgres -d postgres \
--     -c "SELECT polname FROM pg_policy WHERE polrelid='public.email_inbound_endpoint'::regclass"
--   docker exec <db> psql -U postgres -d postgres \
--     -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ai_jobs_job_type_check'"

BEGIN;

DO $mig057$ BEGIN

-- =============================================================================
-- 1. email_inbound_endpoint — Tenant-Catchall-Endpoint mit Setup-Token
-- =============================================================================
-- Lookup-Pfad: bulk-<slug>@bulk.strategaizetransition.com -> tenant_id + endpoint_id
-- Setup-Token: 32-byte URL-safe random (provisioned via Setup-UI in SLC-V9.1-D),
-- verifiziert in Webhook-Schicht 2 (DEC-201).

CREATE TABLE IF NOT EXISTS public.email_inbound_endpoint (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  slug          text        NOT NULL,
  setup_token   text        NOT NULL,
  status        text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'paused', 'revoked')),
  display_name  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_inbound_endpoint_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_email_inbound_endpoint_tenant
  ON public.email_inbound_endpoint(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_inbound_endpoint_status
  ON public.email_inbound_endpoint(status)
  WHERE status != 'active';

RAISE NOTICE 'MIG-057/112: email_inbound_endpoint table + indexes ensured';

-- =============================================================================
-- 2. email_forward_allowlist — Optional Sender-Allowlist pro Endpoint
-- =============================================================================
-- Wenn fuer einen Endpoint min. 1 enabled Row existiert, prueft Webhook-Schicht 3
-- die From:-Adresse gegen alle enabled Pattern (Domain-Match oder Email-exact).
-- tenant_id ist denormalisiert fuer RLS-Performance (vermeidet Join in Policy).

CREATE TABLE IF NOT EXISTS public.email_forward_allowlist (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id  uuid        NOT NULL REFERENCES public.email_inbound_endpoint ON DELETE CASCADE,
  tenant_id    uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  pattern      text        NOT NULL,
  pattern_type text        NOT NULL CHECK (pattern_type IN ('domain', 'email_exact')),
  enabled      boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_forward_allowlist_endpoint_enabled
  ON public.email_forward_allowlist(endpoint_id, enabled);

RAISE NOTICE 'MIG-057/112: email_forward_allowlist table + index ensured';

-- =============================================================================
-- 3. email_validation_reject_log — Silent-Drop Audit-Trail
-- =============================================================================
-- Jeder Reject-Pfad im Webhook (HMAC-Fail bis Allowlist-Mismatch) wird hier
-- protokolliert fuer Probing-Sichtbarkeit + Operations-Diagnose.
-- tenant_id + endpoint_id nullable, weil bei 'tenant_not_found'-Pfad weder
-- bekannt ist.

CREATE TABLE IF NOT EXISTS public.email_validation_reject_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        REFERENCES public.tenants ON DELETE CASCADE,
  endpoint_id       uuid        REFERENCES public.email_inbound_endpoint ON DELETE SET NULL,
  reject_layer      text        NOT NULL CHECK (reject_layer IN (
                                  'hmac_invalid',
                                  'tenant_not_found',
                                  'endpoint_inactive',
                                  'setup_token_missing',
                                  'setup_token_invalid',
                                  'allowlist_mismatch'
                                )),
  sender_domain     text,
  sender_full_email text,
  subject_snippet   text,
  raw_storage_path  text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_validation_reject_log_tenant_created
  ON public.email_validation_reject_log(tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

RAISE NOTICE 'MIG-057/112: email_validation_reject_log table + index ensured';

-- =============================================================================
-- 4. RLS auf 3 Tabellen — ENABLE + Policy-Matrix (10 Policies total)
-- =============================================================================

ALTER TABLE public.email_inbound_endpoint      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_forward_allowlist     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_validation_reject_log ENABLE ROW LEVEL SECURITY;

-- 4a. email_inbound_endpoint policies (4) ------------------------------------

DROP POLICY IF EXISTS email_inbound_endpoint_admin_all     ON public.email_inbound_endpoint;
DROP POLICY IF EXISTS email_inbound_endpoint_tenant_select ON public.email_inbound_endpoint;
DROP POLICY IF EXISTS email_inbound_endpoint_tenant_insert ON public.email_inbound_endpoint;
DROP POLICY IF EXISTS email_inbound_endpoint_tenant_update ON public.email_inbound_endpoint;

CREATE POLICY email_inbound_endpoint_admin_all ON public.email_inbound_endpoint
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY email_inbound_endpoint_tenant_select ON public.email_inbound_endpoint
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_inbound_endpoint_tenant_insert ON public.email_inbound_endpoint
  FOR INSERT
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_inbound_endpoint_tenant_update ON public.email_inbound_endpoint
  FOR UPDATE
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- 4b. email_forward_allowlist policies (4) -----------------------------------

DROP POLICY IF EXISTS email_forward_allowlist_admin_all     ON public.email_forward_allowlist;
DROP POLICY IF EXISTS email_forward_allowlist_tenant_select ON public.email_forward_allowlist;
DROP POLICY IF EXISTS email_forward_allowlist_tenant_insert ON public.email_forward_allowlist;
DROP POLICY IF EXISTS email_forward_allowlist_tenant_delete ON public.email_forward_allowlist;

CREATE POLICY email_forward_allowlist_admin_all ON public.email_forward_allowlist
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY email_forward_allowlist_tenant_select ON public.email_forward_allowlist
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_forward_allowlist_tenant_insert ON public.email_forward_allowlist
  FOR INSERT
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_forward_allowlist_tenant_delete ON public.email_forward_allowlist
  FOR DELETE
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- 4c. email_validation_reject_log policies (2) -------------------------------
-- READ-ONLY fuer Tenant. INSERTs nur via service_role (Webhook-Pfad).

DROP POLICY IF EXISTS email_validation_reject_log_admin_select  ON public.email_validation_reject_log;
DROP POLICY IF EXISTS email_validation_reject_log_tenant_select ON public.email_validation_reject_log;

CREATE POLICY email_validation_reject_log_admin_select ON public.email_validation_reject_log
  FOR SELECT
  USING (auth.user_role() = 'strategaize_admin');

CREATE POLICY email_validation_reject_log_tenant_select ON public.email_validation_reject_log
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

RAISE NOTICE 'MIG-057/112: RLS policies on 3 tables created (10 policies total)';

-- =============================================================================
-- 5. GRANTs auf authenticated + service_role
-- =============================================================================

GRANT ALL ON public.email_inbound_endpoint      TO authenticated;
GRANT ALL ON public.email_inbound_endpoint      TO service_role;
GRANT ALL ON public.email_forward_allowlist     TO authenticated;
GRANT ALL ON public.email_forward_allowlist     TO service_role;
GRANT ALL ON public.email_validation_reject_log TO authenticated;
GRANT ALL ON public.email_validation_reject_log TO service_role;

RAISE NOTICE 'MIG-057/112: GRANTs applied to authenticated + service_role';

-- =============================================================================
-- 6. updated_at trigger fuer email_inbound_endpoint
-- =============================================================================

DROP TRIGGER IF EXISTS email_inbound_endpoint_updated_at ON public.email_inbound_endpoint;
CREATE TRIGGER email_inbound_endpoint_updated_at
  BEFORE UPDATE ON public.email_inbound_endpoint
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

RAISE NOTICE 'MIG-057/112: email_inbound_endpoint.updated_at trigger created';

-- =============================================================================
-- 7. ai_jobs.job_type CHECK-Erweiterung um 2 V9.1-Werte
-- =============================================================================
-- Bestand (Stand MIG-111, 19 Werte):
--   bridge_generation, diagnosis_generation, dialogue_extraction,
--   dialogue_transcription, evidence_extraction, handbook_snapshot_generation,
--   knowledge_unit_condensation, recondense_with_gaps, sop_generation,
--   walkthrough_extract_steps, walkthrough_map_subtopics,
--   walkthrough_redact_pii, walkthrough_stub_processing, walkthrough_transcribe,
--   lead_push_retry, email_bulk_parse, email_bulk_pre_filter,
--   email_bulk_thread_redact, email_bulk_pattern_extract
-- V9.1 ergaenzt (21 Werte total):
--   + email_bulk_pipeline_trigger   (Periodic-Cron, SLC-V9.1-B)
--   + email_bulk_retention_sweep    (Storage-Retention-Cron, SLC-V9.1-C)

ALTER TABLE public.ai_jobs
  DROP CONSTRAINT IF EXISTS ai_jobs_job_type_check;

ALTER TABLE public.ai_jobs
  ADD CONSTRAINT ai_jobs_job_type_check CHECK (
    job_type IN (
      'bridge_generation',
      'diagnosis_generation',
      'dialogue_extraction',
      'dialogue_transcription',
      'evidence_extraction',
      'handbook_snapshot_generation',
      'knowledge_unit_condensation',
      'recondense_with_gaps',
      'sop_generation',
      'walkthrough_extract_steps',
      'walkthrough_map_subtopics',
      'walkthrough_redact_pii',
      'walkthrough_stub_processing',
      'walkthrough_transcribe',
      'lead_push_retry',
      'email_bulk_parse',
      'email_bulk_pre_filter',
      'email_bulk_thread_redact',
      'email_bulk_pattern_extract',
      'email_bulk_pipeline_trigger',
      'email_bulk_retention_sweep'
    )
  );

RAISE NOTICE 'MIG-057/112: ai_jobs_job_type_check extended (19 -> 21 values, +email_bulk_pipeline_trigger +email_bulk_retention_sweep)';

END $mig057$;

COMMIT;
