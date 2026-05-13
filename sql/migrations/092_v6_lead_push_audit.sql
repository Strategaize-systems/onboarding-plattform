-- Migration 092: V6 Lead-Push opt-in + Outbound Webhook + DSGVO-Audit
-- SLC-106 (FEAT-046, MIG-034 Step 3) — DEC-091, DEC-107, DEC-112
--
-- ZIEL
-- ====
-- 1) lead_push_consent-Tabelle + RLS (DSGVO-Audit: wann hat Mandant Opt-in gegeben).
-- 2) lead_push_audit-Tabelle + RLS (Send-History: jeder HTTP-Versuch + Response).
-- 3) ai_jobs.job_type CHECK-Constraint anlegen mit allen bisher in Code verwendeten
--    Werten + neu 'lead_push_retry' (Worker-Retry-Pfad).
--
-- IDEMPOTENZ
-- ==========
-- Alle DDL-Statements verwenden IF NOT EXISTS / DROP POLICY IF EXISTS / DO-Block
-- + pg_constraint-Lookup. Ein zweiter Apply ist ein No-Op.
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/092_v6_lead_push_audit.sql
--   echo '<BASE64>' | base64 -d > /tmp/092_v6.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/092_v6.sql
--
-- PRE-APPLY-BACKUP-PFLICHT
-- ========================
--   docker exec <db-container> pg_dump -U postgres -d postgres \
--     --schema-only --table=public.ai_jobs \
--     > /opt/onboarding-plattform-backups/pre-mig-034-092_$(date +%Y%m%d_%H%M%S).sql
--
-- VERIFIKATION (nach Apply)
-- =========================
--   \dt lead_push_*                              -> 2 Tabellen
--   \dp lead_push_consent                        -> 4 Policies
--   \dp lead_push_audit                          -> 4 Policies
--   \d ai_jobs                                   -> CHECK enthaelt 'lead_push_retry'
--   SELECT conname FROM pg_constraint
--     WHERE conrelid = 'public.ai_jobs'::regclass AND contype='c'
--     -> ai_jobs_status_check + ai_jobs_job_type_check

DO $mig034_step3$ BEGIN

-- ============================================================
-- 1. lead_push_consent Tabelle
-- ============================================================
-- DSGVO-Audit-Trail: Mandant hat zu Zeitpunkt X explizit "Ich will mehr von
-- Strategaize" mit Pflicht-Checkbox bestaetigt. Die Felder consent_ip +
-- consent_user_agent erfuellen rechtliche Beweispflicht (vgl. R-106-5).
-- withdrawal_at bleibt V6 immer NULL (Rueckruf-Pfad kommt in V7+).
CREATE TABLE IF NOT EXISTS public.lead_push_consent (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_session_id    uuid        NOT NULL
                                    REFERENCES public.capture_session(id) ON DELETE CASCADE,
  mandant_user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mandant_tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_tenant_id     uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  consent_given_at      timestamptz NOT NULL DEFAULT now(),
  consent_text_version  text        NOT NULL,
  consent_ip            inet        NULL,
  consent_user_agent    text        NULL,
  withdrawal_at         timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Idempotenz pro capture_session: ein Mandant kann nicht zweimal opt-in fuer
-- dieselbe Diagnose-Session geben. Server-Action prueft das vor INSERT;
-- DB-Constraint ist Defense-in-Depth.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_push_consent_session
  ON public.lead_push_consent (capture_session_id);

-- Lookup-Indizes fuer RLS-Joins
CREATE INDEX IF NOT EXISTS idx_lead_push_consent_mandant_user
  ON public.lead_push_consent (mandant_user_id);
CREATE INDEX IF NOT EXISTS idx_lead_push_consent_partner_tenant
  ON public.lead_push_consent (partner_tenant_id);

ALTER TABLE public.lead_push_consent ENABLE ROW LEVEL SECURITY;

-- Mandant liest eigene Consent-Eintraege (Status-Anzeige im Diagnose-Bericht).
DROP POLICY IF EXISTS lpc_select_own_mandant ON public.lead_push_consent;
CREATE POLICY lpc_select_own_mandant ON public.lead_push_consent
  FOR SELECT TO authenticated
  USING (mandant_user_id = auth.uid());

-- partner_admin liest Consent-Eintraege seiner Mandanten (Operations-Insight).
DROP POLICY IF EXISTS lpc_select_partner_admin ON public.lead_push_consent
;
CREATE POLICY lpc_select_partner_admin ON public.lead_push_consent
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND partner_tenant_id = auth.user_tenant_id()
  );

-- strategaize_admin Full-Access (Compliance-Audit + Operations).
DROP POLICY IF EXISTS lpc_all_strategaize_admin ON public.lead_push_consent;
CREATE POLICY lpc_all_strategaize_admin ON public.lead_push_consent
  FOR ALL TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- Mandant INSERT eigenen Consent (Server-Action-Pfad; service_role bypasst RLS,
-- aber Defense-in-Depth fuer Cases ohne service_role).
DROP POLICY IF EXISTS lpc_insert_own_mandant ON public.lead_push_consent;
CREATE POLICY lpc_insert_own_mandant ON public.lead_push_consent
  FOR INSERT TO authenticated
  WITH CHECK (mandant_user_id = auth.uid());

GRANT SELECT, INSERT         ON public.lead_push_consent TO authenticated;
GRANT SELECT                 ON public.lead_push_consent TO partner_admin;
GRANT ALL                    ON public.lead_push_consent TO service_role;

RAISE NOTICE 'MIG-034/092: lead_push_consent table + 4 policies created';

-- ============================================================
-- 2. lead_push_audit Tabelle
-- ============================================================
-- Send-History: jeder HTTP-Versuch landet hier (synchroner Initial-Push +
-- bis zu 2 Retry-Jobs). attempt_number=1 ist Initial-Versuch aus Server-Action.
-- status pending = Versuch laeuft, success = HTTP 200/201, failed = Endgueltig
-- fehlgeschlagen (entweder Retry-Job ist erschoepft oder Retry wurde nicht
-- enqueued). business_system_response_status + business_system_contact_id +
-- business_system_was_new sind Antwort-Telemetrie vom Business-System.
CREATE TABLE IF NOT EXISTS public.lead_push_audit (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id                      uuid        NOT NULL
                                              REFERENCES public.lead_push_consent(id) ON DELETE RESTRICT,
  attempted_at                    timestamptz NOT NULL DEFAULT now(),
  attempt_number                  int         NOT NULL DEFAULT 1,
  status                          text        NOT NULL DEFAULT 'pending',
  business_system_response_status int         NULL,
  business_system_contact_id      uuid        NULL,
  business_system_was_new         boolean     NULL,
  error_message                   text        NULL,
  attribution_utm_source          text        NOT NULL,
  attribution_utm_campaign        text        NOT NULL,
  attribution_utm_medium          text        NOT NULL DEFAULT 'referral',
  created_at                      timestamptz NOT NULL DEFAULT now()
);

-- Status-CHECK (idempotent via pg_constraint-Lookup, da PG <16)
IF NOT EXISTS (
  SELECT 1 FROM pg_constraint WHERE conname = 'lead_push_audit_status_check'
) THEN
  ALTER TABLE public.lead_push_audit
    ADD CONSTRAINT lead_push_audit_status_check
      CHECK (status IN ('pending', 'success', 'failed'));
END IF;

-- attempt_number-CHECK: 1..3 (DEC-112: max. 3 Versuche)
IF NOT EXISTS (
  SELECT 1 FROM pg_constraint WHERE conname = 'lead_push_audit_attempt_check'
) THEN
  ALTER TABLE public.lead_push_audit
    ADD CONSTRAINT lead_push_audit_attempt_check
      CHECK (attempt_number BETWEEN 1 AND 3);
END IF;

-- Lookup-Index fuer RLS-Joins ueber consent
CREATE INDEX IF NOT EXISTS idx_lead_push_audit_consent
  ON public.lead_push_audit (consent_id);

-- Lookup-Index fuer Worker-Retry-Pfad (audit_id ist in ai_jobs.payload)
CREATE INDEX IF NOT EXISTS idx_lead_push_audit_status_attempted
  ON public.lead_push_audit (status, attempted_at DESC);

ALTER TABLE public.lead_push_audit ENABLE ROW LEVEL SECURITY;

-- Mandant liest Audit-Eintraege seiner eigenen Consents (Status im Bericht).
DROP POLICY IF EXISTS lpa_select_own_mandant ON public.lead_push_audit;
CREATE POLICY lpa_select_own_mandant ON public.lead_push_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lead_push_consent c
       WHERE c.id = lead_push_audit.consent_id
         AND c.mandant_user_id = auth.uid()
    )
  );

-- partner_admin liest Audit-Eintraege seiner Mandanten.
DROP POLICY IF EXISTS lpa_select_partner_admin ON public.lead_push_audit;
CREATE POLICY lpa_select_partner_admin ON public.lead_push_audit
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND EXISTS (
      SELECT 1 FROM public.lead_push_consent c
       WHERE c.id = lead_push_audit.consent_id
         AND c.partner_tenant_id = auth.user_tenant_id()
    )
  );

-- strategaize_admin Full-Access (Compliance + Operations).
DROP POLICY IF EXISTS lpa_all_strategaize_admin ON public.lead_push_audit;
CREATE POLICY lpa_all_strategaize_admin ON public.lead_push_audit
  FOR ALL TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- Mandant INSERT eigenen Audit-Eintrag (Server-Action-Pfad; service_role bypasst).
DROP POLICY IF EXISTS lpa_insert_own_mandant ON public.lead_push_audit;
CREATE POLICY lpa_insert_own_mandant ON public.lead_push_audit
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lead_push_consent c
       WHERE c.id = lead_push_audit.consent_id
         AND c.mandant_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.lead_push_audit TO authenticated;
GRANT SELECT                 ON public.lead_push_audit TO partner_admin;
GRANT ALL                    ON public.lead_push_audit TO service_role;

RAISE NOTICE 'MIG-034/092: lead_push_audit table + 4 policies created';

-- ============================================================
-- 3. ai_jobs.job_type CHECK-Constraint
-- ============================================================
-- Bisher hat ai_jobs.job_type KEINEN CHECK-Constraint — d.h. free-form text.
-- V6 fuehrt CHECK ein, um typo-Schutz fuer den neuen Worker-Pfad zu geben.
-- Alle bisher in src/ und sql/ enumerierten job_type-Werte werden whitelisted
-- + neu 'lead_push_retry'.
--
-- Quelle: grep "job_type" src/ sql/ (2026-05-13 enumeration):
--   1) bridge_generation
--   2) diagnosis_generation
--   3) dialogue_extraction
--   4) dialogue_transcription
--   5) evidence_extraction
--   6) handbook_snapshot_generation
--   7) knowledge_unit_condensation
--   8) recondense_with_gaps
--   9) sop_generation
--   10) walkthrough_extract_steps
--   11) walkthrough_map_subtopics
--   12) walkthrough_redact_pii
--   13) walkthrough_stub_processing
--   14) walkthrough_transcribe
--   --- NEU SLC-106 ---
--   15) lead_push_retry
--
-- Idempotent: DROP CONSTRAINT IF EXISTS (Name) + ADD CONSTRAINT.
DECLARE
  v_constraint_name text := 'ai_jobs_job_type_check';
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = v_constraint_name
  ) THEN
    EXECUTE format('ALTER TABLE public.ai_jobs DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped ai_jobs.job_type CHECK: %', v_constraint_name;
  END IF;

  ALTER TABLE public.ai_jobs
    ADD CONSTRAINT ai_jobs_job_type_check
    CHECK (job_type IN (
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
      'lead_push_retry'
    ));

  RAISE NOTICE 'MIG-034/092: ai_jobs.job_type CHECK created with 15 values (+lead_push_retry)';
END;

END $mig034_step3$;
