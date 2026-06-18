-- Migration 122: Onboarding-Plattform V9.75 — Stufe-1 Mitarbeiter-Register
-- Datum: 2026-06-17
-- Slice: SLC-V9.75-C (FEAT-087 / BL-508)
-- Dependencies: 021 (capture_session), 066 (employee_invitation), tenants,
--               auth.user_role()/auth.user_tenant_id() (functions.sql)
-- DEC-224 (V9.75-Variante) · ARCHITECTURE.md "## V9.75 Architecture Addendum" §5/§7
--
-- Leichtes Name+Funktion-Register (OHNE E-Mail) im Stufe-1-Meeting. Verkaufs-
-- psychologisches Organigramm. Harte Idempotenz sitzt unveraendert auf der
-- bestehenden employee_invitation-UNIQUE (pending-email) — das Register selbst
-- dedupliziert nur WEICH (UNIQUE-Index, ON CONFLICT DO NOTHING / 23505-Swallow).
-- Die Bruecke promoteRosterEntryToInvitation (TS) ruft die unveraenderte
-- rpc_create_employee_invitation; ein Erfolg stempelt promoted_invitation_id
-- (Re-Promote-Schutz).
--
-- Unabhaengig von Migration 121: referenziert keine tier-Spalte. Das blueprint+-
-- Gate des Registers sitzt im TS-Action-Layer (R-C-3: nicht security-kritisch).
--
-- Rollback:
--   DROP TABLE IF EXISTS public.employee_roster_draft;

BEGIN;

-- ============================================================
-- 1. Tabelle
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employee_roster_draft (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  capture_session_id     uuid        NOT NULL REFERENCES public.capture_session ON DELETE CASCADE,
  name                   text        NOT NULL,
  role_hint              text,
  block_key              text,
  promoted_invitation_id uuid        REFERENCES public.employee_invitation ON DELETE SET NULL,
  created_by             uuid        NOT NULL REFERENCES auth.users,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. RLS — tenant-scoped (Perimeter wie employee_invitation, Migration 066)
-- ============================================================
ALTER TABLE public.employee_roster_draft ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: full access (cross-tenant Berater-Pfad)
DROP POLICY IF EXISTS employee_roster_draft_admin_full ON public.employee_roster_draft;
CREATE POLICY employee_roster_draft_admin_full ON public.employee_roster_draft
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant_admin: read + write eigener Tenant
DROP POLICY IF EXISTS employee_roster_draft_tenant_admin_rw ON public.employee_roster_draft;
CREATE POLICY employee_roster_draft_tenant_admin_rw ON public.employee_roster_draft
  FOR ALL
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- ============================================================
-- 3. Indexes
-- ============================================================
-- Weiche Dedup: eine Roster-Zeile pro (Session, Name CI, Funktion CI).
-- Expression-Index -> ON CONFLICT DO NOTHING (raw SQL) bzw. 23505-Swallow (Action).
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_roster_draft_dedup
  ON public.employee_roster_draft (
    capture_session_id,
    lower(name),
    lower(coalesce(role_hint, ''))
  );

CREATE INDEX IF NOT EXISTS idx_employee_roster_draft_session
  ON public.employee_roster_draft (capture_session_id);

CREATE INDEX IF NOT EXISTS idx_employee_roster_draft_tenant
  ON public.employee_roster_draft (tenant_id);

-- ============================================================
-- 4. GRANTs
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_roster_draft TO authenticated;
GRANT ALL ON public.employee_roster_draft TO service_role;

-- Schema-Cache-Reload (neue Tabelle fuer PostgREST sichtbar machen).
NOTIFY pgrst, 'reload schema';

COMMIT;
