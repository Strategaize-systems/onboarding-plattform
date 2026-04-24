-- Migration 065: profiles.role CHECK additiv erweitert um 'employee' + handle_new_user() Rollen-Whitelist
-- SLC-033 MT-1 — V4 Schema-Fundament (FEAT-022, DEC-036)
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)
--
-- Inhalt:
--   1. CHECK-Constraint auf profiles.role additiv erweitert um 'employee'
--   2. handle_new_user() Whitelist erweitert um 'employee' — sonst blockiert der
--      auth.users-Trigger spaeter die Mitarbeiter-Annahme (rpc_accept_employee_invitation
--      in SLC-034). Nicht im Slice-Text expliziert, aber ohne diese Erweiterung
--      bricht der Schema-Contract.
--
-- Rollback (nicht auto-bereitgestellt):
--   ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
--   ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
--     CHECK (role IN ('strategaize_admin', 'tenant_admin', 'tenant_member'));
--   handle_new_user() Whitelist auf 3 Werte zuruecksetzen.

BEGIN;

-- =============================================
-- 1. CHECK-Constraint auf profiles.role additiv erweitert
--    Idempotenz: bestehenden Constraint finden (Name kann variieren)
--    und droppen, dann additiv neu anlegen.
-- =============================================
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname
    INTO v_constraint_name
    FROM pg_constraint
   WHERE conrelid = 'public.profiles'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%role%'
   LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('strategaize_admin', 'tenant_admin', 'tenant_member', 'employee'));

-- =============================================
-- 2. handle_new_user() Whitelist additiv erweitern
--    CREATE OR REPLACE ist idempotent. Funktions-Body identisch zu functions.sql,
--    nur die Whitelist-Pruefung ist um 'employee' erweitert.
-- =============================================
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

COMMIT;
