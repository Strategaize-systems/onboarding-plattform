-- Migration 083 — V5 Walkthrough-Mode / MIG-031 Teil 2 — walkthrough_session Tabelle + RLS
-- SLC-071 MT-2 — V5 Foundation (FEAT-034, DEC-074, DEC-076, DEC-077)
--
-- Zweck:
--   Neue Tabelle public.walkthrough_session (FK auf capture_session) mit eigener Status-Maschine
--   und 4-Rollen-RLS-Policy. Pattern analog dialogue_session (V3 DEC-026, Migration 059).
--
-- RLS-Translation-Note:
--   ARCHITECTURE.md V5-Sketch verwendet `(auth.jwt()->>'role')` + `tenant_user`-Tabelle.
--   Onboarding-Plattform nutzt Helper-Funktionen `auth.user_role()` + `auth.user_tenant_id()`,
--   die aus der `profiles`-Tabelle lesen (DEC-001 / sql/functions.sql). Migration uebersetzt
--   die Sketches auf das real verwendete Pattern. Architektur-Intent (4 Rollen, Tenant-Isolation,
--   Self-only fuer tenant_member/employee) ist identisch.
--
-- Apply-Pattern (per sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/083_v5_walkthrough_session.sql                 (lokal)
--   echo '<BASE64>' | base64 -d > /tmp/083_v5.sql                            (server)
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/083_v5.sql
--
-- Verifikation:
--   docker exec <db-container> psql -U postgres -d postgres -c "\d+ public.walkthrough_session"
--   docker exec <db-container> psql -U postgres -d postgres \
--     -c "SELECT polname FROM pg_policy WHERE polrelid='public.walkthrough_session'::regclass"
--   docker exec <db-container> psql -U postgres -d postgres \
--     -c "SELECT relrowsecurity FROM pg_class WHERE relname='walkthrough_session'"

DO $mig031_part2$ BEGIN

-- =============================================
-- 1. walkthrough_session — V5 Walkthrough-Aufnahme + Review-State
-- =============================================
CREATE TABLE IF NOT EXISTS public.walkthrough_session (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  capture_session_id            uuid        NOT NULL REFERENCES public.capture_session ON DELETE CASCADE,

  -- Aufnehmer (Mitarbeiter oder GF, der die Session laeuft)
  recorded_by_user_id           uuid        NOT NULL REFERENCES auth.users,

  -- Storage (Bucket: walkthroughs, Pfad: <tenant_id>/<walkthrough_session_id>/recording.webm)
  storage_path                  text,
  storage_bucket                text        NOT NULL DEFAULT 'walkthroughs',
  duration_sec                  integer     CHECK (duration_sec IS NULL OR duration_sec <= 1800),
  file_size_bytes               bigint,
  mime_type                     text        DEFAULT 'video/webm',

  -- Status-Maschine
  status                        text        NOT NULL DEFAULT 'recording'
                                            CHECK (status IN (
                                              'recording',
                                              'uploading',
                                              'uploaded',
                                              'transcribing',
                                              'pending_review',
                                              'approved',
                                              'rejected',
                                              'failed'
                                            )),

  -- Whisper-Output-Header (Transkript selbst liegt als knowledge_unit mit source='walkthrough_transcript')
  transcript_started_at         timestamptz,
  transcript_completed_at       timestamptz,
  transcript_model              text,
  transcript_knowledge_unit_id  uuid        REFERENCES public.knowledge_unit ON DELETE SET NULL,

  -- Berater-Review (V5: manuell, V5.1: KI-augmented)
  reviewer_user_id              uuid        REFERENCES auth.users,
  reviewed_at                   timestamptz,
  privacy_checkbox_confirmed    boolean     DEFAULT false,
  reviewer_note                 text,
  rejection_reason              text,

  recorded_at                   timestamptz NOT NULL DEFAULT now(),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

RAISE NOTICE 'MIG-031/083: walkthrough_session table created';

-- =============================================
-- 2. RLS aktivieren
-- =============================================
ALTER TABLE public.walkthrough_session ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 3. RLS-Policies (3 Policies, 4-Rollen-Matrix)
-- =============================================

-- SELECT: strategaize_admin alle | tenant_admin eigener Tenant | tenant_member/employee nur eigene
DROP POLICY IF EXISTS walkthrough_session_select ON public.walkthrough_session;
CREATE POLICY walkthrough_session_select ON public.walkthrough_session
  FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'strategaize_admin'
    OR (
      auth.user_role() = 'tenant_admin'
      AND tenant_id = auth.user_tenant_id()
    )
    OR recorded_by_user_id = auth.uid()
  );

-- INSERT: jeder authentifizierte User kann seine eigene Aufnahme im eigenen Tenant erstellen
DROP POLICY IF EXISTS walkthrough_session_insert ON public.walkthrough_session;
CREATE POLICY walkthrough_session_insert ON public.walkthrough_session
  FOR INSERT
  TO authenticated
  WITH CHECK (
    recorded_by_user_id = auth.uid()
    AND tenant_id = auth.user_tenant_id()
  );

-- UPDATE (Approve/Reject): nur strategaize_admin oder tenant_admin (eigener Tenant).
-- Worker-Status-Wechsel ('uploading' → 'uploaded' → 'transcribing' → 'pending_review') laufen
-- via service_role und umgehen RLS bewusst (BYPASSRLS).
DROP POLICY IF EXISTS walkthrough_session_update_review ON public.walkthrough_session;
CREATE POLICY walkthrough_session_update_review ON public.walkthrough_session
  FOR UPDATE
  TO authenticated
  USING (
    auth.user_role() = 'strategaize_admin'
    OR (
      auth.user_role() = 'tenant_admin'
      AND tenant_id = auth.user_tenant_id()
    )
  )
  WITH CHECK (
    auth.user_role() = 'strategaize_admin'
    OR (
      auth.user_role() = 'tenant_admin'
      AND tenant_id = auth.user_tenant_id()
    )
  );

RAISE NOTICE 'MIG-031/083: walkthrough_session 3 RLS policies created';

-- =============================================
-- 4. Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_walkthrough_session_tenant
  ON public.walkthrough_session(tenant_id);

CREATE INDEX IF NOT EXISTS idx_walkthrough_session_capture
  ON public.walkthrough_session(capture_session_id);

CREATE INDEX IF NOT EXISTS idx_walkthrough_session_recorded_by
  ON public.walkthrough_session(recorded_by_user_id);

CREATE INDEX IF NOT EXISTS idx_walkthrough_session_status_pending
  ON public.walkthrough_session(tenant_id, recorded_at DESC)
  WHERE status = 'pending_review';

RAISE NOTICE 'MIG-031/083: walkthrough_session 4 indexes created';

-- =============================================
-- 5. GRANTs
-- =============================================
GRANT ALL ON public.walkthrough_session TO authenticated;
GRANT ALL ON public.walkthrough_session TO service_role;

RAISE NOTICE 'MIG-031/083: walkthrough_session grants applied';

-- =============================================
-- 6. updated_at trigger (reuse public._set_updated_at from Migration 021)
-- =============================================
DROP TRIGGER IF EXISTS trg_walkthrough_session_set_updated_at ON public.walkthrough_session;
CREATE TRIGGER trg_walkthrough_session_set_updated_at
  BEFORE UPDATE ON public.walkthrough_session
  FOR EACH ROW
  EXECUTE FUNCTION public._set_updated_at();

RAISE NOTICE 'MIG-031/083: walkthrough_session updated_at trigger created';

END $mig031_part2$;
