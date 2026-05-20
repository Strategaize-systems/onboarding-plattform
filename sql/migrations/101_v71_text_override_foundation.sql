-- Migration 101: V7.1 Inline-Text-Override Foundation
-- SLC-136 (FEAT-055, MIG-044) — DEC-140, DEC-145, DEC-148
--
-- ZIEL
-- ====
-- 1) Pre-Migration: V6-Helper-Functions + Views idempotent nachziehen
--    (is_strategaize_admin, current_tenant_id, partner_admin_view,
--    tenant_to_partner_view). Architecture-Drift-Fix: diese 4 Objekte waren
--    in ARCHITECTURE.md V6+V7 vorausgesetzt, wurden aber nie in Migration
--    090..098 angelegt. Pre-Migration-Check beim SLC-136-Start hat das
--    aufgedeckt. Option A (User-Entscheidung 2026-05-20): Helper-Praeambel
--    in Migration 101 nachziehen, weil SLC-138 + SLC-139 dieselben Helper
--    spaeter benoetigen (Strategaize-Pattern-Reuse-Regel).
--
-- 2) text_override + text_override_history Tabellen anlegen.
--
-- 3) RLS aktivieren mit Scope-Hierarchie-Policies (global < template < partner):
--    - strategaize_admin: voller Read/Write auf allem
--    - partner_admin: Read auf global+template, Read/Write auf eigene partner-Rows
--    - tenant_member/admin/employee: nur Read auf global+template+own-partner
--
-- 4) GRANTs auf service_role + authenticated (Pflicht-Pattern aus
--    feedback_migration_rls_needs_grants.md / OP V7 SLC-134-Lehre).
--
-- IDEMPOTENZ
-- ==========
-- Alle DDL-Statements sind idempotent (CREATE OR REPLACE, IF NOT EXISTS,
-- DROP POLICY IF EXISTS vor CREATE POLICY). Zweiter Apply ist ein No-Op.

BEGIN;

-- ============================================================
-- 1. Helper-Praeambel (Architecture-Drift-Fix)
-- ============================================================

-- is_strategaize_admin(uuid): Wrapper auf profiles.role, SECURITY DEFINER
-- damit RLS-Policies aus User-Context heraus den Admin-Status pruefen koennen
-- ohne profiles-Read-Grant fuer alle Tenant-Member.
CREATE OR REPLACE FUNCTION public.is_strategaize_admin(p_uid uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_uid
      AND role = 'strategaize_admin'
  );
$$;

-- current_tenant_id(): Alias auf auth.user_tenant_id() fuer Konsistenz
-- mit V7.1-Architecture-Naming. Bleibt STABLE damit Policies cachen koennen.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SET search_path = public, auth
AS $$
  SELECT auth.user_tenant_id();
$$;

-- partner_admin_view: Mapping User -> Partner-Organisation
-- via profiles.role='partner_admin' + profiles.tenant_id = partner_organization.tenant_id.
CREATE OR REPLACE VIEW public.partner_admin_view AS
  SELECT
    p.id          AS user_id,
    po.id         AS partner_org_id
  FROM public.profiles p
  JOIN public.partner_organization po ON po.tenant_id = p.tenant_id
  WHERE p.role = 'partner_admin';

-- tenant_to_partner_view: Mapping Tenant -> Partner-Organisation
-- Sowohl partner_organization-Tenants (haben po.tenant_id = t.id)
-- als auch partner_client-Tenants (haben po.tenant_id = t.parent_partner_tenant_id)
-- werden auf ihre partner_org_id gemappt. direct_client-Tenants ohne Partner
-- sind nicht in dieser View enthalten (kein Join-Match).
CREATE OR REPLACE VIEW public.tenant_to_partner_view AS
  SELECT
    t.id          AS tenant_id,
    po.id         AS partner_org_id
  FROM public.tenants t
  JOIN public.partner_organization po
    ON po.tenant_id = COALESCE(t.parent_partner_tenant_id, t.id);

-- View-Grants damit RLS-Policies aus authenticated-Context die Views lesen koennen.
-- (Views erben keine GRANTs der Underlying-Tabellen automatisch.)
GRANT SELECT ON public.partner_admin_view TO service_role, authenticated;
GRANT SELECT ON public.tenant_to_partner_view TO service_role, authenticated;

-- ============================================================
-- 2. text_override + text_override_history Tabellen
-- ============================================================

-- text_override: Aktueller Override-Wert pro (scope, scope_id, text_key, locale).
-- scope='global' -> scope_id IS NULL (Strategaize-weit)
-- scope='template' -> scope_id=template.id (Template-spezifisch)
-- scope='partner' -> scope_id=partner_organization.id (Partner-spezifisch)
CREATE TABLE IF NOT EXISTS public.text_override (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL CHECK (scope IN ('global','template','partner')),
  scope_id    uuid NULL,
  text_key    text NOT NULL CHECK (text_key ~ '^[a-z0-9._]{1,200}$'),
  text_value  text NOT NULL CHECK (length(text_value) <= 8000),
  locale      text NOT NULL DEFAULT 'de',
  updated_by  uuid NOT NULL REFERENCES auth.users(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scope_id_matches_scope CHECK (
    (scope = 'global' AND scope_id IS NULL) OR
    (scope IN ('template','partner') AND scope_id IS NOT NULL)
  )
);

-- Unique-Index mit COALESCE damit scope='global'-Rows ohne scope_id
-- als unique (scope, NULL-Sentinel, text_key, locale) behandelt werden.
CREATE UNIQUE INDEX IF NOT EXISTS text_override_unique
  ON public.text_override (
    scope,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    text_key,
    locale
  );

CREATE INDEX IF NOT EXISTS text_override_key_locale
  ON public.text_override (text_key, locale);

CREATE INDEX IF NOT EXISTS text_override_scope_id
  ON public.text_override (scope, scope_id)
  WHERE scope_id IS NOT NULL;

-- text_override_history: Audit-Trail fuer DSGVO-Auskunftspflicht (DEC-148).
-- Append-only, kein UPDATE/DELETE durch normale User-Pfade.
CREATE TABLE IF NOT EXISTS public.text_override_history (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text_override_id  uuid NULL,        -- NULL bei action='delete' (Row geloescht)
  scope             text NOT NULL,
  scope_id          uuid NULL,
  text_key          text NOT NULL,
  locale            text NOT NULL,
  old_value         text NULL,        -- NULL bei action='create'
  new_value         text NULL,        -- NULL bei action='delete'
  editor_id         uuid NOT NULL REFERENCES auth.users(id),
  editor_role       text NOT NULL,
  action            text NOT NULL CHECK (action IN ('create','update','delete')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS text_override_history_key
  ON public.text_override_history (text_key, locale, created_at DESC);

CREATE INDEX IF NOT EXISTS text_override_history_editor
  ON public.text_override_history (editor_id, created_at DESC);

-- ============================================================
-- 3. RLS aktivieren + Policies (DEC-148)
-- ============================================================

ALTER TABLE public.text_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.text_override_history ENABLE ROW LEVEL SECURITY;

-- 3a) text_override: strategaize_admin darf alles
DROP POLICY IF EXISTS text_override_admin_all ON public.text_override;
CREATE POLICY text_override_admin_all
  ON public.text_override
  FOR ALL
  USING (public.is_strategaize_admin(auth.uid()))
  WITH CHECK (public.is_strategaize_admin(auth.uid()));

-- 3b) partner_admin darf global+template lesen (eigene partner-Rows via 3c)
DROP POLICY IF EXISTS text_override_partner_read_global_template ON public.text_override;
CREATE POLICY text_override_partner_read_global_template
  ON public.text_override
  FOR SELECT
  USING (scope IN ('global','template'));

-- 3c) partner_admin darf eigene partner-Rows lesen + schreiben
DROP POLICY IF EXISTS text_override_partner_own ON public.text_override;
CREATE POLICY text_override_partner_own
  ON public.text_override
  FOR ALL
  USING (
    scope = 'partner'
    AND scope_id IN (
      SELECT partner_org_id FROM public.partner_admin_view WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    scope = 'partner'
    AND scope_id IN (
      SELECT partner_org_id FROM public.partner_admin_view WHERE user_id = auth.uid()
    )
  );

-- 3d) Normale Tenant-User (tenant_admin/tenant_member/employee) duerfen
-- global + template + own-partner LESEN. Kein Write.
-- (Note: partner_admin trifft 3b oder 3c; diese Policy ist fuer alle anderen
-- authenticated Rollen. Permissive-OR-Merge mit 3b/3c ist gewollt.)
DROP POLICY IF EXISTS text_override_tenant_read ON public.text_override;
CREATE POLICY text_override_tenant_read
  ON public.text_override
  FOR SELECT
  USING (
    scope IN ('global','template')
    OR (
      scope = 'partner'
      AND scope_id IN (
        SELECT partner_org_id FROM public.tenant_to_partner_view
        WHERE tenant_id = public.current_tenant_id()
      )
    )
  );

-- 3e) text_override_history: strategaize_admin sieht alles
DROP POLICY IF EXISTS text_override_history_admin_all ON public.text_override_history;
CREATE POLICY text_override_history_admin_all
  ON public.text_override_history
  FOR SELECT
  USING (public.is_strategaize_admin(auth.uid()));

-- 3f) text_override_history: partner_admin sieht nur eigene partner-Audit
DROP POLICY IF EXISTS text_override_history_partner_own ON public.text_override_history;
CREATE POLICY text_override_history_partner_own
  ON public.text_override_history
  FOR SELECT
  USING (
    scope_id IN (
      SELECT partner_org_id FROM public.partner_admin_view WHERE user_id = auth.uid()
    )
  );

-- 3g) INSERT-Policy fuer text_override_history: jede authenticated-Rolle darf
-- eigene Editor-Eintraege schreiben. Server-Actions sind verantwortlich, die
-- richtigen old_value/new_value/action/editor_role zu setzen.
DROP POLICY IF EXISTS text_override_history_insert_self ON public.text_override_history;
CREATE POLICY text_override_history_insert_self
  ON public.text_override_history
  FOR INSERT
  WITH CHECK (editor_id = auth.uid());

-- ============================================================
-- 4. GRANTs (Pflicht-Pattern, sonst Production-500)
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.text_override TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.text_override TO authenticated;

-- text_override_history ist append-only fuer authenticated; UPDATE/DELETE
-- bleibt service_role-exklusiv fuer Admin-Cleanup-Pfade.
GRANT SELECT, INSERT ON public.text_override_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.text_override_history TO service_role;

COMMIT;

-- ============================================================
-- Post-Apply (manuell auf Server, NICHT in Transaction):
-- NOTIFY pgrst, 'reload schema';
-- ============================================================
