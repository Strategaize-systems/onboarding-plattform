-- Migration 054: RPCs for Evidence Chunk Management + Cost Ledger Role Update
-- SLC-019 MT-5 — Evidence-Extraction + Mapping (FEAT-013)

BEGIN;

-- =============================================
-- 1. rpc_create_evidence_chunks — Bulk INSERT evidence_chunk rows
-- =============================================
CREATE OR REPLACE FUNCTION rpc_create_evidence_chunks(
  p_file_id uuid,
  p_tenant_id uuid,
  p_chunks jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  chunk_count integer := 0;
  chunk_item jsonb;
BEGIN
  FOR chunk_item IN SELECT * FROM jsonb_array_elements(p_chunks)
  LOOP
    INSERT INTO evidence_chunk (
      tenant_id,
      evidence_file_id,
      chunk_index,
      chunk_text,
      mapping_suggestion,
      mapping_status
    ) VALUES (
      p_tenant_id,
      p_file_id,
      (chunk_item->>'chunk_index')::integer,
      chunk_item->>'chunk_text',
      chunk_item->'mapping_suggestion',
      COALESCE(chunk_item->>'mapping_status', 'pending')
    )
    ON CONFLICT (evidence_file_id, chunk_index) DO UPDATE SET
      chunk_text = EXCLUDED.chunk_text,
      mapping_suggestion = EXCLUDED.mapping_suggestion,
      mapping_status = EXCLUDED.mapping_status;

    chunk_count := chunk_count + 1;
  END LOOP;

  RETURN chunk_count;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_evidence_chunks(uuid, uuid, jsonb) TO service_role;

-- =============================================
-- 2. rpc_confirm_evidence_mapping — Confirm a mapping suggestion
-- =============================================
CREATE OR REPLACE FUNCTION rpc_confirm_evidence_mapping(
  p_chunk_id uuid,
  p_question_id uuid,
  p_block_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE evidence_chunk SET
    mapping_status = 'confirmed',
    confirmed_question_id = p_question_id,
    confirmed_block_key = p_block_key
  WHERE id = p_chunk_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidence chunk % not found', p_chunk_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_confirm_evidence_mapping(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_confirm_evidence_mapping(uuid, uuid, text) TO authenticated;

-- =============================================
-- 3. rpc_reject_evidence_mapping — Reject a mapping suggestion
-- =============================================
CREATE OR REPLACE FUNCTION rpc_reject_evidence_mapping(
  p_chunk_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE evidence_chunk SET
    mapping_status = 'rejected',
    confirmed_question_id = NULL,
    confirmed_block_key = NULL
  WHERE id = p_chunk_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidence chunk % not found', p_chunk_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_reject_evidence_mapping(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_reject_evidence_mapping(uuid) TO authenticated;

-- =============================================
-- 4. rpc_update_evidence_file_status — Update extraction status
-- =============================================
CREATE OR REPLACE FUNCTION rpc_update_evidence_file_status(
  p_file_id uuid,
  p_status text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE evidence_file SET
    extraction_status = p_status,
    extraction_error = p_error
  WHERE id = p_file_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidence file % not found', p_file_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_update_evidence_file_status(uuid, text, text) TO service_role;

-- =============================================
-- 5. Update ai_cost_ledger role CHECK to include evidence_mapper
-- =============================================
ALTER TABLE ai_cost_ledger DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check;

ALTER TABLE ai_cost_ledger ADD CONSTRAINT ai_cost_ledger_role_check
  CHECK (role IN (
    'analyst',
    'challenger',
    'chat',
    'memory',
    'embedding',
    'orchestrator',
    'sop_generator',
    'diagnosis_generator',
    'evidence_mapper'
  ));

COMMIT;
