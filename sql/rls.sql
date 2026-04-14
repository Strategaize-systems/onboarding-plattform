-- StrategAIze Kundenplattform v1.0 — RLS Policies + Grants
-- Alle Tabellen haben RLS aktiviert.
-- Rollen: strategaize_admin (voller Zugriff), tenant_owner + tenant_member (tenant-scoped, identisch in MVP-1)
-- Ausführung: nach schema.sql (docker-entrypoint-initdb.d/02_rls.sql)

-- ============================================================
-- HELPER FUNCTIONS (SECURITY DEFINER, stable)
-- Lesen tenant_id und role aus profiles für den aktuellen User.
-- ============================================================

CREATE OR REPLACE FUNCTION auth.user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- TENANTS
-- Admin: voll. Tenant: SELECT nur eigene Zeile.
-- ============================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_tenants"
  ON tenants FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "tenant_select_own_tenant"
  ON tenants FOR SELECT
  TO authenticated
  USING (id = auth.user_tenant_id());

-- ============================================================
-- PROFILES
-- Admin: voll. User: SELECT nur eigenes Profil.
-- INSERT via handle_new_user() Trigger (SECURITY DEFINER).
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "user_select_own_profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- ============================================================
-- QUESTION CATALOG SNAPSHOTS
-- Admin: voll. Tenant: SELECT nur für Snapshots, die ihr Run referenziert.
-- ============================================================
ALTER TABLE question_catalog_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_snapshots"
  ON question_catalog_snapshots FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "tenant_select_snapshots_via_runs"
  ON question_catalog_snapshots FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_owner','tenant_member')
    AND id IN (
      SELECT catalog_snapshot_id
      FROM runs
      WHERE tenant_id = auth.user_tenant_id()
    )
  );

-- ============================================================
-- QUESTIONS
-- Admin: voll. Tenant: SELECT nur für Fragen aus ihrem Katalog-Snapshot.
-- ============================================================
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_questions"
  ON questions FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "tenant_select_questions_via_runs"
  ON questions FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_owner','tenant_member')
    AND catalog_snapshot_id IN (
      SELECT catalog_snapshot_id
      FROM runs
      WHERE tenant_id = auth.user_tenant_id()
    )
  );

-- ============================================================
-- RUNS
-- Admin: voll. Tenant: SELECT nur eigene Runs.
-- Kein INSERT/UPDATE/DELETE für Tenant (keine Policy = kein Zugriff).
-- Status-Transition NUR via SECURITY DEFINER: run_submit(), run_lock().
-- ============================================================
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_runs"
  ON runs FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "tenant_select_own_runs"
  ON runs FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_owner','tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

-- KEIN INSERT/UPDATE/DELETE-Policy für Tenant auf runs.
-- Transitions nur via run_submit() und run_lock() (SECURITY DEFINER).

-- ============================================================
-- QUESTION EVENTS — APPEND-ONLY
-- Admin: voll. Tenant: SELECT + INSERT (nur wenn run nicht locked).
-- KEIN UPDATE, KEIN DELETE für Tenant (keine entsprechende Policy).
-- ============================================================
ALTER TABLE question_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_question_events"
  ON question_events FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "tenant_select_own_question_events"
  ON question_events FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_owner','tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY "tenant_insert_question_events"
  ON question_events FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.user_role() IN ('tenant_owner','tenant_member')
    AND tenant_id = auth.user_tenant_id()
    AND run_id IN (
      SELECT id FROM runs
      WHERE tenant_id = auth.user_tenant_id()
        AND status != 'locked'
    )
  );

-- KEIN UPDATE-Policy, KEIN DELETE-Policy für Tenant = 0 Zugriff.

-- ============================================================
-- EVIDENCE ITEMS — APPEND-ONLY
-- Admin: voll. Tenant: SELECT + INSERT (nur wenn run nicht locked).
-- ============================================================
ALTER TABLE evidence_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_evidence_items"
  ON evidence_items FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "tenant_select_own_evidence_items"
  ON evidence_items FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_owner','tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY "tenant_insert_evidence_items"
  ON evidence_items FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.user_role() IN ('tenant_owner','tenant_member')
    AND tenant_id = auth.user_tenant_id()
    AND run_id IN (
      SELECT id FROM runs
      WHERE tenant_id = auth.user_tenant_id()
        AND status != 'locked'
    )
  );

-- ============================================================
-- EVIDENCE LINKS — APPEND-ONLY
-- Admin: voll. Tenant: SELECT + INSERT.
-- ============================================================
ALTER TABLE evidence_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_evidence_links"
  ON evidence_links FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "tenant_select_own_evidence_links"
  ON evidence_links FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_owner','tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY "tenant_insert_evidence_links"
  ON evidence_links FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.user_role() IN ('tenant_owner','tenant_member')
    AND tenant_id = auth.user_tenant_id()
    AND evidence_item_id IN (
      SELECT ei.id FROM evidence_items ei
      JOIN runs r ON r.id = ei.run_id
      WHERE ei.tenant_id = auth.user_tenant_id()
        AND r.status != 'locked'
    )
    -- link_id ownership: prevent cross-tenant linking
    AND (
      (link_type = 'run' AND link_id IN (
        SELECT id FROM runs WHERE tenant_id = auth.user_tenant_id()
      ))
      OR
      (link_type = 'question' AND link_id IN (
        SELECT q.id FROM questions q
        WHERE q.catalog_snapshot_id IN (
          SELECT r.catalog_snapshot_id FROM runs r
          WHERE r.tenant_id = auth.user_tenant_id()
        )
      ))
    )
  );

-- ============================================================
-- RUN SUBMISSIONS — APPEND-ONLY
-- Admin: voll. Tenant: SELECT nur eigene.
-- INSERT NUR via SECURITY DEFINER run_submit() — kein direktes INSERT.
-- ============================================================
ALTER TABLE run_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_run_submissions"
  ON run_submissions FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY "tenant_select_own_run_submissions"
  ON run_submissions FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_owner','tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

-- KEIN direktes INSERT für Tenant — nur via run_submit() SECURITY DEFINER.

-- ============================================================
-- ADMIN EVENTS — Audit Log
-- Admin: voll. Tenant: kein Zugriff (keine Policy = kein Zugriff).
-- ============================================================
ALTER TABLE admin_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_admin_events"
  ON admin_events FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- KEIN Zugriff für Tenant auf admin_events.

-- ============================================================
-- GRANTS
-- authenticated role = alle eingeloggten User (anon key + session)
-- Tabellen-Grants erlauben Zugriff; RLS schränkt auf tatsächliche Zeilen ein.
-- ============================================================
GRANT SELECT, INSERT ON TABLE
  tenants,
  profiles,
  question_catalog_snapshots,
  questions,
  runs,
  question_events,
  evidence_items,
  evidence_links,
  run_submissions,
  admin_events
TO authenticated;

-- VIEW: kein direktes INSERT möglich (Supabase/PostgREST respektiert das)
GRANT SELECT ON TABLE v_current_answers TO authenticated;

-- service_role = Server-seitiger Admin-Zugriff (Next.js API Routes mit SUPABASE_SERVICE_ROLE_KEY)
-- BYPASSRLS umgeht nur RLS-Policies, NICHT Table-Level-Permissions.
-- Ohne explizite GRANTs bekommt service_role "permission denied" auf allen Tabellen.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- anon role hat keinen Zugriff auf Datentabellen (Login-Seite = public, aber kein Datenzugriff)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
