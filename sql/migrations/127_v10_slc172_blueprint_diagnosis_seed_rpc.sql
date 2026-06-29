-- Migration 127: V10 StB-Vertikale — Blueprint-Diagnose KU-Seed-RPC
-- SLC-172 MT-2 (FEAT-092 Blueprint, BL-511) — DEC-244 / DEC-249 / DEC-250
--
-- ZIEL
-- ====
-- EINE atomare, idempotente PL/pgSQL-RPC, die aus den Capture-Antworten einer
-- Blueprint-Session (template stb_blueprint_kanzlei, MIG-126) die Diagnose-Inputs
-- seedet: pro Diagnose-Block A–G einen Pseudo-block_checkpoint + je Unterthema
-- eine knowledge_unit (status='accepted', source='questionnaire'). Danach
-- enqueued die Server-Action triggerBlueprintDiagnosis 7 diagnosis_generation-
-- Jobs; der bestehende Worker handle-diagnosis-job (REUSE, unveraendert) liest
-- diese KUs und schreibt block_diagnosis (Ampel/Reifegrad/Empfehlung).
--
-- WARUM EINE RPC (backend.md Decision-Tree, DEC-244/249)
-- =====================================================
-- supabase-js hat keine echte BEGIN/COMMIT-Semantik fuer Multi-Entity-Writes.
-- Der Seed schreibt pro Session bis zu 7 Checkpoints + 13 KUs in EINER
-- Transaktion (EXCEPTION = impliziter ROLLBACK = 0 Rows). Pattern-Referenz:
-- rpc_finalize_partner_diagnostic (MIG-094), rpc_bulk_import_knowledge_units
-- (MIG-035).
--
-- CHECKPOINT-MODELL (DEC-250 — Aufloesung der /architecture-Offenfrage)
-- ====================================================================
-- block_diagnosis.block_checkpoint_id ist NOT NULL → ein FK auf block_checkpoint,
-- ABER ohne Constraint, dass checkpoint.block_key == diagnosis.block_key (MIG-050).
-- knowledge_unit.block_checkpoint_id ist ebenfalls NOT NULL (MIG-021) → die
-- geseedeten KUs brauchen ohnehin einen Checkpoint. Statt den stufe1/stufe2-
-- Capture-Checkpoint querzukoppeln (Capture-Bloecke != Diagnose-Bloecke A–G,
-- MIG-126 Build-Flag 1), legt der Seed pro A–G einen eigenen Pseudo-Checkpoint
-- (checkpoint_type='blueprint_diagnosis_seed') an. Damit bleibt die Invariante
-- checkpoint.block_key == knowledge_unit.block_key == block_diagnosis.block_key
-- erhalten — identisch zum Standard-exit_readiness-Flow. Precedent fuer Pseudo-
-- Checkpoints pro Sonderflow: 'email_bulk_import' (MIG-110), 'auto_final' (MIG-094).
--
-- IDEMPOTENZ
-- ==========
-- CREATE OR REPLACE = re-applicable. Zur Laufzeit: der Seed DELETEt zuerst die
-- bisherigen 'blueprint_diagnosis_seed'-Checkpoints der Session; der FK-CASCADE
-- raeumt die geseedeten knowledge_unit- UND block_diagnosis-Rows mit ab (beide
-- ON DELETE CASCADE auf block_checkpoint). Re-Run = sauberer Re-Seed.
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/127_v10_slc172_blueprint_diagnosis_seed_rpc.sql
--   echo '<BASE64>' | base64 -d > /tmp/127_v10.sql
--   DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep ^supabase-db)
--   docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < /tmp/127_v10.sql
--
-- VERIFIKATION (nach Apply)
-- =========================
--   \df rpc_seed_blueprint_diagnosis_input
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conname = 'block_checkpoint_checkpoint_type_check';
--   -- erwartet: 1 Function (security_definer, returns jsonb)
--   --           CHECK mit 6 Werten (+ blueprint_diagnosis_seed)

-- ============================================================
-- (1) checkpoint_type CHECK erweitern um 'blueprint_diagnosis_seed'
--     (dynamischer DROP wie MIG-091/110 — Constraint-Name robust auffinden)
-- ============================================================
DO $mig127_check$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
  WHERE rel.relname = 'block_checkpoint'
    AND con.contype = 'c'
    AND a.attname = 'checkpoint_type';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE block_checkpoint DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped block_checkpoint.checkpoint_type CHECK: %', v_constraint_name;
  END IF;

  ALTER TABLE block_checkpoint
    ADD CONSTRAINT block_checkpoint_checkpoint_type_check
    CHECK (checkpoint_type IN (
      'questionnaire_submit', 'meeting_final', 'backspelling_recondense',
      'auto_final', 'email_bulk_import', 'blueprint_diagnosis_seed'
    ));
  RAISE NOTICE 'MIG-127: block_checkpoint.checkpoint_type CHECK recreated with +blueprint_diagnosis_seed';
END $mig127_check$;

-- ============================================================
-- (2) rpc_seed_blueprint_diagnosis_input
-- ============================================================
-- public.-Prefix + SET search_path = public gegen die storage-vor-public-Falle
-- auf dem Hetzner-Container (vgl. MIG-094).
CREATE OR REPLACE FUNCTION public.rpc_seed_blueprint_diagnosis_input(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_tenant_id    uuid;
  v_owner        uuid;
  v_template_id  uuid;
  v_answers      jsonb;
  v_blocks       jsonb;
  v_dschema      jsonb;
  v_qmap         jsonb;
  v_block_key    text;
  v_block        jsonb;
  v_cp_id        uuid;
  v_subtopic     jsonb;
  v_qkey         text;
  v_q            jsonb;
  v_ans          text;
  v_body         text;
  v_block_count  int := 0;
  v_ku_count     int := 0;
  v_blocks_out   jsonb := '[]'::jsonb;
BEGIN
  -- 1. Session laden (tenant/owner fuer die Schreib-Rows, answers fuer die KUs).
  SELECT tenant_id, owner_user_id, template_id, COALESCE(answers, '{}'::jsonb)
    INTO v_tenant_id, v_owner, v_template_id, v_answers
  FROM capture_session
  WHERE id = p_session_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'capture_session % nicht gefunden', p_session_id;
  END IF;

  -- 2. Template laden: blocks (Capture-Fragen) + diagnosis_schema (Diagnose-Bloecke A–G).
  SELECT blocks, diagnosis_schema
    INTO v_blocks, v_dschema
  FROM template
  WHERE id = v_template_id;

  IF v_dschema IS NULL OR jsonb_typeof(v_dschema->'blocks') <> 'object' THEN
    RAISE EXCEPTION 'Template % hat kein diagnosis_schema.blocks — Blueprint-Seed nicht moeglich', v_template_id;
  END IF;

  -- 3. Reconciliation-Map frage_id -> {Capture-block_key, Frage-UUID, Text}.
  --    answers sind unter '<capture_block_key>.<frage-uuid>' abgelegt (questionnaire-
  --    form), waehrend diagnosis_schema die Fragen ueber frage_id (F-BP-xxx) referenziert.
  SELECT jsonb_object_agg(
           q->>'frage_id',
           jsonb_build_object('bk', b->>'key', 'qid', q->>'id', 'text', q->>'text')
         )
    INTO v_qmap
  FROM jsonb_array_elements(COALESCE(v_blocks, '[]'::jsonb)) AS b,
       jsonb_array_elements(b->'questions') AS q;

  v_qmap := COALESCE(v_qmap, '{}'::jsonb);

  -- 4. Idempotenz: bisherige Seed-Artefakte dieser Session entfernen.
  --    CASCADE auf block_checkpoint raeumt geseedete KUs + block_diagnosis mit ab.
  DELETE FROM block_checkpoint
   WHERE capture_session_id = p_session_id
     AND checkpoint_type = 'blueprint_diagnosis_seed';

  -- 5. Pro Diagnose-Block A–G: 1 Pseudo-Checkpoint + 1 KU je Unterthema.
  FOR v_block_key, v_block IN
    SELECT key, value FROM jsonb_each(v_dschema->'blocks')
  LOOP
    INSERT INTO block_checkpoint (
      tenant_id, capture_session_id, block_key, checkpoint_type,
      content, content_hash, created_by
    )
    VALUES (
      v_tenant_id, p_session_id, v_block_key, 'blueprint_diagnosis_seed',
      jsonb_build_object('seeded', true, 'block_key', v_block_key, 'source', 'blueprint_capture'),
      encode(digest(p_session_id::text || ':' || v_block_key, 'sha256'), 'hex'),
      v_owner
    )
    RETURNING id INTO v_cp_id;

    FOR v_subtopic IN SELECT * FROM jsonb_array_elements(v_block->'subtopics')
    LOOP
      v_body := '';
      FOR v_qkey IN SELECT jsonb_array_elements_text(v_subtopic->'question_keys')
      LOOP
        v_q := v_qmap->v_qkey;
        IF v_q IS NULL THEN
          CONTINUE;  -- frage_id nicht im Template (Schema-Drift) -> ueberspringen
        END IF;
        v_ans := NULLIF(btrim(COALESCE(v_answers->>((v_q->>'bk') || '.' || (v_q->>'qid')), '')), '');
        v_body := v_body
          || 'Frage (' || v_qkey || '): ' || COALESCE(v_q->>'text', '') || E'\n'
          || 'Antwort: ' || COALESCE(v_ans, '(nicht beantwortet)') || E'\n\n';
      END LOOP;

      INSERT INTO knowledge_unit (
        tenant_id, capture_session_id, block_checkpoint_id, block_key,
        unit_type, source, title, body, confidence, status
      )
      VALUES (
        v_tenant_id, p_session_id, v_cp_id, v_block_key,
        'observation', 'questionnaire',
        COALESCE(v_subtopic->>'name', v_block_key), btrim(v_body), 'medium', 'accepted'
      );
      v_ku_count := v_ku_count + 1;
    END LOOP;

    v_blocks_out := v_blocks_out
      || jsonb_build_object('block_key', v_block_key, 'checkpoint_id', v_cp_id);
    v_block_count := v_block_count + 1;
  END LOOP;

  IF v_block_count = 0 THEN
    RAISE EXCEPTION 'diagnosis_schema.blocks ist leer — Seed verweigert';
  END IF;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'block_count', v_block_count,
    'ku_count', v_ku_count,
    'blocks', v_blocks_out
  );
END;
$func$;

COMMENT ON FUNCTION public.rpc_seed_blueprint_diagnosis_input(uuid) IS
  'V10 SLC-172 MT-2: atomarer, idempotenter Blueprint-Diagnose-Seed. Pro Diagnose-Block A–G ein Pseudo-block_checkpoint (blueprint_diagnosis_seed) + je Unterthema eine knowledge_unit (accepted/questionnaire) aus den Capture-Antworten. DEC-244/249/250. Aufgerufen von triggerBlueprintDiagnosis.';

GRANT EXECUTE ON FUNCTION public.rpc_seed_blueprint_diagnosis_input(uuid) TO service_role;

-- Cleanup: falls die Funktion bei einem fruehen Apply versehentlich im storage-
-- Schema landete (search_path-Falle), explizit droppen. Idempotent.
DROP FUNCTION IF EXISTS storage.rpc_seed_blueprint_diagnosis_input(uuid);
