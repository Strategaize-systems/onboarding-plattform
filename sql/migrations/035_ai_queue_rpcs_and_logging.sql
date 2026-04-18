-- Migration 035: Onboarding-Plattform V1 — Queue-RPCs + Cost-Ledger + Iterations-Log
-- Datum: 2026-04-18
-- Slice: SLC-008 MT-1
-- Dependencies: 031 (ai_jobs), 021 (knowledge_unit, block_checkpoint, capture_session)
--
-- Erstellt die RPCs fuer den Worker-Claim-Loop und die Logging-Tabellen
-- fuer Kosten-Tracking und Iterations-Verlauf.

-- ============================================================
-- AI_COST_LEDGER — Pro-Call Kosten-Tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_cost_ledger (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  job_id          uuid        REFERENCES ai_jobs ON DELETE SET NULL,
  model_id        text        NOT NULL,
  tokens_in       integer     NOT NULL DEFAULT 0,
  tokens_out      integer     NOT NULL DEFAULT 0,
  usd_cost        numeric(10,6) NOT NULL DEFAULT 0,
  duration_ms     integer     NOT NULL DEFAULT 0,
  iteration       integer,
  role            text        CHECK (role IN ('analyst', 'challenger', 'chat', 'memory')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_tenant
  ON ai_cost_ledger (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_cost_ledger_job
  ON ai_cost_ledger (job_id)
  WHERE job_id IS NOT NULL;

ALTER TABLE ai_cost_ledger ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: Vollzugriff
CREATE POLICY "ai_cost_ledger_admin_full"
  ON ai_cost_ledger FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant: Lesen eigener Kosten
CREATE POLICY "ai_cost_ledger_tenant_read"
  ON ai_cost_ledger FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

-- GRANTs fuer service_role (Worker schreibt via adminClient)
GRANT ALL ON ai_cost_ledger TO service_role;
GRANT SELECT ON ai_cost_ledger TO authenticated;

-- ============================================================
-- AI_ITERATIONS_LOG — Iterations-Verlauf pro Job
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_iterations_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid        NOT NULL REFERENCES ai_jobs ON DELETE CASCADE,
  iteration_number  integer     NOT NULL,
  role              text        NOT NULL CHECK (role IN ('analyst', 'challenger')),
  verdict           text        CHECK (verdict IN ('ACCEPTED', 'ACCEPTED_WITH_NOTES', 'NEEDS_REVISION', 'REJECTED')),
  findings_count    integer     DEFAULT 0,
  subtopic_coverage integer     DEFAULT 0,
  prompt_tokens     integer     DEFAULT 0,
  completion_tokens integer     DEFAULT 0,
  duration_ms       integer     DEFAULT 0,
  metadata          jsonb       DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_iterations_log_job
  ON ai_iterations_log (job_id, iteration_number, role);

ALTER TABLE ai_iterations_log ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: Vollzugriff
CREATE POLICY "ai_iterations_log_admin_full"
  ON ai_iterations_log FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ai_jobs j
      WHERE j.id = ai_iterations_log.job_id
        AND auth.user_role() = 'strategaize_admin'
    )
  )
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant: Lesen eigener Iterations (via ai_jobs.tenant_id)
CREATE POLICY "ai_iterations_log_tenant_read"
  ON ai_iterations_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ai_jobs j
      WHERE j.id = ai_iterations_log.job_id
        AND j.tenant_id = auth.user_tenant_id()
    )
  );

GRANT ALL ON ai_iterations_log TO service_role;
GRANT SELECT ON ai_iterations_log TO authenticated;

-- ============================================================
-- RPC: rpc_claim_next_ai_job_for_type
-- Worker-Polling: Claime den aeltesten pending Job per SKIP LOCKED.
-- Setzt status = 'claimed' + claimed_at. Gibt Job-Row als JSON zurueck.
-- Null wenn kein Job verfuegbar.
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_claim_next_ai_job_for_type(p_job_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
BEGIN
  -- Claim aeltesten pending Job mit SKIP LOCKED (concurrency-safe)
  SELECT id, tenant_id, job_type, payload, status, created_at
  INTO v_job
  FROM ai_jobs
  WHERE status = 'pending'
    AND job_type = p_job_type
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- Kein Job gefunden
  IF v_job IS NULL THEN
    RETURN NULL;
  END IF;

  -- Status auf claimed setzen
  UPDATE ai_jobs
  SET status = 'claimed',
      claimed_at = now()
  WHERE id = v_job.id;

  -- Job-Daten zurueckgeben
  RETURN jsonb_build_object(
    'id', v_job.id,
    'tenant_id', v_job.tenant_id,
    'job_type', v_job.job_type,
    'payload', v_job.payload,
    'created_at', v_job.created_at
  );
END;
$$;

-- Nur service_role darf claimen (Worker laeuft mit service_role)
GRANT EXECUTE ON FUNCTION rpc_claim_next_ai_job_for_type(text) TO service_role;

-- ============================================================
-- RPC: rpc_complete_ai_job
-- Worker markiert Job als completed.
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_complete_ai_job(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ai_jobs
  SET status = 'completed',
      completed_at = now()
  WHERE id = p_job_id
    AND status IN ('claimed', 'running');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % nicht gefunden oder nicht im richtigen Status', p_job_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_complete_ai_job(uuid) TO service_role;

-- ============================================================
-- RPC: rpc_fail_ai_job
-- Worker markiert Job als failed mit Fehlertext.
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_fail_ai_job(p_job_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ai_jobs
  SET status = 'failed',
      completed_at = now(),
      error = p_error
  WHERE id = p_job_id
    AND status IN ('claimed', 'running');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % nicht gefunden oder nicht im richtigen Status', p_job_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_fail_ai_job(uuid, text) TO service_role;

-- ============================================================
-- RPC: rpc_bulk_import_knowledge_units
-- Worker schreibt finale Knowledge Units aus der Verdichtung.
-- Input: JSON-Array von KU-Objekten. Alle gehoeren zum selben Checkpoint.
-- ============================================================

CREATE OR REPLACE FUNCTION rpc_bulk_import_knowledge_units(p_units jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit jsonb;
  v_inserted_count integer := 0;
  v_ids uuid[] := '{}';
  v_new_id uuid;
BEGIN
  -- Validierung: Input muss ein Array sein
  IF jsonb_typeof(p_units) != 'array' THEN
    RAISE EXCEPTION 'p_units muss ein JSON-Array sein';
  END IF;

  -- Jedes Element einfuegen
  FOR v_unit IN SELECT * FROM jsonb_array_elements(p_units)
  LOOP
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
      evidence_refs,
      status
    )
    VALUES (
      (v_unit->>'tenant_id')::uuid,
      (v_unit->>'capture_session_id')::uuid,
      (v_unit->>'block_checkpoint_id')::uuid,
      v_unit->>'block_key',
      v_unit->>'unit_type',
      COALESCE(v_unit->>'source', 'ai_draft'),
      v_unit->>'title',
      v_unit->>'body',
      COALESCE(v_unit->>'confidence', 'medium'),
      COALESCE(v_unit->'evidence_refs', '[]'::jsonb),
      'proposed'
    )
    RETURNING id INTO v_new_id;

    v_ids := array_append(v_ids, v_new_id);
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted_count', v_inserted_count,
    'ids', to_jsonb(v_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_bulk_import_knowledge_units(jsonb) TO service_role;
