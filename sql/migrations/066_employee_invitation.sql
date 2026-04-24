-- Migration 066: employee_invitation Tabelle + RLS + Indexes + GRANTs
-- SLC-033 MT-2 — V4 Schema-Fundament (FEAT-022, DEC-035)
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)

DO $$ BEGIN

-- =============================================
-- 1. Create employee_invitation table
-- =============================================
CREATE TABLE IF NOT EXISTS public.employee_invitation (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  email                 text        NOT NULL,
  display_name          text,
  role_hint             text,
  invitation_token      text        NOT NULL UNIQUE,
  invited_by_user_id    uuid        NOT NULL REFERENCES auth.users,
  status                text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  accepted_user_id      uuid        REFERENCES auth.users,
  expires_at            timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

RAISE NOTICE 'employee_invitation table created';

-- =============================================
-- 2. RLS
-- =============================================
ALTER TABLE public.employee_invitation ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: full access
DROP POLICY IF EXISTS employee_invitation_admin_full ON public.employee_invitation;
CREATE POLICY employee_invitation_admin_full ON public.employee_invitation
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant_admin: read + write own tenant
DROP POLICY IF EXISTS employee_invitation_tenant_admin_rw ON public.employee_invitation;
CREATE POLICY employee_invitation_tenant_admin_rw ON public.employee_invitation
  FOR ALL
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

RAISE NOTICE 'employee_invitation RLS policies created';

-- =============================================
-- 3. Indexes
-- =============================================
-- UNIQUE partial: eine aktive (pending) Einladung pro Tenant+Email
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_invitation_pending_email
  ON public.employee_invitation (tenant_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_employee_invitation_tenant
  ON public.employee_invitation(tenant_id);

RAISE NOTICE 'employee_invitation indexes created';

-- =============================================
-- 4. GRANTs for authenticated + service_role
-- =============================================
GRANT SELECT, INSERT, UPDATE ON public.employee_invitation TO authenticated;
GRANT ALL ON public.employee_invitation TO service_role;

RAISE NOTICE 'employee_invitation grants applied';

END $$;
