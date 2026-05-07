-- Migration 085 — V5 Option 2 Stufe 2 walkthrough_step (SLC-077 MT-1)
--
-- Greenfield-Tabelle fuer extrahierte SOP-Schritte aus dem Walkthrough.
-- Wird vom walkthrough-extract-steps-worker geschrieben (service_role / BYPASSRLS).
--
-- 4-Rollen-RLS-Matrix gemaess ARCHITECTURE.md V5 Option 2 Sektion (DEC-080..091).
-- RLS-Translation: ARCHITECTURE.md-Sketch nutzt `(auth.jwt()->>'role')`; produktiv nutzt
-- die Onboarding-Plattform `auth.user_role()` + `auth.user_tenant_id()` Helper-Funktionen
-- (sql/functions.sql, etabliert seit V1). Siehe MIG-031 fuer das Translation-Muster.
--
-- Idempotent via IF NOT EXISTS / DROP POLICY IF EXISTS + CREATE POLICY.
-- Apply per `sql-migration-hetzner.md` (base64-Pipe + `psql -U postgres`).

CREATE TABLE IF NOT EXISTS public.walkthrough_step (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  walkthrough_session_id      uuid        NOT NULL REFERENCES public.walkthrough_session ON DELETE CASCADE,
  step_number                 integer     NOT NULL CHECK (step_number >= 1),
  action                      text        NOT NULL,
  responsible                 text,
  timeframe                   text,
  success_criterion           text,
  dependencies                text,
  transcript_snippet          text,
  transcript_offset_start     integer,
  transcript_offset_end       integer,
  edited_by_user_id           uuid        REFERENCES auth.users,
  edited_at                   timestamptz,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (walkthrough_session_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_walkthrough_step_session
  ON public.walkthrough_step(walkthrough_session_id, step_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_walkthrough_step_tenant
  ON public.walkthrough_step(tenant_id);

ALTER TABLE public.walkthrough_step ENABLE ROW LEVEL SECURITY;

-- SELECT-Policy: 4-Rollen-Matrix (strategaize_admin alle, tenant_admin eigener Tenant,
-- tenant_member/employee nur eigene walkthrough_session via recorded_by_user_id).
DROP POLICY IF EXISTS "walkthrough_step_select" ON public.walkthrough_step;
CREATE POLICY "walkthrough_step_select" ON public.walkthrough_step
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'strategaize_admin'
    OR (
      auth.user_role() = 'tenant_admin'
      AND tenant_id = auth.user_tenant_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.walkthrough_session ws
      WHERE ws.id = walkthrough_step.walkthrough_session_id
        AND ws.recorded_by_user_id = auth.uid()
    )
  );

-- UPDATE-Policy: nur strategaize_admin + tenant_admin (eigener Tenant).
-- tenant_member/employee duerfen ihre Schritte NICHT bearbeiten — Methodik-Review
-- ist Berater-Aufgabe (DEC-090, V5 Option 2 trennt Aufnahme von Methodik).
DROP POLICY IF EXISTS "walkthrough_step_update" ON public.walkthrough_step;
CREATE POLICY "walkthrough_step_update" ON public.walkthrough_step
  FOR UPDATE TO authenticated
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

-- INSERT/DELETE: KEIN authenticated-Policy. Worker schreibt via service_role (BYPASSRLS).
-- Soft-Delete laeuft ueber UPDATE deleted_at — kein DELETE-Pfad fuer authenticated.

GRANT SELECT, UPDATE ON public.walkthrough_step TO authenticated;
GRANT ALL ON public.walkthrough_step TO service_role;

DROP TRIGGER IF EXISTS trg_walkthrough_step_set_updated_at ON public.walkthrough_step;
CREATE TRIGGER trg_walkthrough_step_set_updated_at
  BEFORE UPDATE ON public.walkthrough_step
  FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();
