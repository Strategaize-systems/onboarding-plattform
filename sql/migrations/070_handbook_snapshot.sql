-- Migration 070: handbook_snapshot Tabelle + RLS + Indexes + GRANTs + updated_at-Trigger
-- SLC-033 MT-6 — V4 Schema-Fundament (FEAT-026, DEC-038)
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)

DO $$ BEGIN

-- =============================================
-- 1. handbook_snapshot Tabelle
-- =============================================
CREATE TABLE IF NOT EXISTS public.handbook_snapshot (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES public.capture_session ON DELETE CASCADE,
  template_id           uuid        NOT NULL REFERENCES public.template,
  template_version      text        NOT NULL,
  status                text        NOT NULL DEFAULT 'generating'
                                    CHECK (status IN ('generating', 'ready', 'failed')),
  storage_path          text,
  storage_size_bytes    integer,
  section_count         integer,
  knowledge_unit_count  integer,
  diagnosis_count       integer,
  sop_count             integer,
  generated_by_user_id  uuid        NOT NULL REFERENCES auth.users,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

RAISE NOTICE 'handbook_snapshot table created';

-- =============================================
-- 2. RLS
-- =============================================
ALTER TABLE public.handbook_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS handbook_snapshot_admin_full ON public.handbook_snapshot;
CREATE POLICY handbook_snapshot_admin_full ON public.handbook_snapshot
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

DROP POLICY IF EXISTS handbook_snapshot_tenant_admin_rw ON public.handbook_snapshot;
CREATE POLICY handbook_snapshot_tenant_admin_rw ON public.handbook_snapshot
  FOR ALL
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

RAISE NOTICE 'handbook_snapshot RLS policies created';

-- =============================================
-- 3. Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_handbook_snapshot_session
  ON public.handbook_snapshot(capture_session_id);

CREATE INDEX IF NOT EXISTS idx_handbook_snapshot_tenant
  ON public.handbook_snapshot(tenant_id);

RAISE NOTICE 'handbook_snapshot indexes created';

-- =============================================
-- 4. GRANTs
-- =============================================
GRANT ALL ON public.handbook_snapshot TO authenticated;
GRANT ALL ON public.handbook_snapshot TO service_role;

RAISE NOTICE 'handbook_snapshot grants applied';

-- =============================================
-- 5. updated_at-Trigger
-- =============================================
DROP TRIGGER IF EXISTS set_handbook_snapshot_updated_at ON public.handbook_snapshot;
CREATE TRIGGER set_handbook_snapshot_updated_at
  BEFORE UPDATE ON public.handbook_snapshot
  FOR EACH ROW
  EXECUTE FUNCTION _set_updated_at();

RAISE NOTICE 'handbook_snapshot updated_at trigger created';

END $$;
