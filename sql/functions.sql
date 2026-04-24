-- StrategAIze Onboarding-Plattform V1 — Functions + Triggers
-- Enthaelt Auth-Helper fuer RLS (user_tenant_id, user_role) und den
-- handle_new_user-Trigger, der beim Signup automatisch ein Profile anlegt.
-- Ausfuehrung: nach schema.sql (docker-entrypoint-initdb.d/02_functions.sql).

-- ============================================================
-- AUTH HELPERS (SECURITY DEFINER)
-- Werden von RLS-Policies genutzt, daher muessen sie vor rls.sql existieren.
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
-- handle_new_user() — Trigger auf auth.users
-- Portiert (vereinfacht) aus Blueprint Migration 004. Laesst die Rollen
-- tenant_admin, tenant_member und strategaize_admin zu; die Onboarding-
-- Plattform V1 braucht keine block-access-Logik.
-- Erwartet Metadata in NEW.raw_user_meta_data:
--   - tenant_id (optional fuer strategaize_admin, Pflicht sonst)
--   - role (default 'tenant_admin')
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

  IF v_role NOT IN ('strategaize_admin', 'tenant_admin', 'tenant_member', 'employee') THEN
    RAISE EXCEPTION 'handle_new_user: invalid role: %', v_role
      USING ERRCODE = 'P0400';
  END IF;

  IF v_role IN ('tenant_admin', 'tenant_member', 'employee') THEN
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
