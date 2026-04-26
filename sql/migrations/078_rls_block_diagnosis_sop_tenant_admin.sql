-- Migration 078: Tighten RLS for block_diagnosis + sop to tenant_admin-only
-- SLC-037 /qa Phase 2 — R16-Mitigation Vervollstaendigung
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)
--
-- ZIEL
-- ====
-- Die V2-Policies block_diagnosis_tenant_read und sop_tenant_read pruefen nur
-- tenant_id, aber keinen Rollen-Check. Damit duerfen tenant_member UND employee
-- (innerhalb desselben Tenants) lesen — was R16 verletzt: ein eingeloggter
-- Mitarbeiter koennte Diagnose-Inhalte zur eigenen Block-Submission ueber eine
-- Server-Action laden, obwohl Q27 explizit sagt "Employee sieht die resultierende
-- Diagnose NICHT".
--
-- V4-Pattern: Andere V4-Tabellen (handbook_snapshot, bridge_run, bridge_proposal,
-- employee_invitation) haben bereits *_tenant_admin_rw mit explizitem Rollen-Check.
-- Diese Migration zieht block_diagnosis und sop auf das gleiche Niveau.
--
-- WIRKUNG
-- =======
-- - tenant_admin: kann weiterhin SELECT (im eigenen Tenant) — unveraendert
-- - tenant_member: kein SELECT mehr — vorher erlaubt, jetzt 0 rows
-- - employee: kein SELECT mehr — vorher erlaubt, jetzt 0 rows (R16-Fix)
-- - strategaize_admin: kann weiterhin alles (admin_full Policy unveraendert)
-- - Worker/Server-Code: nutzt createAdminClient (service_role, RLS-Bypass) —
--   keine Auswirkung auf den AI-Pipeline-Schreibpfad
--
-- VERIFIKATION
-- ============
-- Nach Apply: src/__tests__/rls/v4-perimeter-matrix.test.ts vollstaendig gruen
-- (4 Tests fuer block_diagnosis + 4 Tests fuer sop, plus 2 R16-PASS-Tests).

BEGIN;

-- =============================================
-- block_diagnosis
-- =============================================

DROP POLICY IF EXISTS block_diagnosis_tenant_read ON public.block_diagnosis;

CREATE POLICY block_diagnosis_tenant_admin_read
  ON public.block_diagnosis
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- =============================================
-- sop
-- =============================================

DROP POLICY IF EXISTS sop_tenant_read ON public.sop;

CREATE POLICY sop_tenant_admin_read
  ON public.sop
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

COMMIT;
