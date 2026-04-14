-- Migration 016: Mirror RLS — survey_type-aware Policies (V3)
-- Datum: 2026-04-04
-- Feature: FEAT-029 — Mirror-Rollen und Sichtbarkeit

-- ============================================================
-- RUNS: Tenant sieht nur Management, Mirror-Respondent sieht nur Mirror
-- ============================================================
DROP POLICY IF EXISTS "tenant_select_own_runs" ON runs;

CREATE POLICY "tenant_select_own_runs"
  ON runs FOR SELECT
  TO authenticated
  USING (
    (auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member')
     AND tenant_id = auth.user_tenant_id()
     AND survey_type = 'management')
    OR
    (auth.user_role() = 'mirror_respondent'
     AND tenant_id = auth.user_tenant_id()
     AND survey_type = 'mirror')
  );

-- ============================================================
-- QUESTION CATALOG SNAPSHOTS: erweitert um mirror_respondent
-- ============================================================
DROP POLICY IF EXISTS "tenant_select_snapshots_via_runs" ON question_catalog_snapshots;

CREATE POLICY "tenant_select_snapshots_via_runs"
  ON question_catalog_snapshots FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member', 'mirror_respondent')
    AND id IN (
      SELECT catalog_snapshot_id FROM runs
      WHERE tenant_id = auth.user_tenant_id()
        AND (
          (auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member') AND survey_type = 'management')
          OR
          (auth.user_role() = 'mirror_respondent' AND survey_type = 'mirror')
        )
    )
  );

-- ============================================================
-- QUESTIONS: erweitert um mirror_respondent
-- ============================================================
DROP POLICY IF EXISTS "tenant_select_questions_via_runs" ON questions;

CREATE POLICY "tenant_select_questions_via_runs"
  ON questions FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member', 'mirror_respondent')
    AND catalog_snapshot_id IN (
      SELECT catalog_snapshot_id FROM runs
      WHERE tenant_id = auth.user_tenant_id()
        AND (
          (auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member') AND survey_type = 'management')
          OR
          (auth.user_role() = 'mirror_respondent' AND survey_type = 'mirror')
        )
    )
  );

-- ============================================================
-- QUESTION EVENTS SELECT: Tenant sieht nur Management-Events,
-- Mirror-Respondent sieht nur eigene Events in Mirror-Runs
-- ============================================================
DROP POLICY IF EXISTS "tenant_select_own_question_events" ON question_events;

CREATE POLICY "tenant_select_own_question_events"
  ON question_events FOR SELECT
  TO authenticated
  USING (
    (auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member')
     AND tenant_id = auth.user_tenant_id()
     AND run_id IN (SELECT id FROM runs WHERE tenant_id = auth.user_tenant_id() AND survey_type = 'management'))
    OR
    (auth.user_role() = 'mirror_respondent'
     AND tenant_id = auth.user_tenant_id()
     AND created_by = auth.uid()
     AND run_id IN (SELECT id FROM runs WHERE tenant_id = auth.user_tenant_id() AND survey_type = 'mirror'))
  );

-- ============================================================
-- QUESTION EVENTS INSERT: erweitert um mirror_respondent in Mirror-Runs
-- ============================================================
DROP POLICY IF EXISTS "tenant_insert_question_events" ON question_events;

CREATE POLICY "tenant_insert_question_events"
  ON question_events FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member')
     AND tenant_id = auth.user_tenant_id()
     AND run_id IN (SELECT id FROM runs WHERE tenant_id = auth.user_tenant_id() AND status != 'locked' AND survey_type = 'management'))
    OR
    (auth.user_role() = 'mirror_respondent'
     AND tenant_id = auth.user_tenant_id()
     AND run_id IN (SELECT id FROM runs WHERE tenant_id = auth.user_tenant_id() AND status != 'locked' AND survey_type = 'mirror'))
  );

-- ============================================================
-- MEMBER BLOCK ACCESS: erweitert um mirror_respondent
-- ============================================================
DROP POLICY IF EXISTS "member_read_own_mba" ON member_block_access;

CREATE POLICY "member_read_own_mba"
  ON member_block_access FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_member', 'mirror_respondent')
    AND profile_id = auth.uid()
  );
