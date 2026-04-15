-- Migration 026: Rolle tenant_owner -> tenant_admin endgueltig bereinigen
-- Datum: 2026-04-15
-- Slice: SLC-002 MT-1
-- Dependencies: SLC-001 Init-Scripts + Migrations 021/022/023
-- Hinweis: Die Nummern 024/025 aus MIG-001 (geplant) wurden nie als eigene
--   Files umgesetzt (Helper-Checks via functions.sql, Seed-Infra verschoben
--   in SLC-002b). Diese Migration knuepft direkt an 023 an.
--
-- Inhalt:
--   1. Sicherheitshalber bestehende Profiles mit role='tenant_owner'
--      auf 'tenant_admin' migrieren (idempotent).
--   2. CHECK-Constraint auf profiles.role ohne 'tenant_owner' neu setzen.
--   3. Alle 7 RLS-Policies aus Migration 022, die 'tenant_owner' enthalten,
--      droppen und ohne den Legacy-Wert neu anlegen.
--   4. handle_new_user() akzeptiert schon nur tenant_admin/tenant_member/
--      strategaize_admin — keine Aenderung noetig.
--
-- Rollback:
--   Reverse-Migration 026r (nicht auto-angelegt). Wiederaufnahme von
--   'tenant_owner' in den CHECK + UPDATE zurueck. V1-Scope sieht kein
--   Rollback vor, weil 'tenant_owner' nur Blueprint-Erbe ist.

BEGIN;

-- ============================================================
-- 1. Datenmigration (idempotent)
-- ============================================================
UPDATE public.profiles
   SET role = 'tenant_admin'
 WHERE role = 'tenant_owner';

-- ============================================================
-- 2. CHECK-Constraint neu setzen
-- ============================================================
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
  CHECK (role IN ('strategaize_admin', 'tenant_admin', 'tenant_member'));

-- ============================================================
-- 3. RLS-Policies aus Migration 022 ohne tenant_owner neu anlegen
-- ============================================================

-- capture_session
DROP POLICY IF EXISTS "capture_session_tenant_read"        ON public.capture_session;
DROP POLICY IF EXISTS "capture_session_tenant_admin_write" ON public.capture_session;

CREATE POLICY "capture_session_tenant_read"
  ON public.capture_session FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY "capture_session_tenant_admin_write"
  ON public.capture_session FOR ALL
  TO authenticated
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- block_checkpoint
DROP POLICY IF EXISTS "block_checkpoint_tenant_read"        ON public.block_checkpoint;
DROP POLICY IF EXISTS "block_checkpoint_tenant_admin_write" ON public.block_checkpoint;

CREATE POLICY "block_checkpoint_tenant_read"
  ON public.block_checkpoint FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY "block_checkpoint_tenant_admin_write"
  ON public.block_checkpoint FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- knowledge_unit
DROP POLICY IF EXISTS "knowledge_unit_tenant_read" ON public.knowledge_unit;

CREATE POLICY "knowledge_unit_tenant_read"
  ON public.knowledge_unit FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

-- validation_layer
DROP POLICY IF EXISTS "validation_layer_tenant_read" ON public.validation_layer;

CREATE POLICY "validation_layer_tenant_read"
  ON public.validation_layer FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

COMMIT;

-- ============================================================
-- Verifikation (nach Deploy manuell ausfuehren):
--   SELECT DISTINCT role FROM public.profiles;
--     -> erwartete Werte: strategaize_admin | tenant_admin | tenant_member
--   SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.profiles'::regclass
--      AND conname  = 'profiles_role_check';
--     -> CHECK enthaelt kein 'tenant_owner'
--   SELECT polname, pg_get_expr(polqual, polrelid)
--     FROM pg_policy
--    WHERE polrelid IN (
--      'public.capture_session'::regclass,
--      'public.block_checkpoint'::regclass,
--      'public.knowledge_unit'::regclass,
--      'public.validation_layer'::regclass
--    )
--      AND pg_get_expr(polqual, polrelid) ILIKE '%tenant_owner%';
--     -> 0 rows
-- ============================================================
