-- Migration 068: bridge_run + bridge_proposal Tabellen + RLS + stale-Trigger
-- SLC-033 MT-4 — V4 Schema-Fundament (FEAT-023, DEC-034, DEC-037, DEC-039)
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)

DO $$ BEGIN

-- =============================================
-- 1. bridge_run Tabelle
-- =============================================
CREATE TABLE IF NOT EXISTS public.bridge_run (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES public.capture_session ON DELETE CASCADE,
  template_id           uuid        NOT NULL REFERENCES public.template,
  template_version      text        NOT NULL,
  status                text        NOT NULL DEFAULT 'running'
                                    CHECK (status IN ('running', 'completed', 'failed', 'stale')),
  triggered_by_user_id  uuid        NOT NULL REFERENCES auth.users,
  source_checkpoint_ids uuid[]      NOT NULL DEFAULT '{}',
  proposal_count        integer     NOT NULL DEFAULT 0,
  cost_usd              numeric(10,6),
  generated_by_model    text,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz
);

RAISE NOTICE 'bridge_run table created';

-- =============================================
-- 2. bridge_proposal Tabelle
-- =============================================
CREATE TABLE IF NOT EXISTS public.bridge_proposal (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  bridge_run_id                 uuid        NOT NULL REFERENCES public.bridge_run ON DELETE CASCADE,
  proposal_mode                 text        NOT NULL
                                            CHECK (proposal_mode IN ('template', 'free_form')),
  source_subtopic_key           text,
  proposed_block_title          text        NOT NULL,
  proposed_block_description    text,
  proposed_questions            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  proposed_employee_user_id     uuid        REFERENCES auth.users,
  proposed_employee_role_hint   text,
  status                        text        NOT NULL DEFAULT 'proposed'
                                            CHECK (status IN ('proposed','edited','approved','rejected','spawned')),
  approved_capture_session_id   uuid        REFERENCES public.capture_session,
  reviewed_by_user_id           uuid        REFERENCES auth.users,
  reviewed_at                   timestamptz,
  reject_reason                 text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

RAISE NOTICE 'bridge_proposal table created';

-- =============================================
-- 3. RLS
-- =============================================
ALTER TABLE public.bridge_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_proposal ENABLE ROW LEVEL SECURITY;

-- bridge_run: strategaize_admin full
DROP POLICY IF EXISTS bridge_run_admin_full ON public.bridge_run;
CREATE POLICY bridge_run_admin_full ON public.bridge_run
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- bridge_run: tenant_admin read+write own tenant
DROP POLICY IF EXISTS bridge_run_tenant_admin_rw ON public.bridge_run;
CREATE POLICY bridge_run_tenant_admin_rw ON public.bridge_run
  FOR ALL
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- bridge_proposal: strategaize_admin full
DROP POLICY IF EXISTS bridge_proposal_admin_full ON public.bridge_proposal;
CREATE POLICY bridge_proposal_admin_full ON public.bridge_proposal
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- bridge_proposal: tenant_admin read+write own tenant
DROP POLICY IF EXISTS bridge_proposal_tenant_admin_rw ON public.bridge_proposal;
CREATE POLICY bridge_proposal_tenant_admin_rw ON public.bridge_proposal
  FOR ALL
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

RAISE NOTICE 'bridge_run + bridge_proposal RLS policies created';

-- =============================================
-- 4. Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_bridge_run_session
  ON public.bridge_run(capture_session_id);

CREATE INDEX IF NOT EXISTS idx_bridge_run_tenant_status
  ON public.bridge_run(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_bridge_proposal_run
  ON public.bridge_proposal(bridge_run_id);

CREATE INDEX IF NOT EXISTS idx_bridge_proposal_tenant_status
  ON public.bridge_proposal(tenant_id, status);

RAISE NOTICE 'bridge tables indexes created';

-- =============================================
-- 5. GRANTs
-- =============================================
GRANT ALL ON public.bridge_run TO authenticated;
GRANT ALL ON public.bridge_run TO service_role;
GRANT ALL ON public.bridge_proposal TO authenticated;
GRANT ALL ON public.bridge_proposal TO service_role;

RAISE NOTICE 'bridge tables grants applied';

-- =============================================
-- 6. updated_at-Trigger auf bridge_proposal (bridge_run hat keinen updated_at)
--    Wiederverwendung der vorhandenen _set_updated_at()-Funktion (Migration 021).
-- =============================================
DROP TRIGGER IF EXISTS set_bridge_proposal_updated_at ON public.bridge_proposal;
CREATE TRIGGER set_bridge_proposal_updated_at
  BEFORE UPDATE ON public.bridge_proposal
  FOR EACH ROW
  EXECUTE FUNCTION _set_updated_at();

RAISE NOTICE 'bridge_proposal updated_at trigger created';

END $$;

-- =============================================
-- 7. Trigger-Funktion bridge_run_set_stale (DEC-039)
--    AFTER INSERT auf block_checkpoint: wenn checkpoint_type = 'questionnaire_submit',
--    setze den juengsten completed bridge_run derselben capture_session_id auf 'stale'.
--    Nur der JUENGSTE — ein einmal stale markierter bleibt stale (nicht re-markiert).
--    CREATE OR REPLACE fuer Idempotenz.
-- =============================================
CREATE OR REPLACE FUNCTION public.bridge_run_set_stale()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.checkpoint_type = 'questionnaire_submit' THEN
    UPDATE public.bridge_run
       SET status = 'stale'
     WHERE id = (
       SELECT id
         FROM public.bridge_run
        WHERE capture_session_id = NEW.capture_session_id
          AND status = 'completed'
        ORDER BY created_at DESC
        LIMIT 1
     );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_checkpoint_set_bridge_stale ON public.block_checkpoint;
CREATE TRIGGER trg_block_checkpoint_set_bridge_stale
  AFTER INSERT ON public.block_checkpoint
  FOR EACH ROW
  EXECUTE FUNCTION public.bridge_run_set_stale();
