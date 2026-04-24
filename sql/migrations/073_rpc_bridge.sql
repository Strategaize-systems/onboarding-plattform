-- Migration 073: 3 RPCs fuer Bridge-Engine (Trigger, Approve, Reject)
-- SLC-035 MT-1 — V4 Bridge-Engine Backend (FEAT-023, DEC-034, DEC-037, DEC-039)
--
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-120)
--
-- RPCs:
--   1. rpc_trigger_bridge_run(p_capture_session_id)
--      tenant_admin / strategaize_admin. Erzeugt bridge_run (status=running) + ai_jobs Row
--      (job_type=bridge_generation, payload={bridge_run_id}). source_checkpoint_ids = aktuelle
--      submitted/finalized block_checkpoint IDs der Session. Returns {bridge_run_id}.
--
--   2. rpc_approve_bridge_proposal(p_proposal_id, p_edited_payload jsonb DEFAULT NULL)
--      tenant_admin / strategaize_admin. Atomar:
--        (a) edited_payload mergen (proposed_block_title, proposed_block_description,
--            proposed_questions, proposed_employee_user_id, proposed_employee_role_hint)
--        (b) UPDATE bridge_proposal SET status='approved', reviewed_by_user_id, reviewed_at
--        (c) INSERT capture_session (capture_mode='employee_questionnaire',
--            owner_user_id=proposed_employee_user_id, template_id + template_version aus
--            Source-Session)
--        (d) UPDATE bridge_proposal SET status='spawned', approved_capture_session_id
--      Returns {capture_session_id}.
--
--   3. rpc_reject_bridge_proposal(p_proposal_id, p_reason)
--      tenant_admin / strategaize_admin. UPDATE status='rejected', reject_reason.
--      Returns {rejected: true}.
--
-- Rollback (nicht auto-bereitgestellt):
--   DROP FUNCTION IF EXISTS public.rpc_trigger_bridge_run(uuid);
--   DROP FUNCTION IF EXISTS public.rpc_approve_bridge_proposal(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.rpc_reject_bridge_proposal(uuid, text);

BEGIN;

-- =============================================
-- 1. rpc_trigger_bridge_run
--    Erzeugt bridge_run (status=running) + ai_jobs Row. Worker picked spaeter.
--    Keine "nur ein aktiver Run"-Gate — Caller (UI) stellt sicher, dass nicht doppelt
--    getriggert wird. DEC-037: on-demand, kein Auto-Trigger.
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_trigger_bridge_run(
  p_capture_session_id uuid
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
  v_session        public.capture_session%ROWTYPE;
  v_bridge_run_id  uuid;
  v_checkpoints    uuid[];
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

  -- Sammle aktuelle submitted/finalized Checkpoints (questionnaire_submit oder meeting_final)
  SELECT COALESCE(array_agg(bc.id ORDER BY bc.created_at), '{}'::uuid[])
    INTO v_checkpoints
    FROM public.block_checkpoint bc
   WHERE bc.capture_session_id = p_capture_session_id
     AND bc.checkpoint_type IN ('questionnaire_submit', 'meeting_final');

  -- INSERT bridge_run
  INSERT INTO public.bridge_run (
    tenant_id,
    capture_session_id,
    template_id,
    template_version,
    status,
    triggered_by_user_id,
    source_checkpoint_ids
  ) VALUES (
    v_session.tenant_id,
    p_capture_session_id,
    v_session.template_id,
    v_session.template_version,
    'running',
    v_caller_id,
    v_checkpoints
  )
  RETURNING id INTO v_bridge_run_id;

  -- INSERT ai_jobs (Worker pickt via claim-loop)
  INSERT INTO public.ai_jobs (
    tenant_id,
    job_type,
    payload,
    status
  ) VALUES (
    v_session.tenant_id,
    'bridge_generation',
    jsonb_build_object('bridge_run_id', v_bridge_run_id),
    'pending'
  );

  RETURN jsonb_build_object('bridge_run_id', v_bridge_run_id);
END;
$$;

-- =============================================
-- 2. rpc_approve_bridge_proposal
--    Atomar: edit-merge -> approved -> INSERT capture_session -> spawned.
--    edited_payload ist optional; erlaubt Overrides auf proposed_block_title,
--    proposed_block_description, proposed_questions, proposed_employee_user_id,
--    proposed_employee_role_hint.
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_approve_bridge_proposal(
  p_proposal_id   uuid,
  p_edited_payload jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role     text;
  v_caller_tenant   uuid;
  v_caller_id       uuid;
  v_proposal        public.bridge_proposal%ROWTYPE;
  v_source_session  public.capture_session%ROWTYPE;
  v_new_session_id  uuid;

  -- gemergte Werte
  v_proposed_employee_user_id   uuid;
  v_proposed_employee_role_hint text;
  v_proposed_block_title        text;
  v_proposed_block_description  text;
  v_proposed_questions          jsonb;
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

  IF p_proposal_id IS NULL THEN
    RETURN jsonb_build_object('error', 'proposal_id_required');
  END IF;

  SELECT * INTO v_proposal
    FROM public.bridge_proposal
   WHERE id = p_proposal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'proposal_not_found');
  END IF;

  -- Cross-Tenant-Schutz fuer tenant_admin
  IF v_caller_role = 'tenant_admin' AND v_proposal.tenant_id <> v_caller_tenant THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Idempotenz: schon spawned -> zurueckgeben
  IF v_proposal.status = 'spawned' AND v_proposal.approved_capture_session_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'capture_session_id', v_proposal.approved_capture_session_id,
      'already', true
    );
  END IF;

  IF v_proposal.status NOT IN ('proposed', 'edited') THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  -- Source-Session (fuer template_id + template_version)
  SELECT cs.* INTO v_source_session
    FROM public.capture_session cs
    JOIN public.bridge_run br ON br.capture_session_id = cs.id
   WHERE br.id = v_proposal.bridge_run_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'source_session_not_found');
  END IF;

  -- Merge edited_payload ueber Proposal-Werten
  v_proposed_employee_user_id := COALESCE(
    NULLIF(p_edited_payload->>'proposed_employee_user_id', '')::uuid,
    v_proposal.proposed_employee_user_id
  );
  v_proposed_employee_role_hint := COALESCE(
    NULLIF(p_edited_payload->>'proposed_employee_role_hint', ''),
    v_proposal.proposed_employee_role_hint
  );
  v_proposed_block_title := COALESCE(
    NULLIF(p_edited_payload->>'proposed_block_title', ''),
    v_proposal.proposed_block_title
  );
  v_proposed_block_description := COALESCE(
    p_edited_payload->>'proposed_block_description',
    v_proposal.proposed_block_description
  );
  v_proposed_questions := COALESCE(
    p_edited_payload->'proposed_questions',
    v_proposal.proposed_questions
  );

  IF v_proposed_employee_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_employee_assigned');
  END IF;

  -- (a) Edit-Merge + Approve
  UPDATE public.bridge_proposal
     SET proposed_block_title       = v_proposed_block_title,
         proposed_block_description = v_proposed_block_description,
         proposed_questions         = v_proposed_questions,
         proposed_employee_user_id  = v_proposed_employee_user_id,
         proposed_employee_role_hint = v_proposed_employee_role_hint,
         status                     = 'approved',
         reviewed_by_user_id        = v_caller_id,
         reviewed_at                = now()
   WHERE id = p_proposal_id;

  -- (b) Spawn capture_session fuer Mitarbeiter
  INSERT INTO public.capture_session (
    tenant_id,
    template_id,
    template_version,
    owner_user_id,
    status,
    capture_mode,
    answers
  ) VALUES (
    v_proposal.tenant_id,
    v_source_session.template_id,
    v_source_session.template_version,
    v_proposed_employee_user_id,
    'open',
    'employee_questionnaire',
    '{}'::jsonb
  )
  RETURNING id INTO v_new_session_id;

  -- (c) Link + Final-Status
  UPDATE public.bridge_proposal
     SET status                      = 'spawned',
         approved_capture_session_id = v_new_session_id
   WHERE id = p_proposal_id;

  RETURN jsonb_build_object('capture_session_id', v_new_session_id);
END;
$$;

-- =============================================
-- 3. rpc_reject_bridge_proposal
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_reject_bridge_proposal(
  p_proposal_id uuid,
  p_reason      text
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
  v_proposal       public.bridge_proposal%ROWTYPE;
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

  IF p_proposal_id IS NULL THEN
    RETURN jsonb_build_object('error', 'proposal_id_required');
  END IF;

  SELECT * INTO v_proposal
    FROM public.bridge_proposal
   WHERE id = p_proposal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'proposal_not_found');
  END IF;

  IF v_caller_role = 'tenant_admin' AND v_proposal.tenant_id <> v_caller_tenant THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Idempotenz: schon rejected
  IF v_proposal.status = 'rejected' THEN
    RETURN jsonb_build_object('rejected', true, 'already', true);
  END IF;

  -- Nicht rejected-bar wenn bereits spawned
  IF v_proposal.status = 'spawned' THEN
    RETURN jsonb_build_object('error', 'already_spawned');
  END IF;

  UPDATE public.bridge_proposal
     SET status        = 'rejected',
         reject_reason = p_reason,
         reviewed_by_user_id = v_caller_id,
         reviewed_at   = now()
   WHERE id = p_proposal_id;

  RETURN jsonb_build_object('rejected', true);
END;
$$;

-- =============================================
-- 4. GRANTs
-- =============================================
GRANT EXECUTE ON FUNCTION public.rpc_trigger_bridge_run(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_trigger_bridge_run(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_approve_bridge_proposal(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approve_bridge_proposal(uuid, jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_reject_bridge_proposal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reject_bridge_proposal(uuid, text) TO service_role;

COMMIT;
