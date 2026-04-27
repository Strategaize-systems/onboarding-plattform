-- Migration 074: 2 RPCs fuer Handbuch-Snapshot (Trigger + signierter Download-Pfad)
-- SLC-039 MT-1 — V4 Handbuch-Snapshot Backend (FEAT-026, DEC-038)
--
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-120)
--
-- RPCs:
--   1. rpc_trigger_handbook_snapshot(p_capture_session_id)
--      tenant_admin / strategaize_admin. Atomar: INSERT handbook_snapshot
--      (status='generating') + INSERT ai_jobs (job_type='handbook_snapshot_generation',
--      payload={handbook_snapshot_id}, status='pending'). Returns {handbook_snapshot_id}.
--      Cross-Tenant-Schutz fuer tenant_admin.
--
--   2. rpc_get_handbook_snapshot_path(p_snapshot_id)
--      tenant_admin / strategaize_admin. Liefert {storage_path, status} fuer eine Snapshot-Row.
--      Server-Action erzeugt anschliessend per service_role-Client die Signed URL via
--      Storage-API (5 Min TTL). Begruendung: Supabase signt URLs ueber GoTrue/Storage-API,
--      nicht ueber plpgsql — RPC liefert daher nur den Pfad + Status, der UI-Layer/Server-
--      Action kapselt die Signing-Logik.
--      Cross-Tenant-Schutz fuer tenant_admin.
--
-- Rollback (nicht auto-bereitgestellt):
--   DROP FUNCTION IF EXISTS public.rpc_trigger_handbook_snapshot(uuid);
--   DROP FUNCTION IF EXISTS public.rpc_get_handbook_snapshot_path(uuid);

BEGIN;

-- =============================================
-- 1. rpc_trigger_handbook_snapshot
--    Erzeugt handbook_snapshot (status=generating) + ai_jobs Row.
--    Worker pickt spaeter via claim-loop (job_type='handbook_snapshot_generation').
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_trigger_handbook_snapshot(
  p_capture_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role        text;
  v_caller_tenant      uuid;
  v_caller_id          uuid;
  v_session            public.capture_session%ROWTYPE;
  v_template_version   text;
  v_snapshot_id        uuid;
BEGIN
  v_caller_id     := auth.uid();
  v_caller_role   := auth.user_role();
  v_caller_tenant := auth.user_tenant_id();

  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  IF v_caller_role NOT IN ('tenant_admin', 'strategaize_admin') THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  IF p_capture_session_id IS NULL THEN
    RETURN jsonb_build_object('error', 'capture_session_id_required');
  END IF;

  SELECT * INTO v_session
    FROM public.capture_session
   WHERE id = p_capture_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'capture_session_not_found');
  END IF;

  -- Cross-Tenant-Schutz fuer tenant_admin
  IF v_caller_role = 'tenant_admin' AND v_session.tenant_id <> v_caller_tenant THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  v_template_version := COALESCE(v_session.template_version, 'unknown');

  -- INSERT handbook_snapshot
  INSERT INTO public.handbook_snapshot (
    tenant_id,
    capture_session_id,
    template_id,
    template_version,
    status,
    generated_by_user_id
  ) VALUES (
    v_session.tenant_id,
    p_capture_session_id,
    v_session.template_id,
    v_template_version,
    'generating',
    v_caller_id
  )
  RETURNING id INTO v_snapshot_id;

  -- INSERT ai_jobs (Worker pickt via claim-loop)
  INSERT INTO public.ai_jobs (
    tenant_id,
    job_type,
    payload,
    status
  ) VALUES (
    v_session.tenant_id,
    'handbook_snapshot_generation',
    jsonb_build_object('handbook_snapshot_id', v_snapshot_id),
    'pending'
  );

  RETURN jsonb_build_object('handbook_snapshot_id', v_snapshot_id);
END;
$$;

-- =============================================
-- 2. rpc_get_handbook_snapshot_path
--    Liefert den Storage-Pfad + Status fuer eine Snapshot-Row.
--    UI-Layer/Server-Action signt anschliessend die URL via Storage-API.
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_get_handbook_snapshot_path(
  p_snapshot_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role    text;
  v_caller_tenant  uuid;
  v_caller_id      uuid;
  v_snapshot       public.handbook_snapshot%ROWTYPE;
BEGIN
  v_caller_id     := auth.uid();
  v_caller_role   := auth.user_role();
  v_caller_tenant := auth.user_tenant_id();

  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  IF v_caller_role NOT IN ('tenant_admin', 'strategaize_admin') THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  IF p_snapshot_id IS NULL THEN
    RETURN jsonb_build_object('error', 'snapshot_id_required');
  END IF;

  SELECT * INTO v_snapshot
    FROM public.handbook_snapshot
   WHERE id = p_snapshot_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'snapshot_not_found');
  END IF;

  -- Cross-Tenant-Schutz fuer tenant_admin
  IF v_caller_role = 'tenant_admin' AND v_snapshot.tenant_id <> v_caller_tenant THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  IF v_snapshot.status <> 'ready' THEN
    RETURN jsonb_build_object(
      'status', v_snapshot.status,
      'error', 'not_ready'
    );
  END IF;

  IF v_snapshot.storage_path IS NULL THEN
    RETURN jsonb_build_object('error', 'storage_path_missing');
  END IF;

  RETURN jsonb_build_object(
    'status', v_snapshot.status,
    'storage_path', v_snapshot.storage_path,
    'storage_size_bytes', v_snapshot.storage_size_bytes
  );
END;
$$;

-- =============================================
-- 3. GRANTs
-- =============================================
GRANT EXECUTE ON FUNCTION public.rpc_trigger_handbook_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_trigger_handbook_snapshot(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_get_handbook_snapshot_path(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_handbook_snapshot_path(uuid) TO service_role;

COMMIT;
