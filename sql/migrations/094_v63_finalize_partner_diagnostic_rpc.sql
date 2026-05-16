-- Migration 094: V6.3 rpc_finalize_partner_diagnostic — atomare DGN-A-Finalisierung
-- SLC-105 / FEAT-045 / MT-4 — DEC-100, DEC-105, DEC-124, DEC-126
--
-- ZIEL
-- ====
-- Eine RPC, die alle DGN-A-Schreib-Operationen in EINER Postgres-Transaktion ausfuehrt:
--   - block_checkpoint (checkpoint_type='auto_final', content_hash deterministisch)
--   - knowledge_unit   (status='accepted', metadata.score + metadata.comment, source='questionnaire')
--   - validation_layer (reviewer_role='system_auto', action='accept', note='Auto-Finalize per DGN-A')
--   - capture_session  (status='finalized')
-- pro Block, fuer 1..N Bloecke (in V6.3 sind es 6).
--
-- Wird vom Worker-Branch `runLightPipeline` in src/workers/condensation/light-pipeline.ts
-- aufgerufen, nachdem `computeBlockScores` + Bedrock-Verdichtungs-Comments fertig sind.
--
-- Begruendung Stored-Proc statt sequenzieller adminClient-Inserts:
-- Supabase-JS hat keine echte BEGIN/COMMIT-Semantik fuer Multi-Table-Inserts.
-- Architektur (ARCHITECTURE.md V6.3 Phase 4c) verlangt "BEGIN TRANSACTION ... COMMIT" ueber alle
-- Bloecke + capture_session-Update. Stored-Proc ist die einzige saubere Loesung.
--
-- Pattern-Referenz: rpc_bulk_import_knowledge_units (MIG-035).
--
-- IDEMPOTENZ
-- ==========
-- CREATE OR REPLACE FUNCTION ist idempotent. Migration 094 ist re-applicable ohne Effekt.
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/094_v63_finalize_partner_diagnostic_rpc.sql
--   echo '<BASE64>' | base64 -d > /tmp/094_v63.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/094_v63.sql
--
-- PRE-APPLY-BACKUP-PFLICHT
-- ========================
-- Keine bestehenden Daten betroffen (nur neue Function). KEIN Backup noetig.
--
-- VERIFIKATION (nach Apply)
-- =========================
--   \df rpc_finalize_partner_diagnostic
--   -> 1 Function, security_definer, returns jsonb

-- Hinweis: Auf dem Hetzner-Container hat 'postgres' search_path = """", storage, public, ...
-- (storage liegt VOR public). Ohne explizitem public.-Prefix landet die Funktion im storage-Schema.
-- Daher fix-prefixed: public.rpc_finalize_partner_diagnostic.

CREATE OR REPLACE FUNCTION public.rpc_finalize_partner_diagnostic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_session_id        uuid;
  v_tenant_id         uuid;
  v_owner_user_id     uuid;
  v_block             jsonb;
  v_block_count       integer := 0;
  v_new_checkpoint_id uuid;
  v_new_ku_id         uuid;
  v_new_vl_id         uuid;
  v_ku_ids            uuid[] := '{}';
BEGIN
  -- Pflicht-Felder
  v_session_id    := (p_payload->>'capture_session_id')::uuid;
  v_tenant_id     := (p_payload->>'tenant_id')::uuid;
  v_owner_user_id := (p_payload->>'owner_user_id')::uuid;

  IF v_session_id IS NULL OR v_tenant_id IS NULL OR v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'p_payload requires capture_session_id, tenant_id, owner_user_id (got %)', p_payload;
  END IF;

  IF jsonb_typeof(p_payload->'blocks') != 'array' THEN
    RAISE EXCEPTION 'p_payload.blocks muss ein JSON-Array sein';
  END IF;

  FOR v_block IN SELECT * FROM jsonb_array_elements(p_payload->'blocks')
  LOOP
    INSERT INTO block_checkpoint (
      tenant_id,
      capture_session_id,
      block_key,
      checkpoint_type,
      content,
      content_hash,
      created_by
    )
    VALUES (
      v_tenant_id,
      v_session_id,
      v_block->>'block_key',
      'auto_final',
      v_block->'content',
      v_block->>'content_hash',
      v_owner_user_id
    )
    RETURNING id INTO v_new_checkpoint_id;

    INSERT INTO knowledge_unit (
      tenant_id,
      capture_session_id,
      block_checkpoint_id,
      block_key,
      unit_type,
      source,
      title,
      body,
      confidence,
      status,
      metadata
    )
    VALUES (
      v_tenant_id,
      v_session_id,
      v_new_checkpoint_id,
      v_block->>'block_key',
      'finding',
      'questionnaire',
      v_block->>'title',
      v_block->>'body',
      'medium',
      'accepted',
      COALESCE(v_block->'metadata', '{}'::jsonb)
    )
    RETURNING id INTO v_new_ku_id;

    INSERT INTO validation_layer (
      tenant_id,
      knowledge_unit_id,
      reviewer_user_id,
      reviewer_role,
      action,
      previous_status,
      new_status,
      note
    )
    VALUES (
      v_tenant_id,
      v_new_ku_id,
      v_owner_user_id,
      'system_auto',
      'accept',
      'proposed',
      'accepted',
      'Auto-Finalize per DGN-A'
    )
    RETURNING id INTO v_new_vl_id;

    v_ku_ids := array_append(v_ku_ids, v_new_ku_id);
    v_block_count := v_block_count + 1;
  END LOOP;

  IF v_block_count = 0 THEN
    RAISE EXCEPTION 'p_payload.blocks ist leer — Finalisierung verweigert';
  END IF;

  UPDATE capture_session
     SET status = 'finalized',
         updated_at = now()
   WHERE id = v_session_id
     AND tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'capture_session % (tenant %) nicht gefunden', v_session_id, v_tenant_id;
  END IF;

  RETURN jsonb_build_object(
    'block_count', v_block_count,
    'knowledge_unit_ids', to_jsonb(v_ku_ids),
    'capture_session_id', v_session_id
  );
END;
$func$;

COMMENT ON FUNCTION public.rpc_finalize_partner_diagnostic(jsonb) IS
  'V6.3 DGN-A atomare Finalisierung: pro Block block_checkpoint+knowledge_unit+validation_layer INSERT, plus capture_session.status=finalized. Aufgerufen von runLightPipeline (SLC-105). MIG-038.';

GRANT EXECUTE ON FUNCTION public.rpc_finalize_partner_diagnostic(jsonb) TO service_role;

-- Cleanup: falls bei einem fruehen Apply die Funktion versehentlich im storage-Schema
-- landete (search_path-Falle), explizit droppen. Idempotent — DROP IF EXISTS.
DROP FUNCTION IF EXISTS storage.rpc_finalize_partner_diagnostic(jsonb);
