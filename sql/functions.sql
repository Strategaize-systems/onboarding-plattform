-- StrategAIze Kundenplattform v1.0 — SECURITY DEFINER Functions + Triggers
-- Ausführung: nach rls.sql (docker-entrypoint-initdb.d/03_functions.sql)

-- ============================================================
-- TRIGGER FUNCTION: handle_new_user()
-- Wird bei jedem INSERT auf auth.users aufgerufen (GoTrue Invite).
-- Erstellt den profiles-Eintrag mit tenant_id + role aus raw_user_meta_data.
-- raw_user_meta_data wird vom Admin bei POST /auth/v1/admin/users gesetzt.
-- SECURITY DEFINER: bypasses RLS für den profiles-INSERT.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_role      text;
BEGIN
  -- tenant_id aus Invite-Metadata (gesetzt vom Admin via GoTrue Admin API)
  v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid;

  -- role aus Invite-Metadata; Default: tenant_owner (erster User eines Tenants)
  v_role := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'role', ''),
    'tenant_owner'
  );

  -- Validierung: role muss gültig sein — ungültige Rollen werden ABGELEHNT (nicht silent-defaulted)
  IF v_role NOT IN ('strategaize_admin', 'tenant_owner', 'tenant_member') THEN
    RAISE EXCEPTION 'handle_new_user: invalid role: %', v_role
      USING ERRCODE = 'P0400';
  END IF;

  -- Validierung: Tenant-Rollen brauchen eine gültige tenant_id
  IF v_role IN ('tenant_owner', 'tenant_member') THEN
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'handle_new_user: tenant_id required for role %', v_role
        USING ERRCODE = 'P0422';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
      RAISE EXCEPTION 'handle_new_user: tenant % does not exist', v_tenant_id
        USING ERRCODE = 'P0404';
    END IF;
  END IF;

  -- tenant_owner Uniqueness: nur ein tenant_owner pro Tenant
  IF v_role = 'tenant_owner' THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE tenant_id = v_tenant_id AND role = 'tenant_owner'
    ) THEN
      RAISE EXCEPTION 'handle_new_user: tenant % already has an owner', v_tenant_id
        USING ERRCODE = 'P0409';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, tenant_id, email, role)
  VALUES (NEW.id, v_tenant_id, NEW.email, v_role);

  RETURN NEW;
END;
$$;

-- Trigger auf auth.users: feuert nach jedem neuen User (Invite-Annahme)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

COMMENT ON FUNCTION handle_new_user() IS
  'SECURITY DEFINER. Erstellt profiles-Eintrag bei GoTrue Invite. tenant_id + role aus raw_user_meta_data.';

-- ============================================================
-- FUNCTION: run_submit(p_run_id, p_note)
-- Erstellt Checkpoint (run_submission), aktualisiert runs.status.
-- Darf nur von authentifizierten Tenant-Usern via API Route aufgerufen werden.
-- SECURITY DEFINER: kann runs.status aktualisieren trotz fehlender RLS-Permission für Tenant.
-- ============================================================
CREATE OR REPLACE FUNCTION run_submit(
  p_run_id uuid,
  p_note   text DEFAULT NULL
)
RETURNS run_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run          runs;
  v_tenant_id    uuid;
  v_user_id      uuid;
  v_next_version integer;
  v_submission   run_submissions;
BEGIN
  -- Session-Check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: No active session'
      USING ERRCODE = 'P0401';
  END IF;

  -- Rollen-Check: nur Tenant-User dürfen submitten
  IF auth.user_role() NOT IN ('tenant_owner', 'tenant_member') THEN
    RAISE EXCEPTION 'FORBIDDEN: Only tenant users can submit runs'
      USING ERRCODE = 'P0403';
  END IF;

  -- Run laden
  SELECT * INTO v_run FROM runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Run % not found', p_run_id
      USING ERRCODE = 'P0404';
  END IF;

  -- Tenant-Check: Caller darf nur eigene Runs submitten
  v_tenant_id := auth.user_tenant_id();
  IF v_run.tenant_id != v_tenant_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Run belongs to a different tenant'
      USING ERRCODE = 'P0403';
  END IF;

  -- Status-Check: locked Run kann nicht submittiert werden
  IF v_run.status = 'locked' THEN
    RAISE EXCEPTION 'FORBIDDEN: Run is locked and cannot be submitted'
      USING ERRCODE = 'P0403';
  END IF;

  -- Mindestens ein Event muss existieren (Business Rule)
  IF NOT EXISTS (
    SELECT 1 FROM question_events WHERE run_id = p_run_id LIMIT 1
  ) THEN
    RAISE EXCEPTION 'UNPROCESSABLE: No question events found for this run'
      USING ERRCODE = 'P0422';
  END IF;

  -- Nächste Snapshot-Version berechnen (append-only, auto-inkrement pro Run)
  SELECT COALESCE(MAX(snapshot_version), 0) + 1
  INTO v_next_version
  FROM run_submissions
  WHERE run_id = p_run_id;

  -- Submission erstellen (append-only)
  INSERT INTO run_submissions (run_id, tenant_id, submitted_by, snapshot_version, note)
  VALUES (p_run_id, v_tenant_id, v_user_id, v_next_version, p_note)
  RETURNING * INTO v_submission;

  -- runs.status auf 'submitted' setzen + submitted_at aktualisieren
  -- Nur wenn aktuell 'collecting' (idempotent: bleibt 'submitted' wenn bereits submitted)
  UPDATE runs
  SET
    status       = 'submitted',
    submitted_at = now()
  WHERE id = p_run_id
    AND status = 'collecting';

  RETURN v_submission;
END;
$$;

COMMENT ON FUNCTION run_submit(uuid, text) IS
  'SECURITY DEFINER. Erstellt run_submission + setzt runs.status=submitted. Nur für Tenant-User via API Route.';

-- ============================================================
-- FUNCTION: run_lock(p_run_id)
-- Sperrt einen Run (status = 'locked'). Nur für strategaize_admin.
-- Loggt Admin-Event in admin_events.
-- SECURITY DEFINER: kann runs.status trotz RLS aktualisieren.
-- ============================================================
CREATE OR REPLACE FUNCTION run_lock(p_run_id uuid)
RETURNS runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run      runs;
  v_user_id  uuid;
  v_prev_status text;
BEGIN
  -- Session-Check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: No active session'
      USING ERRCODE = 'P0401';
  END IF;

  -- Admin-Check
  IF auth.user_role() != 'strategaize_admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: Only strategaize_admin can lock runs'
      USING ERRCODE = 'P0403';
  END IF;

  -- Run laden
  SELECT * INTO v_run FROM runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Run % not found', p_run_id
      USING ERRCODE = 'P0404';
  END IF;

  -- Status-Check
  IF v_run.status = 'locked' THEN
    RAISE EXCEPTION 'UNPROCESSABLE: Run is already locked'
      USING ERRCODE = 'P0422';
  END IF;

  v_prev_status := v_run.status;

  -- Run sperren
  UPDATE runs
  SET status = 'locked'
  WHERE id = p_run_id
  RETURNING * INTO v_run;

  -- Admin Audit-Event (append-only)
  INSERT INTO admin_events (event_type, actor_id, tenant_id, run_id, payload)
  VALUES (
    'run_locked',
    v_user_id,
    v_run.tenant_id,
    p_run_id,
    jsonb_build_object('previous_status', v_prev_status)
  );

  RETURN v_run;
END;
$$;

COMMENT ON FUNCTION run_lock(uuid) IS
  'SECURITY DEFINER. Setzt runs.status=locked. Nur strategaize_admin. Loggt admin_event.';

-- ============================================================
-- FUNCTION: log_admin_event(event_type, tenant_id, run_id, payload)
-- Hilfsfunktion: Erstellt Admin-Audit-Event aus API Routes.
-- Aufgerufen via service_role (Next.js API Routes).
-- ============================================================
CREATE OR REPLACE FUNCTION log_admin_event(
  p_event_type text,
  p_tenant_id  uuid DEFAULT NULL,
  p_run_id     uuid DEFAULT NULL,
  p_payload    jsonb DEFAULT '{}'
)
RETURNS admin_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_event   admin_events;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED'
      USING ERRCODE = 'P0401';
  END IF;

  IF auth.user_role() != 'strategaize_admin' THEN
    RAISE EXCEPTION 'FORBIDDEN'
      USING ERRCODE = 'P0403';
  END IF;

  INSERT INTO admin_events (event_type, actor_id, tenant_id, run_id, payload)
  VALUES (p_event_type, v_user_id, p_tenant_id, p_run_id, p_payload)
  RETURNING * INTO v_event;

  RETURN v_event;
END;
$$;

COMMENT ON FUNCTION log_admin_event(text, uuid, uuid, jsonb) IS
  'SECURITY DEFINER. Erstellt Admin-Audit-Events. Aufgerufen aus Next.js API Routes via service_role.';

-- ============================================================
-- TRIGGER FUNCTION: prevent_modify()
-- Verhindert UPDATE und DELETE auf append-only Tabellen auf DB-Ebene.
-- RLS allein reicht nicht — BYPASSRLS oder versehentliche Policy-Änderungen
-- könnten Events modifizierbar machen. Dieser Trigger ist die letzte Verteidigung.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_modify()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only table: % does not allow % operations',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0403';
END;
$$;

COMMENT ON FUNCTION prevent_modify() IS
  'Append-only enforcement trigger. Prevents UPDATE and DELETE on event tables.';

-- Apply to all append-only tables
CREATE TRIGGER enforce_append_only BEFORE UPDATE OR DELETE
  ON question_events FOR EACH ROW EXECUTE FUNCTION prevent_modify();
CREATE TRIGGER enforce_append_only BEFORE UPDATE OR DELETE
  ON evidence_items FOR EACH ROW EXECUTE FUNCTION prevent_modify();
CREATE TRIGGER enforce_append_only BEFORE UPDATE OR DELETE
  ON evidence_links FOR EACH ROW EXECUTE FUNCTION prevent_modify();
CREATE TRIGGER enforce_append_only BEFORE UPDATE OR DELETE
  ON run_submissions FOR EACH ROW EXECUTE FUNCTION prevent_modify();
CREATE TRIGGER enforce_append_only BEFORE UPDATE OR DELETE
  ON admin_events FOR EACH ROW EXECUTE FUNCTION prevent_modify();
