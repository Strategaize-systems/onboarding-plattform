-- Migration 017: handle_new_user() erweitern für mirror_respondent (V3)
-- Datum: 2026-04-04
-- Feature: FEAT-030 — Mirror-Einladung

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
  v_respondent_layer text;
  v_survey_type text;
BEGIN
  v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid;
  v_role := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'role', ''),
    'tenant_admin'
  );

  -- Validierung (erweitert um mirror_respondent)
  IF v_role NOT IN ('strategaize_admin', 'tenant_admin', 'tenant_member', 'mirror_respondent') THEN
    RAISE EXCEPTION 'handle_new_user: invalid role: %', v_role
      USING ERRCODE = 'P0400';
  END IF;

  IF v_role IN ('tenant_admin', 'tenant_member', 'mirror_respondent') THEN
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'handle_new_user: tenant_id required for role %', v_role
        USING ERRCODE = 'P0422';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
      RAISE EXCEPTION 'handle_new_user: tenant % does not exist', v_tenant_id
        USING ERRCODE = 'P0404';
    END IF;
  END IF;

  -- tenant_admin Uniqueness
  IF v_role = 'tenant_admin' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE tenant_id = v_tenant_id AND role = 'tenant_admin'
    ) THEN
      RAISE EXCEPTION 'handle_new_user: tenant % already has an admin', v_tenant_id
        USING ERRCODE = 'P0409';
    END IF;
  END IF;

  -- respondent_layer aus Metadata (nur für mirror_respondent relevant)
  v_respondent_layer := NULLIF(NEW.raw_user_meta_data->>'respondent_layer', '');

  -- Profil erstellen (mit respondent_layer)
  INSERT INTO public.profiles (id, tenant_id, email, role, respondent_layer)
  VALUES (NEW.id, v_tenant_id, NEW.email, v_role, v_respondent_layer);

  -- Block-Zugriff fuer tenant_member setzen (Management-Runs)
  IF v_role = 'tenant_member' AND NEW.raw_user_meta_data ? 'allowed_blocks' THEN
    SELECT ARRAY(
      SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'allowed_blocks')
    ) INTO v_blocks;

    FOR v_run IN SELECT id FROM runs WHERE tenant_id = v_tenant_id AND survey_type = 'management' LOOP
      FOREACH v_block IN ARRAY v_blocks LOOP
        INSERT INTO member_block_access (profile_id, run_id, block, survey_type)
        VALUES (NEW.id, v_run.id, v_block, 'management')
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END IF;

  -- Block-Zugriff fuer mirror_respondent setzen (Mirror-Runs)
  IF v_role = 'mirror_respondent' AND NEW.raw_user_meta_data ? 'allowed_blocks' THEN
    SELECT ARRAY(
      SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'allowed_blocks')
    ) INTO v_blocks;

    FOR v_run IN SELECT id FROM runs WHERE tenant_id = v_tenant_id AND survey_type = 'mirror' LOOP
      FOREACH v_block IN ARRAY v_blocks LOOP
        INSERT INTO member_block_access (profile_id, run_id, block, survey_type)
        VALUES (NEW.id, v_run.id, v_block, 'mirror')
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
