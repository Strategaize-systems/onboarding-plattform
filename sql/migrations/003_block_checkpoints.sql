-- Migration 003: Block-basierte Checkpoints
-- run_submissions bekommt block Column
-- run_submit() wird erweitert um p_block Parameter
-- Datum: 2026-03-27

-- 1. Add block column (default 'ALL' for existing rows)
ALTER TABLE run_submissions ADD COLUMN IF NOT EXISTS block text NOT NULL DEFAULT 'ALL';

-- 2. Drop old unique constraint and create new one (run_id + block + snapshot_version)
ALTER TABLE run_submissions DROP CONSTRAINT IF EXISTS run_submissions_run_id_snapshot_version_key;
ALTER TABLE run_submissions ADD CONSTRAINT run_submissions_run_id_block_snapshot_version_key
  UNIQUE (run_id, block, snapshot_version);

-- 3. Index for block-filtered queries
CREATE INDEX IF NOT EXISTS idx_submissions_run_block ON run_submissions (run_id, block);

-- 4. Drop old function signature (2 params) before creating new one (3 params)
DROP FUNCTION IF EXISTS run_submit(uuid, text);

-- 5. Create new run_submit() function with block parameter
CREATE OR REPLACE FUNCTION run_submit(
  p_run_id uuid,
  p_block  text,
  p_note   text DEFAULT NULL
)
RETURNS run_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id    uuid;
  v_user_id      uuid;
  v_next_version integer;
  v_submission   run_submissions;
BEGIN
  -- Session-Check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Not authenticated';
  END IF;

  -- Rollen-Check
  IF auth.user_role() NOT IN ('tenant_owner', 'tenant_member') THEN
    RAISE EXCEPTION 'FORBIDDEN: Only tenant users can submit';
  END IF;

  -- Block validation
  IF p_block IS NULL OR p_block = '' THEN
    RAISE EXCEPTION 'UNPROCESSABLE: Block parameter is required';
  END IF;

  -- Run validieren + Tenant prüfen
  SELECT t.id INTO v_tenant_id
  FROM runs r
  JOIN tenants t ON r.tenant_id = t.id
  JOIN profiles p ON p.tenant_id = t.id AND p.id = v_user_id
  WHERE r.id = p_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Run not found or not authorized';
  END IF;

  -- Locked-Check
  IF EXISTS (SELECT 1 FROM runs WHERE id = p_run_id AND status = 'locked') THEN
    RAISE EXCEPTION 'FORBIDDEN: Run is locked';
  END IF;

  -- Mindestens ein Event im Block muss existieren
  IF NOT EXISTS (
    SELECT 1 FROM question_events qe
    JOIN questions q ON q.id = qe.question_id
    WHERE q.catalog_snapshot_id = (SELECT catalog_snapshot_id FROM runs WHERE id = p_run_id)
    AND q.block = p_block
  ) THEN
    RAISE EXCEPTION 'UNPROCESSABLE: No question events in block %', p_block;
  END IF;

  -- Nächste Snapshot-Version berechnen (pro Run + Block)
  SELECT COALESCE(MAX(snapshot_version), 0) + 1
  INTO v_next_version
  FROM run_submissions
  WHERE run_id = p_run_id AND block = p_block;

  -- Submission erstellen
  INSERT INTO run_submissions (run_id, tenant_id, submitted_by, snapshot_version, note, block)
  VALUES (p_run_id, v_tenant_id, v_user_id, v_next_version, p_note, p_block)
  RETURNING * INTO v_submission;

  -- Run status auf submitted setzen (nur wenn noch collecting)
  UPDATE runs
  SET status = 'submitted', submitted_at = now()
  WHERE id = p_run_id AND status = 'collecting';

  RETURN v_submission;
END;
$$;
