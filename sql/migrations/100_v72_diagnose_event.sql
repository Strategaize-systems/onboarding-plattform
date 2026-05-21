-- Migration 100: V7.2 Diagnose-Funnel-Telemetrie (diagnose_event)
-- SLC-139 MT-1 (FEAT-058, MIG-046) — DEC-147 Telemetrie-Sampling (V7.1 architecture)
--
-- ZIEL
-- ====
-- 1) Neue Tabelle `public.diagnose_event` als Funnel-Event-Log fuer Diagnose-Werkzeug.
--    Tracks: capture_session_id, tenant_id, partner_org_id (NULL fuer direct_client),
--    event_type ENUM (9 Werte), question_key (NULL bei session_*-Events),
--    payload jsonb, is_test boolean DEFAULT false, created_at.
-- 2) 3 Indices fuer Lookup-Pfade:
--    - (capture_session_id, created_at) → Session-Timeline-Query.
--    - (tenant_id, event_type, created_at) → Aggregations-Query nach Event-Type.
--    - (partner_org_id, created_at) WHERE NOT NULL → Partner-Scope-Query.
-- 3) RLS:
--    - strategaize_admin SELECT alles.
--    - partner_admin SELECT nur Events mit partner_org_id = auth.user_tenant_id()
--      (partner_admin-User hat tenant_id = partner-tenant-id, partner_org_id im
--      Event entspricht parent_partner_tenant_id der Client-Session).
--    - authenticated INSERT mit tenant_id = auth.user_tenant_id() (Server setzt
--      tenant_id aus Auth-Session, RLS verifiziert Match).
-- 4) GRANTs auf authenticated + partner_admin + service_role.
--
-- DSGVO-DATENSPARSAMKEIT (per FEAT-058 Out-of-Scope-Klausel)
-- =========================================================
-- - Event-Payload enthaelt KEIN Klartext-PII (keine Antwort-Inhalte, Emails, IPs).
-- - question_key + event_type sind aussage-arme Strings, kein Personenbezug.
-- - capture_session_id ist UUID, nicht zurueckfuehrbar ohne capture_session-Join.
-- - 5-Sessions-Aggregations-Schwelle ist Analytics-Page-Pflicht (SLC-139 MT-5),
--   nicht Schema-Layer.
--
-- 9 EVENT-TYPES (per Spec Section "In Scope" + MT-2)
-- ==================================================
-- question_start    — beim Render einer Frage in Diagnose-Run-Page.
-- question_answer   — beim Submit einer Antwort.
-- question_skip     — beim Klick auf Skip-Button (falls implementiert).
-- helper_text_open  — beim Klick auf Info-Icon einer Frage (SLC-138 Wiring).
-- session_paused    — bei visibilitychange auf hidden + beforeunload-Flush.
-- session_resumed   — bei visibilitychange auf visible nach pause.
-- session_abandoned — vom 30min-Detector (on-demand-Query in Analytics-Page MT-6).
-- session_completed — beim Render der Bericht-Page nach erstem Submit.
-- session_heartbeat — 5s-Interval solange Tab aktiv (Time-on-Question-Berechnung).
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/100_v72_diagnose_event.sql
--   echo '<BASE64>' | base64 -d > /tmp/100_v72.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/100_v72.sql
--   docker exec <db-container> psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema'"
--
-- IDEMPOTENZ
-- ==========
-- CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS + DROP POLICY IF
-- EXISTS + CREATE POLICY. Zweiter Apply ist No-Op.
--
-- VERIFIKATION
-- ============
--   \d diagnose_event
--     → 9 Spalten, CHECK-Constraint diagnose_event_event_type_check (9 Werte),
--       3 Indices, FK capture_session_id → capture_session(id) ON DELETE CASCADE,
--       FK tenant_id → tenants(id) ON DELETE CASCADE, RLS enabled.
--   SELECT polname FROM pg_policies WHERE tablename = 'diagnose_event';
--     → 3 Policies (strategaize_admin_all, partner_admin_select_own,
--       authenticated_insert_own_tenant).

BEGIN;

-- 1. diagnose_event-Tabelle anlegen
CREATE TABLE IF NOT EXISTS public.diagnose_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_session_id uuid NOT NULL REFERENCES public.capture_session(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_org_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  question_key text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diagnose_event_event_type_check CHECK (event_type IN (
    'question_start',
    'question_answer',
    'question_skip',
    'helper_text_open',
    'session_paused',
    'session_resumed',
    'session_abandoned',
    'session_completed',
    'session_heartbeat'
  ))
);

-- 2. Indices fuer Session-Timeline + Aggregations + Partner-Scope
CREATE INDEX IF NOT EXISTS idx_diagnose_event_session_time
  ON public.diagnose_event (capture_session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_diagnose_event_tenant_type_time
  ON public.diagnose_event (tenant_id, event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_diagnose_event_partner_org_time
  ON public.diagnose_event (partner_org_id, created_at)
  WHERE partner_org_id IS NOT NULL;

-- 3. RLS aktivieren + Policies
ALTER TABLE public.diagnose_event ENABLE ROW LEVEL SECURITY;

-- 3a. strategaize_admin Full-Access (analog Migration 090 Pattern)
DROP POLICY IF EXISTS diagnose_event_all_strategaize_admin ON public.diagnose_event;
CREATE POLICY diagnose_event_all_strategaize_admin ON public.diagnose_event
  FOR ALL TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- 3b. partner_admin SELECT nur Events mit eigener Partner-Org
DROP POLICY IF EXISTS diagnose_event_select_partner_admin ON public.diagnose_event;
CREATE POLICY diagnose_event_select_partner_admin ON public.diagnose_event
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND partner_org_id = auth.user_tenant_id()
  );

-- 3c. authenticated INSERT mit own-tenant CHECK (Server setzt tenant_id aus Auth)
DROP POLICY IF EXISTS diagnose_event_insert_own_tenant ON public.diagnose_event;
CREATE POLICY diagnose_event_insert_own_tenant ON public.diagnose_event
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = auth.user_tenant_id());

-- 4. GRANTs
GRANT SELECT, INSERT ON public.diagnose_event TO authenticated;
GRANT SELECT         ON public.diagnose_event TO partner_admin;
GRANT ALL            ON public.diagnose_event TO service_role;

COMMIT;
