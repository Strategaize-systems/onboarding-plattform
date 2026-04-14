-- Migration 020: V3.4 Feedback — run_feedback
-- Datum: 2026-04-13
-- Feature: FEAT-036

-- ============================================================
-- 1. run_feedback — Strukturiertes Feedback zum Fragebogen
-- ============================================================
CREATE TABLE IF NOT EXISTS run_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  response_text TEXT,
  response_rating INT CHECK (response_rating >= 1 AND response_rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, question_key)
);

COMMENT ON TABLE run_feedback IS 'Depersonalisiertes Feedback zum Fragebogen. Kein created_by (DEC-043).';
COMMENT ON COLUMN run_feedback.question_key IS 'Feste Keys: coverage, clarity, improvements, overall';
COMMENT ON COLUMN run_feedback.response_rating IS 'Nur fuer question_key=overall (1-5)';

-- ============================================================
-- 2. RLS
-- ============================================================
ALTER TABLE run_feedback ENABLE ROW LEVEL SECURITY;

-- SELECT: Tenant kann eigenes Feedback lesen (nur tenant_admin/tenant_owner)
CREATE POLICY "feedback_select_own" ON run_feedback
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = auth.user_tenant_id()
    AND auth.user_role() IN ('tenant_admin', 'tenant_owner')
  );

-- INSERT: Tenant kann Feedback erstellen (nur wenn Run submitted/locked + management)
CREATE POLICY "feedback_insert_own" ON run_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = auth.user_tenant_id()
    AND auth.user_role() IN ('tenant_admin', 'tenant_owner')
    AND EXISTS (
      SELECT 1 FROM runs r
      WHERE r.id = run_id
      AND r.status IN ('submitted', 'locked')
      AND r.survey_type = 'management'
    )
  );

-- UPDATE: Tenant kann eigenes Feedback aendern
CREATE POLICY "feedback_update_own" ON run_feedback
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = auth.user_tenant_id()
    AND auth.user_role() IN ('tenant_admin', 'tenant_owner')
  );

-- Kein DELETE — Feedback wird nur ueberschrieben, nie geloescht (DEC-045)

-- ============================================================
-- 3. GRANTs
-- ============================================================
GRANT ALL ON run_feedback TO authenticated;
GRANT ALL ON run_feedback TO service_role;
