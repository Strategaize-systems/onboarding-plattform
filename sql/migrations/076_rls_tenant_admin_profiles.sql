-- Migration 076: tenant_admin darf Profiles seines eigenen Tenants lesen
-- SLC-036 QA-Discovery — fehlende RLS-Policy auf public.profiles
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)
--
-- ROOT CAUSE
-- ==========
-- Vor dieser Migration hatte public.profiles nur 2 Policies:
--   1. admin_full_profiles      -> nur strategaize_admin (FOR ALL)
--   2. user_select_own_profile  -> JEDER User sieht nur sich selbst (id = auth.uid())
--
-- Konsequenz: tenant_admin konnte die Profile-Rows seiner Mitarbeiter NICHT lesen.
-- Effekt:
--   - /admin/team Aktive-Mitarbeiter-Liste war stillschweigend leer.
--   - /admin/bridge Edit-Dialog Mitarbeiter-Dropdown war leer.
--   - /admin/bridge Proposal-Karten zeigten "Noch nicht zugeordnet" auch wenn
--     proposed_employee_user_id gesetzt war (Match auf employees-Liste fand nichts).
--
-- FIX
-- ===
-- Neue Policy `tenant_admin_select_tenant_profiles`: tenant_admin darf alle
-- profiles seines eigenen Tenants lesen (employees, andere tenant_admins,
-- tenant_member). Identisch zum Pattern von bridge_run_tenant_admin_rw etc.
--
-- KEINE INSERT/UPDATE/DELETE-Erweiterung — tenant_admin bleibt READ-ONLY auf
-- fremde profiles. Profile-Erstellung fuer Employees laeuft weiterhin ueber
-- rpc_accept_employee_invitation (SECURITY DEFINER).
--
-- ROLLBACK
-- ========
-- DROP POLICY IF EXISTS tenant_admin_select_tenant_profiles ON public.profiles;

BEGIN;

DROP POLICY IF EXISTS tenant_admin_select_tenant_profiles ON public.profiles;

CREATE POLICY tenant_admin_select_tenant_profiles ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

COMMIT;
