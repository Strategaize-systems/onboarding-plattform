-- StrategAIze Onboarding-Plattform V1 — RLS + Policies + Grants
-- Aktiviert Row-Level-Security fuer tenants + profiles und definiert die
-- Policies, die auth.user_role() + auth.user_tenant_id() nutzen.
-- Ausfuehrung: nach functions.sql (docker-entrypoint-initdb.d/03_rls.sql).

-- ============================================================
-- RLS ENABLE
-- ============================================================
ALTER TABLE tenants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES — TENANTS
-- strategaize_admin hat vollen Zugriff. tenant_admin/tenant_member sehen nur
-- den eigenen Tenant (via auth.user_tenant_id()). Schreiben/Loeschen bleibt
-- bei Admins bzw. wird ueber Server-Actions mit service_role gesteuert.
-- ============================================================
DROP POLICY IF EXISTS "admin_full_tenants" ON tenants;
CREATE POLICY "admin_full_tenants"
  ON tenants FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

DROP POLICY IF EXISTS "tenant_select_own_tenant" ON tenants;
CREATE POLICY "tenant_select_own_tenant"
  ON tenants FOR SELECT
  TO authenticated
  USING (id = auth.user_tenant_id());

-- ============================================================
-- RLS POLICIES — PROFILES
-- strategaize_admin hat vollen Zugriff. Jeder User sieht nur das eigene
-- Profile. Schreiboperationen auf profiles laufen ueber handle_new_user()
-- (SECURITY DEFINER) oder service_role.
-- ============================================================
DROP POLICY IF EXISTS "admin_full_profiles" ON profiles;
CREATE POLICY "admin_full_profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

DROP POLICY IF EXISTS "user_select_own_profile" ON profiles;
CREATE POLICY "user_select_own_profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;
GRANT ALL ON tenants  TO service_role;
GRANT ALL ON profiles TO service_role;
