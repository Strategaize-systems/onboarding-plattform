-- 047_rpc_orchestrator_and_gaps.sql
-- SLC-014: RPCs fuer Gap-Question-Lifecycle
-- (1) rpc_create_gap_questions — Orchestrator schreibt Gaps in gap_question-Tabelle
-- (2) rpc_answer_gap_question — Kunde beantwortet Gap
-- (3) rpc_enqueue_recondense_job — Re-Condensation-Job erstellen
-- Alle SECURITY DEFINER, CREATE OR REPLACE

BEGIN;

-- ============================================================
-- (1) rpc_create_gap_questions
-- Orchestrator schreibt erkannte Gaps in die gap_question-Tabelle.
-- Input: checkpoint_id, JSONB array of gap objects
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_create_gap_questions(
  p_checkpoint_id uuid,
  p_gaps jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_checkpoint RECORD;
  v_gap jsonb;
  v_inserted_count integer := 0;
  v_round integer;
  v_ku_id uuid;
BEGIN
  -- Load checkpoint for tenant + session context
  SELECT id, tenant_id, capture_session_id
  INTO v_checkpoint
  FROM public.block_checkpoint
  WHERE id = p_checkpoint_id;

  IF v_checkpoint IS NULL THEN
    RAISE EXCEPTION 'Checkpoint % not found', p_checkpoint_id;
  END IF;

  -- Determine round: count existing gap_questions for this checkpoint
  SELECT COALESCE(MAX(backspelling_round), 0) + 1
  INTO v_round
  FROM public.gap_question
  WHERE block_checkpoint_id = p_checkpoint_id;

  -- Enforce max 2 rounds
  IF v_round > 2 THEN
    RETURN jsonb_build_object('inserted_count', 0, 'reason', 'max_rounds_reached');
  END IF;

  -- Insert gap questions
  FOR v_gap IN SELECT * FROM jsonb_array_elements(p_gaps)
  LOOP
    -- Try to find matching KU by title
    v_ku_id := NULL;
    IF v_gap->>'related_ku_title' IS NOT NULL AND v_gap->>'related_ku_title' != '' THEN
      SELECT id INTO v_ku_id
      FROM public.knowledge_unit
      WHERE block_checkpoint_id = p_checkpoint_id
        AND title = v_gap->>'related_ku_title'
      LIMIT 1;
    END IF;

    INSERT INTO public.gap_question (
      tenant_id, capture_session_id, block_checkpoint_id,
      knowledge_unit_id, question_text, context, subtopic,
      priority, backspelling_round
    ) VALUES (
      v_checkpoint.tenant_id,
      v_checkpoint.capture_session_id,
      p_checkpoint_id,
      v_ku_id,
      v_gap->>'question_text',
      v_gap->>'context',
      v_gap->>'subtopic',
      COALESCE(v_gap->>'priority', 'required'),
      v_round
    );
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted_count', v_inserted_count,
    'round', v_round
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_gap_questions(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_create_gap_questions(uuid, jsonb) TO authenticated;


-- ============================================================
-- (2) rpc_answer_gap_question
-- Kunde beantwortet eine Gap-Frage.
-- Setzt status=answered, answer_text, answered_at.
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_answer_gap_question(
  p_gap_id uuid,
  p_answer_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gap RECORD;
BEGIN
  SELECT id, tenant_id, status
  INTO v_gap
  FROM public.gap_question
  WHERE id = p_gap_id;

  IF v_gap IS NULL THEN
    RAISE EXCEPTION 'Gap question % not found', p_gap_id;
  END IF;

  IF v_gap.status != 'pending' THEN
    RETURN jsonb_build_object('updated', false, 'reason', 'already_' || v_gap.status);
  END IF;

  UPDATE public.gap_question
  SET status = 'answered',
      answer_text = p_answer_text,
      answered_at = now()
  WHERE id = p_gap_id;

  RETURN jsonb_build_object('updated', true);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_answer_gap_question(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_answer_gap_question(uuid, text) TO authenticated;


-- ============================================================
-- (3) rpc_enqueue_recondense_job
-- Erstellt einen ai_job vom Typ recondense_with_gaps.
-- Wird aufgerufen nachdem alle required Gap-Questions beantwortet sind.
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_enqueue_recondense_job(
  p_checkpoint_id uuid,
  p_gap_question_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_checkpoint RECORD;
  v_job_id uuid;
BEGIN
  SELECT id, tenant_id, capture_session_id
  INTO v_checkpoint
  FROM public.block_checkpoint
  WHERE id = p_checkpoint_id;

  IF v_checkpoint IS NULL THEN
    RAISE EXCEPTION 'Checkpoint % not found', p_checkpoint_id;
  END IF;

  INSERT INTO public.ai_jobs (
    tenant_id, job_type, status, payload
  ) VALUES (
    v_checkpoint.tenant_id,
    'recondense_with_gaps',
    'pending',
    jsonb_build_object(
      'block_checkpoint_id', p_checkpoint_id,
      'capture_session_id', v_checkpoint.capture_session_id,
      'gap_question_ids', to_jsonb(p_gap_question_ids)
    )
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('job_id', v_job_id);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_enqueue_recondense_job(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_enqueue_recondense_job(uuid, uuid[]) TO authenticated;

COMMIT;
