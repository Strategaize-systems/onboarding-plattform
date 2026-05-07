-- Migration 086 — V5 Option 2 Stufe 3 walkthrough_review_mapping (SLC-078 MT-1)
--
-- Greenfield-Tabelle fuer Auto-Mapping-Output (Stufe 3) + Berater-Korrektur.
-- Eine Zeile pro walkthrough_step mit der Subtopic-Zuordnung (DEC-085: Unmapped-Bucket
-- via subtopic_id IS NULL, kein separater Tabellen-Bucket).
--
-- subtopic_id ist String-Referenz auf den unterbereich-Wert des Templates (DEC-085 corrected
-- in /backend SLC-078 — Architecture-Doc-Drift entdeckt: blocks[].subtopics[]-Pfad existiert
-- nicht; effektive Subtopic-Schicht lebt in blocks[].questions[].unterbereich).
--
-- GENERATED confidence_band Column (DEC-087):
--   subtopic_id IS NULL                  -> 'red'   (Unmapped-Bucket)
--   confidence_score >= 0.85             -> 'green' (hohe Konfidenz)
--   confidence_score >= 0.70             -> 'yellow'(mittlere Konfidenz)
--   ELSE                                 -> 'red'   (niedrige Konfidenz)
--
-- 4-Rollen-RLS-Matrix gemaess ARCHITECTURE.md V5 Option 2 Sektion (DEC-080..091).
-- RLS-Translation: produktiv `auth.user_role()` + `auth.user_tenant_id()` Helper (siehe MIG-031).
--
-- Idempotent via IF NOT EXISTS / DROP POLICY IF EXISTS + CREATE POLICY.
-- Apply per `sql-migration-hetzner.md` (base64-Pipe + `psql -U postgres`).

CREATE TABLE IF NOT EXISTS public.walkthrough_review_mapping (
  id                          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid         NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  walkthrough_step_id         uuid         NOT NULL UNIQUE REFERENCES public.walkthrough_step ON DELETE CASCADE,
  template_id                 uuid         NOT NULL REFERENCES public.template,
  template_version            text         NOT NULL,
  subtopic_id                 text,
  confidence_score            numeric(3,2) CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  confidence_band             text         GENERATED ALWAYS AS (
                                CASE
                                  WHEN subtopic_id IS NULL THEN 'red'
                                  WHEN confidence_score >= 0.85 THEN 'green'
                                  WHEN confidence_score >= 0.70 THEN 'yellow'
                                  ELSE 'red'
                                END
                              ) STORED,
  mapping_model               text,
  mapping_reasoning           text,
  reviewer_corrected          boolean      NOT NULL DEFAULT false,
  reviewer_user_id            uuid         REFERENCES auth.users,
  reviewed_at                 timestamptz,
  created_at                  timestamptz  NOT NULL DEFAULT now(),
  updated_at                  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wkrm_session_subtopic
  ON public.walkthrough_review_mapping(walkthrough_step_id, subtopic_id);

CREATE INDEX IF NOT EXISTS idx_wkrm_unmapped
  ON public.walkthrough_review_mapping(tenant_id, walkthrough_step_id)
  WHERE subtopic_id IS NULL;

ALTER TABLE public.walkthrough_review_mapping ENABLE ROW LEVEL SECURITY;

-- SELECT-Policy: 4-Rollen-Matrix. Sichtbarkeit haengt am walkthrough_step → walkthrough_session
-- (recorded_by_user_id) fuer tenant_member/employee. tenant_admin sieht eigenen Tenant,
-- strategaize_admin sieht alles.
DROP POLICY IF EXISTS "walkthrough_review_mapping_select" ON public.walkthrough_review_mapping;
CREATE POLICY "walkthrough_review_mapping_select" ON public.walkthrough_review_mapping
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'strategaize_admin'
    OR (
      auth.user_role() = 'tenant_admin'
      AND tenant_id = auth.user_tenant_id()
    )
    OR EXISTS (
      SELECT 1
      FROM public.walkthrough_step ws_step
      JOIN public.walkthrough_session ws_sess
        ON ws_sess.id = ws_step.walkthrough_session_id
      WHERE ws_step.id = walkthrough_review_mapping.walkthrough_step_id
        AND ws_sess.recorded_by_user_id = auth.uid()
    )
  );

-- UPDATE-Policy: nur strategaize_admin + tenant_admin (eigener Tenant). Berater-Move
-- via Server Action moveWalkthroughStepMapping (SLC-079) setzt subtopic_id +
-- reviewer_corrected=true + reviewer_user_id + reviewed_at. tenant_member/employee
-- duerfen Mappings NICHT bearbeiten (Methodik-Review ist Berater-Aufgabe, DEC-090).
DROP POLICY IF EXISTS "walkthrough_review_mapping_update" ON public.walkthrough_review_mapping;
CREATE POLICY "walkthrough_review_mapping_update" ON public.walkthrough_review_mapping
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
-- Mapping-Loeschung passiert kaskadiert via walkthrough_step ON DELETE CASCADE.

GRANT SELECT, UPDATE ON public.walkthrough_review_mapping TO authenticated;
GRANT ALL ON public.walkthrough_review_mapping TO service_role;

DROP TRIGGER IF EXISTS trg_walkthrough_review_mapping_set_updated_at ON public.walkthrough_review_mapping;
CREATE TRIGGER trg_walkthrough_review_mapping_set_updated_at
  BEFORE UPDATE ON public.walkthrough_review_mapping
  FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();
