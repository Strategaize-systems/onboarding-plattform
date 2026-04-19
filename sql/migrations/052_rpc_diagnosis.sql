-- Migration 052: Diagnosis RPCs (create, update, confirm)
-- SLC-023 MT-3 — Diagnosis lifecycle management (FEAT-016)

-- (1) RPC: Create Diagnosis (called by Worker after KI generation)
CREATE OR REPLACE FUNCTION rpc_create_diagnosis(
  p_session_id     uuid,
  p_block_key      text,
  p_checkpoint_id  uuid,
  p_content        jsonb,
  p_model          text,
  p_cost           numeric DEFAULT NULL,
  p_created_by     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_diagnosis_id uuid;
BEGIN
  -- Get tenant_id from session
  SELECT tenant_id INTO v_tenant_id
  FROM capture_session
  WHERE id = p_session_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'session_not_found');
  END IF;

  -- Delete existing diagnosis for this session+block (overwrite on re-generation)
  DELETE FROM block_diagnosis
  WHERE capture_session_id = p_session_id
    AND block_key = p_block_key;

  INSERT INTO block_diagnosis (
    tenant_id, capture_session_id, block_key, block_checkpoint_id,
    content, status, generated_by_model, cost_usd, created_by
  ) VALUES (
    v_tenant_id, p_session_id, p_block_key, p_checkpoint_id,
    p_content, 'draft', p_model, p_cost, p_created_by
  )
  RETURNING id INTO v_diagnosis_id;

  RETURN jsonb_build_object('diagnosis_id', v_diagnosis_id);
END;
$$;

-- (2) RPC: Update Diagnosis content (admin edits fields in UI)
CREATE OR REPLACE FUNCTION rpc_update_diagnosis(
  p_diagnosis_id   uuid,
  p_content        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Role check: only strategaize_admin can edit
  IF auth.user_role() != 'strategaize_admin' THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  UPDATE block_diagnosis
  SET content = p_content,
      updated_at = now()
  WHERE id = p_diagnosis_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'diagnosis_not_found');
  END IF;

  RETURN jsonb_build_object('updated', true);
END;
$$;

-- (3) RPC: Confirm Diagnosis (sets status to 'confirmed', enables SOP gate)
CREATE OR REPLACE FUNCTION rpc_confirm_diagnosis(
  p_diagnosis_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Role check: only strategaize_admin can confirm
  IF auth.user_role() != 'strategaize_admin' THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  UPDATE block_diagnosis
  SET status = 'confirmed',
      updated_at = now()
  WHERE id = p_diagnosis_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'diagnosis_not_found');
  END IF;

  RETURN jsonb_build_object('confirmed', true);
END;
$$;

-- Grant RPCs to authenticated + service_role
GRANT EXECUTE ON FUNCTION rpc_create_diagnosis TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_create_diagnosis TO service_role;
GRANT EXECUTE ON FUNCTION rpc_update_diagnosis TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_update_diagnosis TO service_role;
GRANT EXECUTE ON FUNCTION rpc_confirm_diagnosis TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_confirm_diagnosis TO service_role;
