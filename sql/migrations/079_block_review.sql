-- Migration 079: block_review-Tabelle + RLS + Indizes + Backfill + Insert-Trigger
-- SLC-041 MT-1 — V4.1 FEAT-029 Berater-Review-Workflow (MIG-028)
-- DEC-044 (Block-Approval-Granularitaet), DEC-048 (Backfill-Strategie + Soft-Fail), DEC-050 (single-row Audit)
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)
--
-- Scope:
--   1. Neue Tabelle public.block_review als Single-Source-of-Truth fuer Berater-Approval
--   2. RLS: SELECT fuer strategaize_admin (cross-tenant) + tenant_admin (own tenant);
--      INSERT/UPDATE/DELETE nur strategaize_admin (Approval-Hoheit). Default-deny fuer
--      tenant_member + employee.
--   3. 2 Indizes: status_created (partial pending) + tenant_status
--   4. Backfill: alle bestehenden (tenant, session, block) mit source='employee_questionnaire'
--      KUs werden auf 'approved' gesetzt (Backwards-Compat).
--   5. Trigger ON INSERT in capture_events:
--      - Pruefe ob NEW.event_type = 'answer_submitted' und session.capture_mode = 'employee_questionnaire'
--      - Falls ja: INSERT block_review (..., 'pending') ON CONFLICT DO NOTHING
--      - Soft-Fail: BEGIN/EXCEPTION-Wrap, RAISE WARNING bei Fehler — kein Block des
--        capture_events-Inserts (DEC-048 Soft-Fail-Strategie)
--   6. ALTER handbook_snapshot ADD COLUMN metadata jsonb (fuer Audit-Counter aus Worker-Pre-Filter)

BEGIN;

-- =============================================
-- 1. block_review Tabelle
-- =============================================
CREATE TABLE IF NOT EXISTS public.block_review (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES public.capture_session(id) ON DELETE CASCADE,
  block_key             text        NOT NULL,
  status                text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at           timestamptz,
  note                  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, capture_session_id, block_key)
);

COMMENT ON TABLE public.block_review IS
  'Single-Source-of-Truth fuer Berater-Approval pro (tenant, session, block). V4.1 FEAT-029.';

-- =============================================
-- 2. Indizes
-- =============================================
-- Cross-Tenant-Reviews-Sicht (status='pending'-Liste, oldest-first)
CREATE INDEX IF NOT EXISTS idx_block_review_status_created
  ON public.block_review (status, created_at)
  WHERE status = 'pending';

-- Pro-Tenant-Aggregation (Badge-Counts in /admin/tenants)
CREATE INDEX IF NOT EXISTS idx_block_review_tenant_status
  ON public.block_review (tenant_id, status);

-- =============================================
-- 3. RLS aktivieren + Policies
-- =============================================
ALTER TABLE public.block_review ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: vollzugriff cross-tenant
DROP POLICY IF EXISTS block_review_admin_full ON public.block_review;
CREATE POLICY block_review_admin_full ON public.block_review
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant_admin: NUR SELECT auf eigenen Tenant (keine Approval-Hoheit)
DROP POLICY IF EXISTS block_review_tenant_admin_select ON public.block_review;
CREATE POLICY block_review_tenant_admin_select ON public.block_review
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- KEINE Policy fuer tenant_member oder employee = RLS-Default-Deny

-- =============================================
-- 4. updated_at-Trigger
-- =============================================
DROP TRIGGER IF EXISTS set_block_review_updated_at ON public.block_review;
CREATE TRIGGER set_block_review_updated_at
  BEFORE UPDATE ON public.block_review
  FOR EACH ROW
  EXECUTE FUNCTION public._set_updated_at();

-- =============================================
-- 5. GRANTs
-- =============================================
-- GRANT ALL TO authenticated, RLS-Policies regulieren tatsaechliche Schreibrechte
-- (analog zu Migration 070 handbook_snapshot — GRANT ALL ist V4-Standard).
GRANT ALL ON public.block_review TO authenticated;
GRANT ALL ON public.block_review TO service_role;

-- =============================================
-- 6. Backfill (DEC-048)
-- =============================================
-- Alle bestehenden (tenant, session, block) mit Mitarbeiter-KUs werden 'approved' gesetzt.
-- Idempotent durch ON CONFLICT DO NOTHING. Backwards-Compat: pre-V4.1 Snapshots laufen weiter.
INSERT INTO public.block_review (tenant_id, capture_session_id, block_key, status)
SELECT DISTINCT ku.tenant_id, ku.capture_session_id, ku.block_key, 'approved'
FROM public.knowledge_unit ku
WHERE ku.source = 'employee_questionnaire'
ON CONFLICT (tenant_id, capture_session_id, block_key) DO NOTHING;

-- =============================================
-- 7. Trigger-Function fuer ON INSERT in capture_events
-- =============================================
-- Bei neuem 'answer_submitted'-Event in einer 'employee_questionnaire'-Session
-- legt der Trigger einen 'pending' block_review-Eintrag an (idempotent via UNIQUE).
-- Soft-Fail (DEC-048): Exception im Trigger blockiert den capture_events-Insert nicht.
-- SECURITY DEFINER damit der Trigger auch unter Mitarbeiter-Rolle (authenticated)
-- in block_review schreiben kann (RLS-Default-Deny).
CREATE OR REPLACE FUNCTION public.tg_block_review_pending_on_employee_submit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $func$
DECLARE
  v_capture_mode text;
BEGIN
  BEGIN
    -- Nur 'answer_submitted'-Events triggern Review-Erstellung
    IF NEW.event_type <> 'answer_submitted' THEN
      RETURN NEW;
    END IF;

    -- Lookup Capture-Mode der Session (nur employee_questionnaire ist relevant)
    SELECT cs.capture_mode INTO v_capture_mode
    FROM public.capture_session cs
    WHERE cs.id = NEW.session_id;

    IF v_capture_mode = 'employee_questionnaire' THEN
      INSERT INTO public.block_review (tenant_id, capture_session_id, block_key, status)
      VALUES (NEW.tenant_id, NEW.session_id, NEW.block_key, 'pending')
      ON CONFLICT (tenant_id, capture_session_id, block_key) DO NOTHING;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'block_review trigger soft-fail: % SQLSTATE %', SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$func$;

COMMENT ON FUNCTION public.tg_block_review_pending_on_employee_submit() IS
  'Erzeugt pending block_review-Eintrag beim ersten Mitarbeiter-Submit pro (session, block). Soft-Fail (DEC-048).';

DROP TRIGGER IF EXISTS tg_block_review_pending_on_employee_submit
  ON public.capture_events;
CREATE TRIGGER tg_block_review_pending_on_employee_submit
  AFTER INSERT ON public.capture_events
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_block_review_pending_on_employee_submit();

-- =============================================
-- 8. handbook_snapshot.metadata (Audit-Counter aus Worker-Pre-Filter)
-- =============================================
-- Worker-Pre-Filter schreibt nach Snapshot-Generation:
--   { pending_blocks: N, approved_blocks: M, rejected_blocks: K }
-- Default '{}'::jsonb damit pre-V4.1 Snapshots weiter funktionieren.
ALTER TABLE public.handbook_snapshot
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.handbook_snapshot.metadata IS
  'Audit-Counter aus Worker-Pre-Filter: { pending_blocks, approved_blocks, rejected_blocks }. V4.1 FEAT-029.';

COMMIT;
