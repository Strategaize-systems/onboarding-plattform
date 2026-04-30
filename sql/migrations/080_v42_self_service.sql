-- Migration 080: V4.2 Self-Service Tenant Onboarding — Schema-Foundation
-- SLC-046 MT-1 — V4.2 FEAT-031 Wizard + FEAT-032 Reminders + FEAT-033 Help (MIG-029)
-- DEC-051..061 (V4.2-Architektur)
-- Variante A: atomare 3-Block-Single-File-Migration
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)
--
-- Scope:
--   Block 1: tenants ALTER + Backfill (Wizard-State pro Tenant)
--   Block 2: reminder_log Tabelle + RLS + Index (Cron-Idempotenz fuer SLC-048)
--   Block 3: user_settings Tabelle + Trigger + Backfill (Opt-Out + Unsubscribe-Token fuer SLC-049)
--
-- Foundation: SLC-046 nutzt nur tenants.onboarding_wizard_*. reminder_log + user_settings sind
-- live (RLS aktiv, GRANTs gesetzt), aber Code wird in SLC-048 + SLC-049 ergaenzt.

BEGIN;

-- =========================================================================
-- BLOCK 1: tenants — Wizard-State + Index + Backfill
-- =========================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS onboarding_wizard_state text NOT NULL DEFAULT 'pending'
    CHECK (onboarding_wizard_state IN ('pending', 'started', 'skipped', 'completed')),
  ADD COLUMN IF NOT EXISTS onboarding_wizard_step integer NOT NULL DEFAULT 1
    CHECK (onboarding_wizard_step BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS onboarding_wizard_completed_at timestamptz;

COMMENT ON COLUMN public.tenants.onboarding_wizard_state IS
  'V4.2 Wizard-State pro Tenant: pending|started|skipped|completed. Default pending fuer Neu-Tenants.';

COMMENT ON COLUMN public.tenants.onboarding_wizard_step IS
  'V4.2 Wizard-Step 1..4. Persistierter Fortschritt fuer Resume-Verhalten.';

COMMENT ON COLUMN public.tenants.onboarding_wizard_completed_at IS
  'V4.2 Wizard-Completion-Timestamp. NULL solange wizard nicht abgeschlossen.';

-- Partial-Index fuer schnelle "wizard offen"-Lookups im Layout-Helper (getWizardStateForCurrentUser)
CREATE INDEX IF NOT EXISTS idx_tenants_wizard_state
  ON public.tenants (onboarding_wizard_state)
  WHERE onboarding_wizard_state IN ('pending', 'started');

-- Backfill: alle pre-V4.2-Tenants haben das Tool schon erlebt → completed
-- Idempotent: Re-Run aendert nichts, weil WHERE state='pending' nach erstem Lauf nichts mehr trifft.
UPDATE public.tenants
   SET onboarding_wizard_state = 'completed',
       onboarding_wizard_completed_at = COALESCE(onboarding_wizard_completed_at, now())
 WHERE onboarding_wizard_state = 'pending';

-- =========================================================================
-- BLOCK 2: reminder_log — Cron-Idempotenz + Audit-Trail
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.reminder_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_stage    text        NOT NULL CHECK (reminder_stage IN ('stage1', 'stage2')),
  sent_date         date        NOT NULL DEFAULT current_date,
  email_to          text        NOT NULL,
  status            text        NOT NULL DEFAULT 'sent'
                                CHECK (status IN ('sent', 'failed', 'skipped_opt_out')),
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_user_id, reminder_stage, sent_date)
);

COMMENT ON TABLE public.reminder_log IS
  'V4.2 FEAT-032 Cron-Idempotenz-Log + Audit-Trail fuer Mitarbeiter-Reminders. UNIQUE (user, stage, date) verhindert Doppel-Sendung.';

-- Tenant-Aggregation fuer SLC-049 Cockpit-Card "Letzter Reminder am ..."
CREATE INDEX IF NOT EXISTS idx_reminder_log_tenant_date
  ON public.reminder_log (tenant_id, sent_date DESC);

ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: vollzugriff cross-tenant
DROP POLICY IF EXISTS reminder_log_admin_full ON public.reminder_log;
CREATE POLICY reminder_log_admin_full ON public.reminder_log
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant_admin: NUR SELECT auf eigenen Tenant (Cron schreibt via service_role, User dürfen nicht editieren)
DROP POLICY IF EXISTS reminder_log_tenant_admin_select ON public.reminder_log;
CREATE POLICY reminder_log_tenant_admin_select ON public.reminder_log
  FOR SELECT
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- KEINE Policy fuer tenant_member oder employee = RLS-Default-Deny

-- GRANTs: authenticated darf SELECT (RLS regelt Sichtbarkeit), service_role schreibt im Cron.
GRANT SELECT ON public.reminder_log TO authenticated;
GRANT ALL    ON public.reminder_log TO service_role;

-- =========================================================================
-- BLOCK 3: user_settings — Opt-Out + Unsubscribe-Token + Auto-Create-Trigger
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reminders_opt_out  boolean     NOT NULL DEFAULT false,
  unsubscribe_token  text        NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unsubscribe_token)
);

COMMENT ON TABLE public.user_settings IS
  'V4.2 FEAT-032 User-Praeferenz-Tabelle. reminders_opt_out + unsubscribe_token (64-char hex). Auto-Create per Trigger auf auth.users-INSERT.';

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: vollzugriff cross-user
DROP POLICY IF EXISTS user_settings_admin_full ON public.user_settings;
CREATE POLICY user_settings_admin_full ON public.user_settings
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- own user: ALL (SELECT/UPDATE) auf eigene Praeferenz (Opt-Out-Toggle)
-- Nicht INSERT — Insert kommt nur via Trigger oder service_role.
DROP POLICY IF EXISTS user_settings_own_select ON public.user_settings;
CREATE POLICY user_settings_own_select ON public.user_settings
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_settings_own_update ON public.user_settings;
CREATE POLICY user_settings_own_update ON public.user_settings
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- KEINE INSERT/DELETE-Policy fuer authenticated = nur Trigger + service_role schreiben.

GRANT SELECT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL            ON public.user_settings TO service_role;

-- =========================================================================
-- BLOCK 3.5: updated_at-Trigger fuer user_settings
-- =========================================================================
DROP TRIGGER IF EXISTS set_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER set_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public._set_updated_at();

-- =========================================================================
-- BLOCK 3.6: Auto-Create-Trigger auf auth.users-INSERT (Soft-Fail)
-- =========================================================================
-- Pattern analog tg_block_review_pending_on_employee_submit (MIG-028 / DEC-048):
-- BEGIN/EXCEPTION-Wrap, RAISE WARNING bei Fehler — kein Block des auth.users-Inserts.
-- SECURITY DEFINER damit der Trigger unter jedem Insert-Kontext (auch service_role) schreiben kann.

CREATE OR REPLACE FUNCTION public.tg_create_user_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $func$
BEGIN
  BEGIN
    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'tg_create_user_settings soft-fail: % SQLSTATE %', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$func$;

COMMENT ON FUNCTION public.tg_create_user_settings() IS
  'V4.2 Auto-Create user_settings beim auth.users-INSERT. Soft-Fail (DEC-048-Pattern). Idempotent via ON CONFLICT.';

DROP TRIGGER IF EXISTS tg_create_user_settings_on_auth_users_insert ON auth.users;
CREATE TRIGGER tg_create_user_settings_on_auth_users_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_create_user_settings();

-- =========================================================================
-- BLOCK 3.7: Backfill — user_settings fuer alle bestehenden auth.users
-- =========================================================================
-- Idempotent via ON CONFLICT DO NOTHING. Re-Run aendert nichts.
INSERT INTO public.user_settings (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
