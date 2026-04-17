-- Migration 032: Onboarding-Plattform V1 — RPC fuer Block-Submit
-- Datum: 2026-04-17
-- Slice: SLC-006 MT-2
-- Dependencies: 021 (block_checkpoint), 031 (ai_jobs)
--
-- Atomare Funktion: Erstellt block_checkpoint + enqueued ai_job in einer Transaktion.
-- SHA-256 Hash wird server-seitig aus kanonisiertem JSONB berechnet.
-- Idempotenz: gleicher Hash innerhalb 2 Sekunden → kein Duplikat.

CREATE OR REPLACE FUNCTION rpc_create_block_checkpoint(
  p_session_id    uuid,
  p_block_key     text,
  p_checkpoint_type text,
  p_content       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid;
  v_tenant_id     uuid;
  v_content_canon text;
  v_content_hash  text;
  v_existing_id   uuid;
  v_checkpoint_id uuid;
  v_job_id        uuid;
BEGIN
  -- 1. Auth: User aus JWT
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  -- 2. Session laden + Tenant-Zugehoerigkeit pruefen
  SELECT tenant_id INTO v_tenant_id
  FROM capture_session
  WHERE id = p_session_id
    AND tenant_id = auth.user_tenant_id();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Session nicht gefunden oder kein Zugriff';
  END IF;

  -- 3. Checkpoint-Type validieren
  IF p_checkpoint_type NOT IN ('questionnaire_submit', 'meeting_final') THEN
    RAISE EXCEPTION 'Ungueltiger Checkpoint-Typ: %', p_checkpoint_type;
  END IF;

  -- 4. Kanonischer Hash: jsonb_strip_nulls normalisiert, ::text ist deterministisch
  v_content_canon := jsonb_strip_nulls(p_content)::text;
  v_content_hash  := encode(digest(v_content_canon, 'sha256'), 'hex');

  -- 5. Idempotenz-Check: gleicher Block + gleicher Hash innerhalb 2s
  SELECT id INTO v_existing_id
  FROM block_checkpoint
  WHERE capture_session_id = p_session_id
    AND block_key = p_block_key
    AND content_hash = v_content_hash
    AND created_at > now() - interval '2 seconds';

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'checkpoint_id', v_existing_id,
      'job_id', NULL,
      'deduplicated', true
    );
  END IF;

  -- 6. Checkpoint schreiben
  INSERT INTO block_checkpoint (
    tenant_id, capture_session_id, block_key,
    checkpoint_type, content, content_hash, created_by
  )
  VALUES (
    v_tenant_id, p_session_id, p_block_key,
    p_checkpoint_type, p_content, v_content_hash, v_user_id
  )
  RETURNING id INTO v_checkpoint_id;

  -- 7. Verdichtungs-Job enqueuen (bleibt pending bis SLC-008 Worker)
  INSERT INTO ai_jobs (tenant_id, job_type, payload)
  VALUES (
    v_tenant_id,
    'knowledge_unit_condensation',
    jsonb_build_object('block_checkpoint_id', v_checkpoint_id)
  )
  RETURNING id INTO v_job_id;

  -- 8. Ergebnis
  RETURN jsonb_build_object(
    'checkpoint_id', v_checkpoint_id,
    'job_id', v_job_id,
    'deduplicated', false
  );
END;
$$;

-- Grant: authenticated darf die RPC aufrufen (RLS-Check geschieht innerhalb)
GRANT EXECUTE ON FUNCTION rpc_create_block_checkpoint(uuid, text, text, jsonb)
  TO authenticated;
