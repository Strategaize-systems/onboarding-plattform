-- Migration 020b: Onboarding-Plattform Baseline
-- Datum: 2026-04-14
-- Kontext: Das Onboarding-Repo ist ein Blueprint-V3.4-Fork. Die Hetzner-Instanz
--   bekam nur die leere Supabase-Stack-Shell; Blueprint-Init-Scripts
--   (schema.sql, rls.sql, functions.sql, Migrations 003-020) wurden nicht
--   gemountet. Diese Migration legt den minimalen Auth/Tenant-Kern an, den
--   SLC-001 (021-023) voraussetzt. Blueprint-spezifische Tabellen
--   (runs, questions, mirror, freeform, debrief) werden bewusst NICHT angelegt.
--
-- Dependencies: Supabase-Core (auth-Schema, auth.users) — ist Teil des
--   selfhosted Supabase-Stacks und bereits vorhanden.

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  language    text        NOT NULL DEFAULT 'de' CHECK (language IN ('de', 'en', 'nl')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES auth.users ON DELETE SET NULL
);

COMMENT ON TABLE tenants IS 'Kundenunternehmen. Admin-verwaltet.';

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  tenant_id   uuid        REFERENCES tenants ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('strategaize_admin', 'tenant_admin', 'tenant_owner', 'tenant_member')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role       ON profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_email      ON profiles (lower(email));

COMMENT ON TABLE profiles IS 'User-Profil, verknuepft mit auth.users. tenant_id NULL fuer strategaize_admin.';

-- ============================================================
-- AUTH HELPERS (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION auth.user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- RLS ENABLE
-- ============================================================
ALTER TABLE tenants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES — TENANTS
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

-- ============================================================
-- handle_new_user() — Trigger auf auth.users
-- Portiert (vereinfacht) aus Blueprint Migration 004. Laesst tenant_admin,
-- tenant_member, strategaize_admin zu. Keine block-access-Logik (nicht noetig
-- fuer Onboarding-Plattform V1).
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tenant_id uuid;
  v_role      text;
BEGIN
  v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid;
  v_role := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'role', ''),
    'tenant_admin'
  );

  IF v_role NOT IN ('strategaize_admin', 'tenant_admin', 'tenant_member') THEN
    RAISE EXCEPTION 'handle_new_user: invalid role: %', v_role
      USING ERRCODE = 'P0400';
  END IF;

  IF v_role IN ('tenant_admin', 'tenant_member') THEN
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'handle_new_user: tenant_id required for role %', v_role
        USING ERRCODE = 'P0422';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
      RAISE EXCEPTION 'handle_new_user: tenant % does not exist', v_tenant_id
        USING ERRCODE = 'P0404';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, tenant_id, email, role)
  VALUES (NEW.id, v_tenant_id, NEW.email, v_role);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
