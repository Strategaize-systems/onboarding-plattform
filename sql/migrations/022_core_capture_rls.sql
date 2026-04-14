-- Migration 022: Onboarding-Plattform V1 — RLS-Policies fuer Capture-Schema
-- Datum: 2026-04-14
-- Slice: SLC-001 MT-2
-- Dependencies: 021

-- Konvention (analog rls.sql / Migration 004):
--   {table}_admin_full   — strategaize_admin Cross-Tenant Vollzugriff
--   {table}_tenant_read  — tenant_admin/member: SELECT eigener Tenant
--   {table}_tenant_write — tenant_admin/member: INSERT/UPDATE im eigenen Tenant
-- Rolle tenant_owner ist in SLC-002 Ziel der Bereinigung; bis dahin sind sowohl tenant_owner
-- als auch tenant_admin gueltig (Migration 004 laesst beide zu).

-- ============================================================
-- TEMPLATE
-- Alle authenticated Rollen duerfen lesen (Template ist system-weit).
-- Nur strategaize_admin darf schreiben.
-- ============================================================

CREATE POLICY "template_read_all"
  ON template FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "template_admin_write"
  ON template FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- ============================================================
-- CAPTURE_SESSION
-- ============================================================

CREATE POLICY "capture_session_admin_full"
  ON capture_session FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "capture_session_tenant_read"
  ON capture_session FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY "capture_session_tenant_admin_write"
  ON capture_session FOR ALL
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_owner')
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() IN ('tenant_admin', 'tenant_owner')
    AND tenant_id = auth.user_tenant_id()
  );

-- ============================================================
-- BLOCK_CHECKPOINT
-- Kein direkter Write ueber Policies — Writes laufen in SLC-006 ueber RPC
-- (SECURITY DEFINER, mit expliziter Berechtigungspruefung). Policies decken SELECT +
-- Cross-Tenant-Admin ab. Fuer V1 erlauben wir zusaetzlich tenant_admin-INSERT als
-- defense-in-depth fuer direkte Queries. Writes via RPC sind davon unabhaengig.
-- ============================================================

CREATE POLICY "block_checkpoint_admin_full"
  ON block_checkpoint FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "block_checkpoint_tenant_read"
  ON block_checkpoint FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY "block_checkpoint_tenant_admin_write"
  ON block_checkpoint FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.user_role() IN ('tenant_admin', 'tenant_owner')
    AND tenant_id = auth.user_tenant_id()
  );

-- ============================================================
-- KNOWLEDGE_UNIT
-- Lesen: strategaize_admin cross-tenant; tenant-User nur eigenen Tenant.
-- Schreiben/Aendern: nur strategaize_admin oder via RPC (service_role).
-- ============================================================

CREATE POLICY "knowledge_unit_admin_full"
  ON knowledge_unit FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "knowledge_unit_tenant_read"
  ON knowledge_unit FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

-- ============================================================
-- VALIDATION_LAYER
-- Append-only Audit-Log. Reads: strategaize_admin + tenant-User im eigenen Tenant.
-- Writes: strategaize_admin (direkt) oder via RPC.
-- ============================================================

CREATE POLICY "validation_layer_admin_full"
  ON validation_layer FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "validation_layer_tenant_read"
  ON validation_layer FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );
