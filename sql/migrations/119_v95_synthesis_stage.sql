-- MIG-111 / V9.5 SLC-V9.5-B MT-1 — Synthese-Stage Schema (Cross-Thread-Synthese)
--
-- Slice: slices/SLC-V9.5-B-synthesis-stage-backend.md (MT-1)
-- Feature: FEAT-080  Backlog: BL-159
-- DECs: DEC-214 (neue Tabelle email_synthesized_unit), DEC-215 (Partition nach
--       suggested_section), DEC-216 (bounded, Persist-Filter evidence>=2),
--       DEC-217 (synthesis_cost_eur + total_cost_eur GENERATED-Rebuild + Live-Cap)
--
-- Was diese Migration tut:
--   1. email_bulk_run.status CHECK Drop+Add: 16 LIVE-Werte + 'synthesizing' +
--      'synthesized' = 18.
--   2. ADD COLUMN synthesis_cost_eur numeric(8,4) NOT NULL DEFAULT 0.
--   3. DROP+RECREATE der GENERATED-Spalte total_cost_eur auf
--      (pre_filter + pattern_extraction + synthesis) STORED. Eine generierte
--      Spalte kann ihren Ausdruck NICHT per ALTER aendern → drop+re-add.
--   4. ai_cost_ledger.role CHECK + ai_jobs.job_type CHECK je um 'email_bulk_synthesis'
--      erweitert (sonst schlaegt der Cost-Ledger-INSERT bzw. das Enqueue der
--      Synthese-Job-Row silently/FK-frei mit CHECK-Violation fehl).
--   5. CREATE TABLE email_synthesized_unit (curierbare Felder gespiegelt von
--      email_pattern + Aggregat-Felder) + email_synthesized_unit_source
--      (Provenance-Join).
--   6. RLS-Matrix analog MIG-106 (strategaize_admin cross-tenant SELECT;
--      tenant_admin own-tenant SELECT/INSERT/UPDATE) + GRANTs + Indizes.
--
-- ───────────────────────────────────────────────────────────────────────────
-- R-B-1 (BLOCKING) — LIVE-Stand-Verifikation VOR dem Schreiben (2026-06-12):
--   `SELECT pg_get_constraintdef(...)` gegen die Coolify-DB ergab:
--   - email_bulk_run_status_check 16 Werte: uploaded, parsing, parsed,
--     pre_filtering, pre_filtered, thread_redacting, thread_redacted,
--     pattern_extracting, pattern_extracted, curating, importing, completed,
--     failed, continuous, paused, awaiting_approval (V9.1 MIG-113/117/118
--     ergaenzten continuous/paused/awaiting_approval ueber MIG-106's 13).
--   - total_cost_eur GENERATED ALWAYS AS
--     (pre_filter_cost_eur + pattern_extraction_cost_eur).
--   - Zwei Views haengen an total_cost_eur: vw_bulk_email_cost_monthly +
--     vw_bulk_email_cost_daily (beide security_invoker=true, SELECT an
--     authenticated + service_role). Sie MUESSEN vor dem Column-Drop gedroppt
--     und danach identisch neu angelegt werden.
--   Der CHECK-/GENERATED-Rebuild geht vom LIVE-Stand aus, NICHT von MIG-106.
--
-- Apply-Pattern (per .claude/rules/sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/119_v95_synthesis_stage.sql                 (lokal)
--   echo '<BASE64>' | base64 -d > /tmp/119_v95.sql                         (server)
--   docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) \
--     psql -U postgres -d postgres < /tmp/119_v95.sql
--
-- Verifikation post-LIVE:
--   \d email_bulk_run            (18-Werte-CHECK + neue GENERATED-Expr)
--   \d email_synthesized_unit
--   \d email_synthesized_unit_source
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conname IN ('ai_cost_ledger_role_check','ai_jobs_job_type_check');
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- =============================================================================
-- 1. email_bulk_run.status CHECK — 16 LIVE-Werte + synthesizing + synthesized
-- =============================================================================

ALTER TABLE public.email_bulk_run
  DROP CONSTRAINT IF EXISTS email_bulk_run_status_check;

ALTER TABLE public.email_bulk_run
  ADD CONSTRAINT email_bulk_run_status_check
  CHECK (status = ANY (ARRAY[
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
    'continuous',
    'paused',
    'awaiting_approval',
    'synthesizing',     -- V9.5 SLC-V9.5-B (neu)
    'synthesized'       -- V9.5 SLC-V9.5-B (neu)
  ]));

-- =============================================================================
-- 2. synthesis_cost_eur + total_cost_eur GENERATED-Rebuild (DEC-217)
--    Eine generierte Spalte kann ihren Ausdruck nicht per ALTER aendern →
--    Views droppen, Spalte drop+re-add, Views identisch neu anlegen.
-- =============================================================================

ALTER TABLE public.email_bulk_run
  ADD COLUMN IF NOT EXISTS synthesis_cost_eur numeric(8, 4) NOT NULL DEFAULT 0;

-- 2a. Abhaengige Views droppen (haengen an total_cost_eur).
DROP VIEW IF EXISTS public.vw_bulk_email_cost_monthly;
DROP VIEW IF EXISTS public.vw_bulk_email_cost_daily;

-- 2b. GENERATED-Spalte drop+re-add mit erweitertem Ausdruck.
ALTER TABLE public.email_bulk_run
  DROP COLUMN IF EXISTS total_cost_eur;

ALTER TABLE public.email_bulk_run
  ADD COLUMN total_cost_eur numeric
  GENERATED ALWAYS AS (
    pre_filter_cost_eur + pattern_extraction_cost_eur + synthesis_cost_eur
  ) STORED;

-- 2c. Views identisch zum LIVE-Stand neu anlegen (security_invoker=true).
CREATE VIEW public.vw_bulk_email_cost_monthly
  WITH (security_invoker = true) AS
  SELECT
    email_bulk_run.tenant_id,
    (date_trunc('month'::text, email_bulk_run.created_at))::date AS month,
    (sum(email_bulk_run.total_cost_eur))::numeric(12, 4) AS total_cost_eur,
    (count(*))::integer AS run_count
  FROM public.email_bulk_run
  WHERE email_bulk_run.status <> 'failed'::text
  GROUP BY email_bulk_run.tenant_id,
           (date_trunc('month'::text, email_bulk_run.created_at));

CREATE VIEW public.vw_bulk_email_cost_daily
  WITH (security_invoker = true) AS
  SELECT
    email_bulk_run.tenant_id,
    (date_trunc('day'::text, email_bulk_run.created_at))::date AS day,
    (sum(email_bulk_run.total_cost_eur))::numeric(12, 4) AS total_cost_eur,
    (count(*))::integer AS run_count
  FROM public.email_bulk_run
  WHERE email_bulk_run.status <> 'failed'::text
  GROUP BY email_bulk_run.tenant_id,
           (date_trunc('day'::text, email_bulk_run.created_at));

GRANT SELECT ON public.vw_bulk_email_cost_monthly TO authenticated;
GRANT SELECT ON public.vw_bulk_email_cost_monthly TO service_role;
GRANT SELECT ON public.vw_bulk_email_cost_daily TO authenticated;
GRANT SELECT ON public.vw_bulk_email_cost_daily TO service_role;

-- =============================================================================
-- 3. ai_cost_ledger.role + ai_jobs.job_type — 'email_bulk_synthesis' ergaenzen
--    (LIVE-Listen 1:1 uebernommen + neuer Wert; sonst CHECK-Violation beim
--     Cost-Ledger-INSERT / beim Enqueue der Synthese-Job-Row.)
-- =============================================================================

ALTER TABLE public.ai_cost_ledger
  DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check;

ALTER TABLE public.ai_cost_ledger
  ADD CONSTRAINT ai_cost_ledger_role_check
  CHECK (role IS NULL OR role = ANY (ARRAY[
    'analyst', 'challenger', 'chat', 'memory', 'embedding', 'orchestrator',
    'sop_generator', 'diagnosis_generator', 'evidence_mapper',
    'dialogue_extractor', 'bridge_engine', 'walkthrough_pii_redactor',
    'walkthrough_step_extractor', 'walkthrough_subtopic_mapper',
    'light_pipeline_block', 'v8_1_augmentation', 'email_bulk_pre_filter',
    'email_bulk_pii_redact', 'email_bulk_pattern_extraction',
    'email_bulk_synthesis'     -- V9.5 SLC-V9.5-B (neu)
  ]));

ALTER TABLE public.ai_jobs
  DROP CONSTRAINT IF EXISTS ai_jobs_job_type_check;

ALTER TABLE public.ai_jobs
  ADD CONSTRAINT ai_jobs_job_type_check
  CHECK (job_type = ANY (ARRAY[
    'bridge_generation', 'diagnosis_generation', 'dialogue_extraction',
    'dialogue_transcription', 'evidence_extraction',
    'handbook_snapshot_generation', 'knowledge_unit_condensation',
    'recondense_with_gaps', 'sop_generation', 'walkthrough_extract_steps',
    'walkthrough_map_subtopics', 'walkthrough_redact_pii',
    'walkthrough_stub_processing', 'walkthrough_transcribe', 'lead_push_retry',
    'email_bulk_parse', 'email_bulk_pre_filter', 'email_bulk_thread_redact',
    'email_bulk_pattern_extract', 'email_bulk_pipeline_trigger',
    'email_bulk_retention_sweep',
    'email_bulk_synthesis'     -- V9.5 SLC-V9.5-B (neu)
  ]));

-- =============================================================================
-- 4. email_synthesized_unit — konsolidierte Cross-Thread-Units (Curation-Layer)
--    Spiegelt die curierbaren email_pattern-Felder + Aggregat-Felder (DEC-214).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_synthesized_unit (
  id                         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid          NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  bulk_run_id                uuid          NOT NULL REFERENCES public.email_bulk_run ON DELETE CASCADE,
  title                      text          NOT NULL,
  description                text          NOT NULL,
  evidence_snippets          jsonb,
  themes                     text[],
  suggested_section          text,
  aggregated_confidence      numeric(3, 2),
  evidence_count             integer       NOT NULL,
  source_pattern_ids         uuid[],
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

CREATE INDEX IF NOT EXISTS idx_email_synthesized_unit_bulk_run
  ON public.email_synthesized_unit(bulk_run_id);
CREATE INDEX IF NOT EXISTS idx_email_synthesized_unit_curation
  ON public.email_synthesized_unit(bulk_run_id, curation_status);
CREATE INDEX IF NOT EXISTS idx_email_synthesized_unit_tenant
  ON public.email_synthesized_unit(tenant_id);

-- =============================================================================
-- 5. email_synthesized_unit_source — Provenance-Join (1 Row pro belegendem Pattern)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_synthesized_unit_source (
  id                  uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  synthesized_unit_id uuid  NOT NULL REFERENCES public.email_synthesized_unit ON DELETE CASCADE,
  pattern_id          uuid  NOT NULL REFERENCES public.email_pattern ON DELETE CASCADE,
  thread_id           uuid,
  tenant_id           uuid  NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  UNIQUE (synthesized_unit_id, pattern_id)
);

CREATE INDEX IF NOT EXISTS idx_email_synthesized_unit_source_unit
  ON public.email_synthesized_unit_source(synthesized_unit_id);
CREATE INDEX IF NOT EXISTS idx_email_synthesized_unit_source_pattern
  ON public.email_synthesized_unit_source(pattern_id);
CREATE INDEX IF NOT EXISTS idx_email_synthesized_unit_source_tenant
  ON public.email_synthesized_unit_source(tenant_id);

-- =============================================================================
-- 6. RLS — analog MIG-106-Matrix (ENABLE, kein FORCE — wie email_pattern)
-- =============================================================================

ALTER TABLE public.email_synthesized_unit        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_synthesized_unit_source ENABLE ROW LEVEL SECURITY;

-- 6a. email_synthesized_unit policies ----------------------------------------

DROP POLICY IF EXISTS email_synthesized_unit_admin_select  ON public.email_synthesized_unit;
DROP POLICY IF EXISTS email_synthesized_unit_tenant_select ON public.email_synthesized_unit;
DROP POLICY IF EXISTS email_synthesized_unit_tenant_insert ON public.email_synthesized_unit;
DROP POLICY IF EXISTS email_synthesized_unit_tenant_update ON public.email_synthesized_unit;

CREATE POLICY email_synthesized_unit_admin_select ON public.email_synthesized_unit
  FOR SELECT
  USING (auth.user_role() = 'strategaize_admin');

CREATE POLICY email_synthesized_unit_tenant_select ON public.email_synthesized_unit
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_synthesized_unit_tenant_insert ON public.email_synthesized_unit
  FOR INSERT
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_synthesized_unit_tenant_update ON public.email_synthesized_unit
  FOR UPDATE
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- 6b. email_synthesized_unit_source policies ---------------------------------

DROP POLICY IF EXISTS email_synthesized_unit_source_admin_select  ON public.email_synthesized_unit_source;
DROP POLICY IF EXISTS email_synthesized_unit_source_tenant_select ON public.email_synthesized_unit_source;
DROP POLICY IF EXISTS email_synthesized_unit_source_tenant_insert ON public.email_synthesized_unit_source;
DROP POLICY IF EXISTS email_synthesized_unit_source_tenant_update ON public.email_synthesized_unit_source;

CREATE POLICY email_synthesized_unit_source_admin_select ON public.email_synthesized_unit_source
  FOR SELECT
  USING (auth.user_role() = 'strategaize_admin');

CREATE POLICY email_synthesized_unit_source_tenant_select ON public.email_synthesized_unit_source
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_synthesized_unit_source_tenant_insert ON public.email_synthesized_unit_source
  FOR INSERT
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY email_synthesized_unit_source_tenant_update ON public.email_synthesized_unit_source
  FOR UPDATE
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- =============================================================================
-- 7. GRANTs — authenticated + service_role (RLS bleibt die Tenant-Bremse)
-- =============================================================================

GRANT ALL ON public.email_synthesized_unit        TO authenticated;
GRANT ALL ON public.email_synthesized_unit        TO service_role;
GRANT ALL ON public.email_synthesized_unit_source  TO authenticated;
GRANT ALL ON public.email_synthesized_unit_source  TO service_role;

COMMIT;
