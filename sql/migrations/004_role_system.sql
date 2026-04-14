-- Migration 004: Rollen-System — tenant_admin + Block-Zugriff
-- Datum: 2026-03-28

-- 1. Erweitere role CHECK um tenant_admin
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('strategaize_admin', 'tenant_admin', 'tenant_owner', 'tenant_member'));

-- 2. Migriere bestehende tenant_owner → tenant_admin
UPDATE profiles SET role = 'tenant_admin' WHERE role = 'tenant_owner';

-- 3. Block-Zugriff Tabelle
CREATE TABLE IF NOT EXISTS member_block_access (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  run_id     uuid NOT NULL REFERENCES runs ON DELETE CASCADE,
  block      text NOT NULL CHECK (block IN ('A','B','C','D','E','F','G','H','I')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, run_id, block)
);

CREATE INDEX IF NOT EXISTS idx_mba_profile ON member_block_access (profile_id);
CREATE INDEX IF NOT EXISTS idx_mba_run ON member_block_access (run_id);

COMMENT ON TABLE member_block_access IS 'Block-Level Zugriffskontrolle fuer tenant_member. tenant_admin sieht alles.';

-- 4. RLS auf member_block_access
ALTER TABLE member_block_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_mba"
  ON member_block_access FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "tenant_admin_manage_mba"
  ON member_block_access FOR ALL
  TO authenticated
  USING (
    auth.user_role() = 'tenant_admin'
    AND run_id IN (SELECT id FROM runs WHERE tenant_id = auth.user_tenant_id())
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND run_id IN (SELECT id FROM runs WHERE tenant_id = auth.user_tenant_id())
  );

CREATE POLICY "member_read_own_mba"
  ON member_block_access FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'tenant_member'
    AND profile_id = auth.uid()
  );

-- 5. GRANTs
GRANT ALL ON member_block_access TO authenticated;
GRANT ALL ON member_block_access TO service_role;

-- 6. Update handle_new_user() to accept tenant_admin + allowed_blocks
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_role      text;
  v_blocks    text[];
  v_block     text;
  v_run       record;
BEGIN
  v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid;
  v_role := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'role', ''),
    'tenant_admin'
  );

  -- Validierung
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

  -- tenant_admin Uniqueness: nur ein tenant_admin pro Tenant
  IF v_role = 'tenant_admin' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE tenant_id = v_tenant_id AND role = 'tenant_admin'
    ) THEN
      RAISE EXCEPTION 'handle_new_user: tenant % already has an admin', v_tenant_id
        USING ERRCODE = 'P0409';
    END IF;
  END IF;

  -- Profil erstellen
  INSERT INTO public.profiles (id, tenant_id, email, role)
  VALUES (NEW.id, v_tenant_id, NEW.email, v_role);

  -- Block-Zugriff fuer tenant_member setzen (aus Metadata)
  IF v_role = 'tenant_member' AND NEW.raw_user_meta_data ? 'allowed_blocks' THEN
    SELECT ARRAY(
      SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'allowed_blocks')
    ) INTO v_blocks;

    -- Fuer alle Runs des Tenants Block-Zugriff erstellen
    FOR v_run IN SELECT id FROM runs WHERE tenant_id = v_tenant_id LOOP
      FOREACH v_block IN ARRAY v_blocks LOOP
        INSERT INTO member_block_access (profile_id, run_id, block)
        VALUES (NEW.id, v_run.id, v_block)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 7. Update user_role() to recognize tenant_admin
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 8. Update RLS policies that check for tenant_owner → add tenant_admin
-- Questions SELECT: allow tenant_admin
DROP POLICY IF EXISTS "tenant_select_questions" ON questions;
CREATE POLICY "tenant_select_questions"
  ON questions FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_member')
    AND catalog_snapshot_id IN (
      SELECT catalog_snapshot_id FROM runs
      WHERE tenant_id = auth.user_tenant_id()
    )
  );

-- run_submit: allow tenant_admin
CREATE OR REPLACE FUNCTION run_submit(p_run_id uuid, p_block text, p_note text DEFAULT NULL)
RETURNS run_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id    uuid;
  v_user_id      uuid;
  v_next_version integer;
  v_submission   run_submissions;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;
  IF auth.user_role() NOT IN ('tenant_admin', 'tenant_member') THEN
    RAISE EXCEPTION 'FORBIDDEN: Only tenant users can submit';
  END IF;
  IF p_block IS NULL OR p_block = '' THEN
    RAISE EXCEPTION 'UNPROCESSABLE: Block parameter is required';
  END IF;
  SELECT t.id INTO v_tenant_id
  FROM runs r JOIN tenants t ON r.tenant_id = t.id
  JOIN profiles p ON p.tenant_id = t.id AND p.id = v_user_id
  WHERE r.id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Run not found or not authorized';
  END IF;
  IF EXISTS (SELECT 1 FROM runs WHERE id = p_run_id AND status = 'locked') THEN
    RAISE EXCEPTION 'FORBIDDEN: Run is locked';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM question_events qe
    JOIN questions q ON q.id = qe.question_id
    WHERE q.catalog_snapshot_id = (SELECT catalog_snapshot_id FROM runs WHERE id = p_run_id)
    AND q.block = p_block
  ) THEN
    RAISE EXCEPTION 'UNPROCESSABLE: No question events in block %', p_block;
  END IF;
  SELECT COALESCE(MAX(snapshot_version), 0) + 1 INTO v_next_version
  FROM run_submissions WHERE run_id = p_run_id AND block = p_block;
  INSERT INTO run_submissions (run_id, tenant_id, submitted_by, snapshot_version, note, block)
  VALUES (p_run_id, v_tenant_id, v_user_id, v_next_version, p_note, p_block)
  RETURNING * INTO v_submission;
  UPDATE runs SET status = 'submitted', submitted_at = now()
  WHERE id = p_run_id AND status = 'collecting';
  RETURN v_submission;
END;
$$;
