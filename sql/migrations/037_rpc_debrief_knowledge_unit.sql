-- 037_rpc_debrief_knowledge_unit.sql
-- SLC-009: RPCs fuer Debrief-UI — Knowledge Unit Update mit Audit-Trail + manuelle KU-Erstellung.

BEGIN;

-- =============================================================================
-- 1. rpc_update_knowledge_unit_with_audit
--    Atomic: KU-Update (title/body/status) + validation_layer-Audit-Row.
--    Nur strategaize_admin darf diese Funktion aufrufen.
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_update_knowledge_unit_with_audit(
  p_ku_id    uuid,
  p_patch    jsonb,
  p_action   text,
  p_note     text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid;
  v_user_role      text;
  v_ku             record;
  v_new_status     text;
  v_validation_id  uuid;
BEGIN
  -- Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user_role := auth.user_role();
  IF v_user_role != 'strategaize_admin' THEN
    RAISE EXCEPTION 'Only strategaize_admin can update knowledge units in debrief';
  END IF;

  -- Validate action
  IF p_action NOT IN ('accept', 'edit', 'reject') THEN
    RAISE EXCEPTION 'Invalid action: %. Must be accept, edit, or reject.', p_action;
  END IF;

  -- Fetch current KU state (SECURITY DEFINER bypasses RLS)
  SELECT id, tenant_id, status INTO v_ku FROM knowledge_unit WHERE id = p_ku_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge unit not found: %', p_ku_id;
  END IF;

  -- Determine new status based on action
  v_new_status := CASE p_action
    WHEN 'accept' THEN 'accepted'
    WHEN 'edit'   THEN 'edited'
    WHEN 'reject' THEN 'rejected'
  END;

  -- Update KU fields
  UPDATE knowledge_unit
  SET
    title      = COALESCE(p_patch->>'title', title),
    body       = COALESCE(p_patch->>'body', body),
    status     = v_new_status,
    updated_at = now(),
    updated_by = v_user_id
  WHERE id = p_ku_id;

  -- Insert validation layer audit entry
  INSERT INTO validation_layer (
    tenant_id, knowledge_unit_id, reviewer_user_id, reviewer_role,
    action, previous_status, new_status, note
  )
  VALUES (
    v_ku.tenant_id, p_ku_id, v_user_id, v_user_role,
    p_action, v_ku.status, v_new_status, p_note
  )
  RETURNING id INTO v_validation_id;

  RETURN v_validation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_update_knowledge_unit_with_audit(uuid, jsonb, text, text) TO authenticated;


-- =============================================================================
-- 2. rpc_add_knowledge_unit
--    Admin kann manuell eine Knowledge Unit zu einem Block hinzufuegen.
--    Source = 'manual' (DEC-016). Erstellt auch einen Audit-Trail-Eintrag.
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_add_knowledge_unit(
  p_session_id  uuid,
  p_block_key   text,
  p_title       text,
  p_body        text,
  p_unit_type   text DEFAULT 'observation',
  p_note        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid;
  v_user_role     text;
  v_session       record;
  v_checkpoint_id uuid;
  v_ku_id         uuid;
BEGIN
  -- Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user_role := auth.user_role();
  IF v_user_role != 'strategaize_admin' THEN
    RAISE EXCEPTION 'Only strategaize_admin can add knowledge units';
  END IF;

  -- Validate unit_type
  IF p_unit_type NOT IN ('finding', 'risk', 'action', 'observation', 'ai_draft') THEN
    RAISE EXCEPTION 'Invalid unit_type: %. Must be finding, risk, action, observation, or ai_draft.', p_unit_type;
  END IF;

  -- Get session (cross-tenant — SECURITY DEFINER bypasses RLS)
  SELECT id, tenant_id INTO v_session FROM capture_session WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Capture session not found: %', p_session_id;
  END IF;

  -- Find latest checkpoint for this block
  SELECT id INTO v_checkpoint_id
  FROM block_checkpoint
  WHERE capture_session_id = p_session_id
    AND block_key = p_block_key
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_checkpoint_id IS NULL THEN
    RAISE EXCEPTION 'No checkpoint found for block % in session %', p_block_key, p_session_id;
  END IF;

  -- Insert Knowledge Unit
  INSERT INTO knowledge_unit (
    tenant_id, capture_session_id, block_checkpoint_id, block_key,
    unit_type, source, title, body, confidence, status, updated_by
  )
  VALUES (
    v_session.tenant_id, p_session_id, v_checkpoint_id, p_block_key,
    p_unit_type, 'manual', p_title, p_body, 'medium', 'proposed', v_user_id
  )
  RETURNING id INTO v_ku_id;

  -- Audit trail for creation
  INSERT INTO validation_layer (
    tenant_id, knowledge_unit_id, reviewer_user_id, reviewer_role,
    action, previous_status, new_status, note
  )
  VALUES (
    v_session.tenant_id, v_ku_id, v_user_id, v_user_role,
    'comment', NULL, 'proposed',
    COALESCE(p_note, 'Manuell hinzugefuegt durch strategaize_admin')
  );

  RETURN v_ku_id;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_add_knowledge_unit(uuid, text, text, text, text, text) TO authenticated;

COMMIT;
