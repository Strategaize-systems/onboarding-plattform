-- Migration 058: meeting_guide table + RLS + indexes + GRANTs
-- SLC-026 MT-1 — Meeting Guide fuer V3 Dialogue-Mode (DEC-030)
-- NOTE: Explicit public. schema prefix required — search_path has storage before public

DO $$ BEGIN

-- Create meeting_guide table
CREATE TABLE IF NOT EXISTS public.meeting_guide (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES public.capture_session ON DELETE CASCADE,
  goal                  text,
  context_notes         text,
  topics                jsonb       NOT NULL DEFAULT '[]',
  ai_suggestions_used   boolean     DEFAULT false,
  created_by            uuid        REFERENCES auth.users,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(capture_session_id)
);

RAISE NOTICE 'meeting_guide table created';

-- RLS
ALTER TABLE public.meeting_guide ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: full access
CREATE POLICY meeting_guide_admin_full ON public.meeting_guide
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant_admin: read + write own tenant
CREATE POLICY meeting_guide_tenant_rw ON public.meeting_guide
  FOR ALL
  USING (tenant_id = auth.user_tenant_id())
  WITH CHECK (tenant_id = auth.user_tenant_id());

RAISE NOTICE 'meeting_guide RLS policies created';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_meeting_guide_session
  ON public.meeting_guide(capture_session_id);

CREATE INDEX IF NOT EXISTS idx_meeting_guide_tenant
  ON public.meeting_guide(tenant_id);

RAISE NOTICE 'meeting_guide indexes created';

-- GRANTs for authenticated + service_role
GRANT ALL ON public.meeting_guide TO authenticated;
GRANT ALL ON public.meeting_guide TO service_role;

RAISE NOTICE 'meeting_guide grants applied';

-- updated_at trigger (reuse existing trigger function if available)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $trigger$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$trigger$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meeting_guide_updated_at ON public.meeting_guide;
CREATE TRIGGER meeting_guide_updated_at
  BEFORE UPDATE ON public.meeting_guide
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

RAISE NOTICE 'meeting_guide updated_at trigger created';

END $$;
