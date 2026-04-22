-- Migration 062: RPCs for dialogue_session lifecycle
-- SLC-028 MT-3 — Dialogue Session Management (FEAT-019)
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)

BEGIN;

-- =============================================
-- 1. rpc_create_dialogue_session — Erstellt neue Dialogue-Session
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_create_dialogue_session(
  p_tenant_id uuid,
  p_capture_session_id uuid,
  p_meeting_guide_id uuid,
  p_participant_a uuid,
  p_participant_b uuid,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room_name text;
  v_session_id uuid;
  v_caller_role text;
BEGIN
  -- Rollencheck: nur strategaize_admin oder tenant_admin des eigenen Tenants
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = p_created_by;
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_caller_role = 'tenant_admin' THEN
    -- Pruefen: gehoert User zum Tenant?
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_created_by AND tenant_id = p_tenant_id) THEN
      RAISE EXCEPTION 'Not authorized for this tenant';
    END IF;
  ELSIF v_caller_role != 'strategaize_admin' THEN
    RAISE EXCEPTION 'Only tenant_admin or strategaize_admin can create dialogue sessions';
  END IF;

  -- Generiere eindeutigen Room-Name: onb-{short-uuid}
  v_room_name := 'onb-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.dialogue_session (
    tenant_id,
    capture_session_id,
    meeting_guide_id,
    jitsi_room_name,
    participant_a_user_id,
    participant_b_user_id,
    created_by
  ) VALUES (
    p_tenant_id,
    p_capture_session_id,
    p_meeting_guide_id,
    v_room_name,
    p_participant_a,
    p_participant_b,
    p_created_by
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

-- =============================================
-- 2. rpc_update_dialogue_status — Status-Transitions
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_update_dialogue_status(
  p_dialogue_session_id uuid,
  p_new_status text,
  p_caller_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status text;
  v_caller_role text;
  v_session_tenant_id uuid;
BEGIN
  -- Session laden
  SELECT status, tenant_id INTO v_current_status, v_session_tenant_id
    FROM public.dialogue_session WHERE id = p_dialogue_session_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Dialogue session not found';
  END IF;

  -- Rollencheck
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = p_caller_id;
  IF v_caller_role = 'tenant_admin' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_caller_id AND tenant_id = v_session_tenant_id) THEN
      RAISE EXCEPTION 'Not authorized for this tenant';
    END IF;
  ELSIF v_caller_role != 'strategaize_admin' THEN
    RAISE EXCEPTION 'Only tenant_admin or strategaize_admin can update dialogue status';
  END IF;

  -- Erlaubte Transitions validieren
  IF NOT (
    (v_current_status = 'planned' AND p_new_status IN ('in_progress', 'failed')) OR
    (v_current_status = 'in_progress' AND p_new_status IN ('recording', 'completed', 'failed')) OR
    (v_current_status = 'recording' AND p_new_status IN ('completed', 'failed')) OR
    (v_current_status = 'completed' AND p_new_status IN ('transcribing', 'failed')) OR
    (v_current_status = 'transcribing' AND p_new_status IN ('processing', 'failed')) OR
    (v_current_status = 'processing' AND p_new_status IN ('processed', 'failed'))
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_current_status, p_new_status;
  END IF;

  -- Timestamps setzen
  UPDATE public.dialogue_session
  SET
    status = p_new_status,
    started_at = CASE
      WHEN p_new_status = 'in_progress' AND started_at IS NULL THEN now()
      ELSE started_at
    END,
    ended_at = CASE
      WHEN p_new_status = 'completed' AND ended_at IS NULL THEN now()
      ELSE ended_at
    END
  WHERE id = p_dialogue_session_id;
END;
$$;

-- =============================================
-- 3. rpc_save_dialogue_transcript — Transkript persistent speichern (DEC-029)
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_save_dialogue_transcript(
  p_dialogue_session_id uuid,
  p_transcript text,
  p_transcript_model text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.dialogue_session
  SET
    transcript = p_transcript,
    transcript_model = p_transcript_model
  WHERE id = p_dialogue_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dialogue session not found: %', p_dialogue_session_id;
  END IF;
END;
$$;

-- =============================================
-- 4. rpc_save_dialogue_extraction — Summary + Gaps + Kosten speichern
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_save_dialogue_extraction(
  p_dialogue_session_id uuid,
  p_summary jsonb,
  p_gaps jsonb,
  p_extraction_model text,
  p_extraction_cost_usd numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.dialogue_session
  SET
    summary = p_summary,
    gaps = p_gaps,
    extraction_model = p_extraction_model,
    extraction_cost_usd = p_extraction_cost_usd
  WHERE id = p_dialogue_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dialogue session not found: %', p_dialogue_session_id;
  END IF;
END;
$$;

-- =============================================
-- 5. rpc_update_dialogue_consent — DSGVO Consent setzen
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_update_dialogue_consent(
  p_dialogue_session_id uuid,
  p_user_id uuid,
  p_consent boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_part_a uuid;
  v_part_b uuid;
BEGIN
  SELECT participant_a_user_id, participant_b_user_id
    INTO v_part_a, v_part_b
    FROM public.dialogue_session WHERE id = p_dialogue_session_id;

  IF v_part_a IS NULL THEN
    RAISE EXCEPTION 'Dialogue session not found';
  END IF;

  IF p_user_id = v_part_a THEN
    UPDATE public.dialogue_session SET consent_a = p_consent WHERE id = p_dialogue_session_id;
  ELSIF p_user_id = v_part_b THEN
    UPDATE public.dialogue_session SET consent_b = p_consent WHERE id = p_dialogue_session_id;
  ELSE
    RAISE EXCEPTION 'User is not a participant of this dialogue session';
  END IF;
END;
$$;

-- =============================================
-- 6. GRANTs for RPCs
-- =============================================
GRANT EXECUTE ON FUNCTION public.rpc_create_dialogue_session(uuid, uuid, uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_dialogue_session(uuid, uuid, uuid, uuid, uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_update_dialogue_status(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_dialogue_status(uuid, text, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_save_dialogue_transcript(uuid, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_save_dialogue_extraction(uuid, jsonb, jsonb, text, numeric) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_update_dialogue_consent(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_dialogue_consent(uuid, uuid, boolean) TO service_role;

COMMIT;
