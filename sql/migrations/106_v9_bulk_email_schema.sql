-- Migration 106 — V9 SLC-165 MT-2 MIG-051 Bulk-Email-Schema-Foundation
--
-- Zweck:
--   Anlegen der 4 V9-Tabellen (email_bulk_run, email_message, email_thread,
--   email_pattern) + Storage-Bucket `bulk-email` + Tenant-RLS-Matrix + GRANTs
--   + capture_session.capture_mode CHECK-Erweiterung um 'email_bulk' +
--   View vw_bulk_email_cost_monthly fuer Tenant-Monats-Cap-Enforcement.
--
-- Source-of-Truth: ARCHITECTURE.md V9-Section (DEC-176..186, Lines 7872..8064)
-- Slice-Spec: slices/SLC-165-v9-foundation-upload.md MT-2
--
-- RLS-Translation:
--   ARCHITECTURE.md verwendet `auth_tenant_id() = tenant_id` als Helper-Notation.
--   Onboarding-Plattform-Helper (DEC-001, kanonisch seit MIG-001):
--     auth.user_role()      -> 'strategaize_admin' | 'tenant_admin' | 'tenant_member' | 'employee'
--     auth.user_tenant_id() -> uuid (NULL fuer strategaize_admin Cross-Tenant)
--   Diese Migration nutzt die kanonischen Helper, nicht die ARCH-Notation.
--
-- Rollen-Matrix V9.0 (ARCHITECTURE.md Line 8175):
--   - strategaize_admin: SELECT Cross-Tenant (Audit) — alle 4 Tabellen + Bucket
--   - tenant_admin (GF): SELECT + INSERT + UPDATE own Tenant — alle 4 Tabellen +
--                        SELECT + INSERT own Tenant — Bucket
--   - tenant_member + employee: KEIN ACCESS V9.0 (kein expliziter POLICY-Eintrag
--                                — Default-Deny via ENABLE ROW LEVEL SECURITY)
--
-- Idempotenz:
--   - CREATE TABLE IF NOT EXISTS auf allen 4 Tabellen
--   - DROP POLICY IF EXISTS + CREATE POLICY (Standard-Pattern)
--   - INSERT ... ON CONFLICT (id) DO NOTHING auf storage.buckets
--   - capture_mode CHECK Drop+Add ist idempotent
--
-- Late-Binding-FK email_message.thread_id -> email_thread:
--   Wird NACH beiden CREATE TABLE als ADD CONSTRAINT angelegt (separater
--   Block), weil email_thread erst nach email_message angelegt wird.
--   ARCHITECTURE.md Line 7975 spezifiziert das Pattern explizit.
--
-- knowledge_unit.source CHECK Constraint (R5 aus Slice-Spec):
--   Per ARCHITECTURE.md Line 8075-8091 (DEC, kein Migration-Bedarf) wird
--   `knowledge_unit.metadata->>'source_type'='email_bulk'` als JSONB-Wert
--   genutzt — KEINE Erweiterung der source CHECK-Constraint noetig. Der
--   Pre-Check vor LIVE-Apply ist daher informational, nicht blockierend.
--
-- Apply-Pattern (per .claude/rules/sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/106_v9_bulk_email_schema.sql                (lokal)
--   echo '<BASE64>' | base64 -d > /tmp/106_v9.sql                          (server)
--   ssh root@159.69.207.29 \
--     "docker exec -i \$(docker ps --format '{{.Names}}' | grep ^supabase-db) \
--      psql -U postgres -d postgres < /tmp/106_v9.sql"
--
-- LIVE-Apply ist BLOCKED bis V8.1 STABLE-Bestaetigung via /post-launch
-- nach Burn-In ~2026-06-02 08:00 UTC. Code-Side dieser Migration (MT-2a)
-- ist isoliert vom LIVE-Apply (MT-2b).
--
-- Verifikation post-LIVE (manuelle Smoke-Liste):
--   docker exec <db> psql -U postgres -d postgres -c "\d public.email_bulk_run"
--   docker exec <db> psql -U postgres -d postgres -c "\d public.email_message"
--   docker exec <db> psql -U postgres -d postgres -c "\d public.email_thread"
--   docker exec <db> psql -U postgres -d postgres -c "\d public.email_pattern"
--   docker exec <db> psql -U postgres -d postgres \
--     -c "SELECT id FROM storage.buckets WHERE id='bulk-email'"
--   docker exec <db> psql -U postgres -d postgres \
--     -c "SELECT polname FROM pg_policy WHERE polrelid='public.email_bulk_run'::regclass"
--   docker exec <db> psql -U postgres -d postgres \
--     -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint
--          WHERE conname='capture_session_capture_mode_check'"

BEGIN;

DO $mig051$ BEGIN

-- =============================================================================
-- 1. capture_session.capture_mode CHECK-Erweiterung um 'email_bulk' (DEC-186)
-- =============================================================================
-- Kanonische Liste der erlaubten Modes inkl. Bestandswerte aus MIG-031 (Migration
-- 082) + neuer V9-Wert 'email_bulk'.

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
    'walkthrough',
    'email_bulk'
  ));

RAISE NOTICE 'MIG-051/106: capture_session.capture_mode CHECK extended with email_bulk';

-- =============================================================================
-- 2. email_bulk_run — Audit-Header pro Upload
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_bulk_run (
  id                          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid          NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  uploader_user_id            uuid          NOT NULL REFERENCES auth.users,
  capture_session_id          uuid          REFERENCES public.capture_session ON DELETE SET NULL,
  source_file_name            text          NOT NULL,
  file_hash                   text          NOT NULL,
  storage_path                text          NOT NULL,
  email_count                 integer       NOT NULL DEFAULT 0,
  content_emails              integer       NOT NULL DEFAULT 0,
  thread_count                integer       NOT NULL DEFAULT 0,
  patterns_extracted          integer       NOT NULL DEFAULT 0,
  patterns_accepted           integer       NOT NULL DEFAULT 0,
  patterns_imported           integer       NOT NULL DEFAULT 0,
  pre_filter_cost_eur         numeric(8, 4) NOT NULL DEFAULT 0,
  pattern_extraction_cost_eur numeric(8, 4) NOT NULL DEFAULT 0,
  total_cost_eur              numeric(8, 4) GENERATED ALWAYS AS
                                            (pre_filter_cost_eur + pattern_extraction_cost_eur) STORED,
  status                      text          NOT NULL DEFAULT 'uploaded'
                                            CHECK (status IN (
                                              'uploaded', 'parsing', 'parsed',
                                              'pre_filtering', 'pre_filtered',
                                              'thread_redacting', 'thread_redacted',
                                              'pattern_extracting', 'pattern_extracted',
                                              'curating', 'importing', 'completed',
                                              'failed'
                                            )),
  failure_reason              text,
  created_at                  timestamptz   NOT NULL DEFAULT now(),
  updated_at                  timestamptz   NOT NULL DEFAULT now(),
  completed_at                timestamptz,
  CONSTRAINT email_bulk_run_unique_per_tenant UNIQUE (tenant_id, file_hash)
);

CREATE INDEX IF NOT EXISTS idx_email_bulk_run_tenant
  ON public.email_bulk_run(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_bulk_run_status
  ON public.email_bulk_run(status)
  WHERE status NOT IN ('completed', 'failed');
CREATE INDEX IF NOT EXISTS idx_email_bulk_run_session
  ON public.email_bulk_run(capture_session_id)
  WHERE capture_session_id IS NOT NULL;

RAISE NOTICE 'MIG-051/106: email_bulk_run table + indexes ensured';

-- =============================================================================
-- 3. email_message — pro-Email-Persistierung (Pflicht-Headers + Body)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_message (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  bulk_run_id           uuid        NOT NULL REFERENCES public.email_bulk_run ON DELETE CASCADE,
  message_id            text        NOT NULL,
  in_reply_to           text,
  references_array      text[],
  from_address          text,
  to_addresses          text[],
  cc_addresses          text[],
  subject               text,
  date                  timestamptz,
  body_text             text,
  body_html             text,
  has_attachments       boolean     NOT NULL DEFAULT false,
  attachment_metadata   jsonb,
  pre_filter_label      text        CHECK (pre_filter_label IS NULL OR pre_filter_label IN (
                                      'content', 'short_reply', 'notification',
                                      'newsletter', 'private', 'unclear'
                                    )),
  pre_filter_confidence numeric(3, 2),
  pre_filter_corrected  boolean     NOT NULL DEFAULT false,
  pii_redacted          boolean     NOT NULL DEFAULT false,
  thread_id             uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_message_bulk_run
  ON public.email_message(bulk_run_id);
CREATE INDEX IF NOT EXISTS idx_email_message_thread
  ON public.email_message(thread_id)
  WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_message_message_id
  ON public.email_message(message_id);
CREATE INDEX IF NOT EXISTS idx_email_message_tenant
  ON public.email_message(tenant_id);

RAISE NOTICE 'MIG-051/106: email_message table + indexes ensured';

-- =============================================================================
-- 4. email_thread — Thread-Aggregation + Pseudonyme + Redacted-Body
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_thread (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  bulk_run_id            uuid        NOT NULL REFERENCES public.email_bulk_run ON DELETE CASCADE,
  root_message_id        text        NOT NULL,
  subject                text,
  email_count            integer     NOT NULL DEFAULT 0,
  first_date             timestamptz,
  last_date              timestamptz,
  participant_pseudonyms jsonb,
  redacted_body          text,
  thread_status          text        NOT NULL DEFAULT 'aggregated'
                                     CHECK (thread_status IN (
                                       'aggregated', 'redacting', 'redacted', 'failed'
                                     )),
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_thread_bulk_run
  ON public.email_thread(bulk_run_id);
CREATE INDEX IF NOT EXISTS idx_email_thread_tenant
  ON public.email_thread(tenant_id);

-- Late-Binding FK fuer email_message.thread_id (DEC-177 Pattern)
ALTER TABLE public.email_message
  DROP CONSTRAINT IF EXISTS fk_email_message_thread;
ALTER TABLE public.email_message
  ADD CONSTRAINT fk_email_message_thread
  FOREIGN KEY (thread_id) REFERENCES public.email_thread ON DELETE SET NULL;

RAISE NOTICE 'MIG-051/106: email_thread table + indexes + late-binding FK ensured';

-- =============================================================================
-- 5. email_pattern — Curation-Layer (Pattern-Cards aus Pattern-Extraktion)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_pattern (
  id                         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid          NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  bulk_run_id                uuid          NOT NULL REFERENCES public.email_bulk_run ON DELETE CASCADE,
  thread_id                  uuid          NOT NULL REFERENCES public.email_thread ON DELETE CASCADE,
  title                      text          NOT NULL,
  description                text          NOT NULL,
  evidence_snippets          jsonb,
  themes                     text[],
  confidence                 numeric(3, 2) NOT NULL,
  suggested_section          text,
  curation_status            text          NOT NULL DEFAULT 'pending_curation'
                                           CHECK (curation_status IN (
                                             'pending_curation', 'accepted', 'rejected', 'edited'
                                           )),
  curated_section            text,
  curator_user_id            uuid          REFERENCES auth.users,
  curated_at                 timestamptz,
  imported_to_handbook_at    timestamptz,
  imported_knowledge_unit_id uuid          REFERENCES public.knowledge_unit ON DELETE SET NULL,
  created_at                 timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_pattern_bulk_run
  ON public.email_pattern(bulk_run_id);
CREATE INDEX IF NOT EXISTS idx_email_pattern_curation
  ON public.email_pattern(bulk_run_id, curation_status);
CREATE INDEX IF NOT EXISTS idx_email_pattern_tenant
  ON public.email_pattern(tenant_id);

RAISE NOTICE 'MIG-051/106: email_pattern table + indexes ensured';

-- =============================================================================
-- 6. RLS auf 4 Tabellen — ENABLE + Policy-Matrix
-- =============================================================================

ALTER TABLE public.email_bulk_run  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_message   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_thread    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_pattern   ENABLE ROW LEVEL SECURITY;

-- 6a. email_bulk_run policies ------------------------------------------------

DROP POLICY IF EXISTS email_bulk_run_admin_select   ON public.email_bulk_run;
DROP POLICY IF EXISTS email_bulk_run_tenant_select  ON public.email_bulk_run;
DROP POLICY IF EXISTS email_bulk_run_tenant_insert  ON public.email_bulk_run;
DROP POLICY IF EXISTS email_bulk_run_tenant_update  ON public.email_bulk_run;

CREATE POLICY email_bulk_run_admin_select ON public.email_bulk_run
  FOR SELECT
  USING (auth.user_role() = 'strategaize_admin');

CREATE POLICY email_bulk_run_tenant_select ON public.email_bulk_run
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_bulk_run_tenant_insert ON public.email_bulk_run
  FOR INSERT
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_bulk_run_tenant_update ON public.email_bulk_run
  FOR UPDATE
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- 6b. email_message policies -------------------------------------------------

DROP POLICY IF EXISTS email_message_admin_select   ON public.email_message;
DROP POLICY IF EXISTS email_message_tenant_select  ON public.email_message;
DROP POLICY IF EXISTS email_message_tenant_insert  ON public.email_message;
DROP POLICY IF EXISTS email_message_tenant_update  ON public.email_message;

CREATE POLICY email_message_admin_select ON public.email_message
  FOR SELECT
  USING (auth.user_role() = 'strategaize_admin');

CREATE POLICY email_message_tenant_select ON public.email_message
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_message_tenant_insert ON public.email_message
  FOR INSERT
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_message_tenant_update ON public.email_message
  FOR UPDATE
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- 6c. email_thread policies --------------------------------------------------

DROP POLICY IF EXISTS email_thread_admin_select   ON public.email_thread;
DROP POLICY IF EXISTS email_thread_tenant_select  ON public.email_thread;
DROP POLICY IF EXISTS email_thread_tenant_insert  ON public.email_thread;
DROP POLICY IF EXISTS email_thread_tenant_update  ON public.email_thread;

CREATE POLICY email_thread_admin_select ON public.email_thread
  FOR SELECT
  USING (auth.user_role() = 'strategaize_admin');

CREATE POLICY email_thread_tenant_select ON public.email_thread
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_thread_tenant_insert ON public.email_thread
  FOR INSERT
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_thread_tenant_update ON public.email_thread
  FOR UPDATE
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- 6d. email_pattern policies -------------------------------------------------

DROP POLICY IF EXISTS email_pattern_admin_select   ON public.email_pattern;
DROP POLICY IF EXISTS email_pattern_tenant_select  ON public.email_pattern;
DROP POLICY IF EXISTS email_pattern_tenant_insert  ON public.email_pattern;
DROP POLICY IF EXISTS email_pattern_tenant_update  ON public.email_pattern;

CREATE POLICY email_pattern_admin_select ON public.email_pattern
  FOR SELECT
  USING (auth.user_role() = 'strategaize_admin');

CREATE POLICY email_pattern_tenant_select ON public.email_pattern
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_pattern_tenant_insert ON public.email_pattern
  FOR INSERT
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_pattern_tenant_update ON public.email_pattern
  FOR UPDATE
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

RAISE NOTICE 'MIG-051/106: RLS policies on 4 tables created (16 policies total)';

-- =============================================================================
-- 7. GRANTs auf authenticated + service_role
-- =============================================================================

GRANT ALL ON public.email_bulk_run TO authenticated;
GRANT ALL ON public.email_bulk_run TO service_role;
GRANT ALL ON public.email_message  TO authenticated;
GRANT ALL ON public.email_message  TO service_role;
GRANT ALL ON public.email_thread   TO authenticated;
GRANT ALL ON public.email_thread   TO service_role;
GRANT ALL ON public.email_pattern  TO authenticated;
GRANT ALL ON public.email_pattern  TO service_role;

RAISE NOTICE 'MIG-051/106: GRANTs applied to authenticated + service_role';

-- =============================================================================
-- 8. updated_at trigger fuer email_bulk_run
-- =============================================================================
-- (email_message hat keinen updated_at — append-only nach Initial-INSERT,
-- spaeter UPDATEs nur fuer pre_filter_label/thread_id/pii_redacted Spalten.
-- email_thread + email_pattern haben kein updated_at.)

DROP TRIGGER IF EXISTS email_bulk_run_updated_at ON public.email_bulk_run;
CREATE TRIGGER email_bulk_run_updated_at
  BEFORE UPDATE ON public.email_bulk_run
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

RAISE NOTICE 'MIG-051/106: email_bulk_run.updated_at trigger created';

END $mig051$;

-- =============================================================================
-- 9. View vw_bulk_email_cost_monthly (ausserhalb DO-Block — CREATE VIEW
--    funktioniert nicht in DO $$ ... END $$ ohne EXECUTE)
-- =============================================================================
-- Tenant-Monats-Cap-Enforcement (DEC-182). RLS erbt aus email_bulk_run.

CREATE OR REPLACE VIEW public.vw_bulk_email_cost_monthly AS
  SELECT
    tenant_id,
    date_trunc('month', created_at) AS month,
    SUM(total_cost_eur)             AS total_cost_eur,
    COUNT(*)                        AS run_count
  FROM public.email_bulk_run
  WHERE status != 'failed'
  GROUP BY tenant_id, date_trunc('month', created_at);

GRANT SELECT ON public.vw_bulk_email_cost_monthly TO authenticated;
GRANT SELECT ON public.vw_bulk_email_cost_monthly TO service_role;

-- =============================================================================
-- 10. Storage-Bucket `bulk-email` + 3 Storage-RLS-Policies (DEC-183)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bulk-email',
  'bulk-email',
  false,
  -- 500 MB Hard-Cap pro File (Soft-Check JS-Side, hier defensiv Hard-Cap).
  -- Multi-File-Upload pro Run wird vom Caller orchestriert.
  524288000,
  -- mailparser akzeptiert generische application/mbox + message/rfc822 (.eml).
  -- application/octet-stream toleriert, weil Browser bei .mbox oft so labelt.
  ARRAY['application/mbox', 'message/rfc822', 'application/octet-stream', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- Storage-RLS-Policies analog evidence-Bucket-Pattern (V2 SLC-018, MIG-044) /
-- walkthroughs-Bucket (V5 MIG-031/084).

-- INSERT: Pfad-Praefix muss tenant_id des aufnehmenden Users sein.
DROP POLICY IF EXISTS bulk_email_bucket_insert ON storage.objects;
CREATE POLICY bulk_email_bucket_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'bulk-email'
    AND auth.user_role() = 'tenant_admin'
    AND (storage.foldername(name))[1] = auth.user_tenant_id()::text
  );

-- SELECT: tenant_admin (eigener Tenant via Pfad-Praefix) oder strategaize_admin
-- (Cross-Tenant Auto-Delete-Cron / Audit).
DROP POLICY IF EXISTS bulk_email_bucket_select ON storage.objects;
CREATE POLICY bulk_email_bucket_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'bulk-email'
    AND (
      auth.user_role() = 'strategaize_admin'
      OR (
        auth.user_role() = 'tenant_admin'
        AND (storage.foldername(name))[1] = auth.user_tenant_id()::text
      )
    )
  );

-- DELETE: nur strategaize_admin (Lifecycle + Auto-Delete-Cron V9.1+).
-- service_role (Worker-Background-Jobs) umgeht via BYPASSRLS.
DROP POLICY IF EXISTS bulk_email_bucket_delete ON storage.objects;
CREATE POLICY bulk_email_bucket_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'bulk-email'
    AND auth.user_role() = 'strategaize_admin'
  );

COMMIT;
