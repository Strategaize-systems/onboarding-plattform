-- Migration 090: V6 Partner-Tenant Foundation + RLS-Erweiterung
-- SLC-101 (FEAT-041, MIG-034 Step 1) — DEC-099..112
--
-- ZIEL
-- ====
-- 1) tenants um tenant_kind + parent_partner_tenant_id erweitern.
-- 2) Neue Postgres-Rolle partner_admin + Schema/Tabellen-Grants.
-- 3) profiles.role CHECK + handle_new_user-Trigger um 'partner_admin' erweitern.
-- 4) partner_organization-Tabelle anlegen (Stammdaten Steuerberater-Kanzlei).
-- 5) partner_client_mapping-Tabelle anlegen (Sichtbarkeits-Layer) inkl. Trigger,
--    der die tenant_kind-Konsistenz erzwingt.
-- 6) RLS aktivieren + Defense-in-Depth-Policies pro Tabelle (Rolle UND Tenant).
-- 7) Bestehende RLS-Policies fuer tenants/capture_session/knowledge_unit/
--    block_checkpoint/validation_layer um additive partner_admin-Policies
--    erweitern (KEIN DROP/RECREATE der V4/V5-Policies — Regression-Schutz).
--
-- IDEMPOTENZ
-- ==========
-- Alle DDL-Statements verwenden IF NOT EXISTS / DROP POLICY IF EXISTS und sind
-- so geschrieben, dass ein zweiter Apply ein No-Op ist.
-- NICHT idempotent: ADD CONSTRAINT (ohne IF NOT EXISTS in PG < 16) — wird daher
-- per DO-Block + Lookup auf pg_constraint geschuetzt.
--
-- DEFENSE-IN-DEPTH
-- ================
-- Jede neue Policy prueft Rolle UND Tenant-Bindung explizit. Keine
-- "OR auth.user_role() = 'partner_admin'"-Schnellloesung ohne Tenant-Constraint.

BEGIN;

-- ============================================================
-- 1. profiles.role CHECK + handle_new_user erweitern
-- ============================================================
-- Bestehender CHECK erlaubt nur 4 Rollen. partner_admin wird hinzugefuegt.
-- DROP+ADD ist hier sicher: kein Daten-Migrationsbedarf, kein Default-Wert.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('strategaize_admin', 'tenant_admin', 'tenant_member', 'employee', 'partner_admin'));

-- handle_new_user akzeptiert partner_admin und verlangt tenant_id (analog zu
-- tenant_admin/tenant_member/employee). Strategaize-Admin bleibt der einzige
-- tenant-lose User.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tenant_id uuid;
  v_role      text;
BEGIN
  v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid;
  v_role := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'role', ''),
    'tenant_admin'
  );

  IF v_role NOT IN ('strategaize_admin', 'tenant_admin', 'tenant_member', 'employee', 'partner_admin') THEN
    RAISE EXCEPTION 'handle_new_user: invalid role: %', v_role
      USING ERRCODE = 'P0400';
  END IF;

  IF v_role IN ('tenant_admin', 'tenant_member', 'employee', 'partner_admin') THEN
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'handle_new_user: tenant_id required for role %', v_role
        USING ERRCODE = 'P0422';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
      RAISE EXCEPTION 'handle_new_user: tenant % does not exist', v_tenant_id
        USING ERRCODE = 'P0404';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, tenant_id, email, role)
  VALUES (NEW.id, v_tenant_id, NEW.email, v_role);

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. tenants Schema-Erweiterung
-- ============================================================
-- tenant_kind hat einen DEFAULT — alle bestehenden Rows werden in einem
-- Schritt 'direct_client'. parent_partner_tenant_id darf nur fuer
-- partner_client gesetzt sein (CHECK-Constraint), sonst MUSS NULL.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tenant_kind text NOT NULL DEFAULT 'direct_client';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_tenant_kind_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_tenant_kind_check
        CHECK (tenant_kind IN ('direct_client', 'partner_organization', 'partner_client'));
  END IF;
END $$;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS parent_partner_tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_parent_partner_consistency'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_parent_partner_consistency CHECK (
        (tenant_kind = 'partner_client' AND parent_partner_tenant_id IS NOT NULL)
        OR (tenant_kind != 'partner_client' AND parent_partner_tenant_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tenants_tenant_kind ON public.tenants (tenant_kind);
CREATE INDEX IF NOT EXISTS idx_tenants_parent_partner ON public.tenants (parent_partner_tenant_id)
  WHERE parent_partner_tenant_id IS NOT NULL;

-- ============================================================
-- 3. Postgres-Rolle partner_admin
-- ============================================================
-- Wird angelegt damit AC #3 erfuellt ist (Rolle existiert in pg_roles, SET LOCAL
-- ROLE moeglich). Policies pruefen Application-Rolle ueber auth.user_role()
-- (analog V4/V5-Pattern) — Postgres-ROLE-Grants existieren zusaetzlich fuer
-- den Fall, dass jemand direkt als partner_admin connectet (z.B. PostgREST
-- mit role-claim).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'partner_admin') THEN
    CREATE ROLE partner_admin NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO partner_admin;
GRANT USAGE ON SCHEMA auth   TO partner_admin;
GRANT EXECUTE ON FUNCTION auth.user_role()      TO partner_admin;
GRANT EXECUTE ON FUNCTION auth.user_tenant_id() TO partner_admin;
GRANT EXECUTE ON FUNCTION auth.uid()            TO partner_admin;

-- ============================================================
-- 4. partner_organization
-- ============================================================
CREATE TABLE IF NOT EXISTS public.partner_organization (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_name               text        NOT NULL,
  display_name             text        NOT NULL,
  partner_kind             text        NOT NULL DEFAULT 'tax_advisor',
  tier                     text        NULL,
  contact_email            text        NOT NULL,
  contact_phone            text        NULL,
  country                  text        NOT NULL,
  created_by_admin_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_organization_partner_kind_check') THEN
    ALTER TABLE public.partner_organization
      ADD CONSTRAINT partner_organization_partner_kind_check
        CHECK (partner_kind IN ('tax_advisor'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_organization_country_check') THEN
    ALTER TABLE public.partner_organization
      ADD CONSTRAINT partner_organization_country_check
        CHECK (country IN ('DE', 'NL'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_partner_organization_tenant_id ON public.partner_organization (tenant_id);

ALTER TABLE public.partner_organization ENABLE ROW LEVEL SECURITY;

-- partner_admin liest eigene Organisation (Tenant-Constraint).
DROP POLICY IF EXISTS po_select_own_partner_admin ON public.partner_organization;
CREATE POLICY po_select_own_partner_admin ON public.partner_organization
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- partner_admin darf eigene Stammdaten updaten (kein DELETE, kein INSERT).
DROP POLICY IF EXISTS po_update_own_partner_admin ON public.partner_organization;
CREATE POLICY po_update_own_partner_admin ON public.partner_organization
  FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'partner_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- strategaize_admin Full-Access.
DROP POLICY IF EXISTS po_all_strategaize_admin ON public.partner_organization;
CREATE POLICY po_all_strategaize_admin ON public.partner_organization
  FOR ALL TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_organization TO authenticated;
GRANT SELECT, UPDATE                  ON public.partner_organization TO partner_admin;
GRANT ALL                             ON public.partner_organization TO service_role;

-- ============================================================
-- 5. partner_client_mapping + Trigger
-- ============================================================
CREATE TABLE IF NOT EXISTS public.partner_client_mapping (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id  uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invited_by_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  invitation_status  text        NOT NULL,
  invited_at         timestamptz NOT NULL DEFAULT now(),
  accepted_at        timestamptz NULL,
  revoked_at         timestamptz NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_client_mapping_invitation_status_check') THEN
    ALTER TABLE public.partner_client_mapping
      ADD CONSTRAINT partner_client_mapping_invitation_status_check
        CHECK (invitation_status IN ('invited', 'accepted', 'revoked'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_client_mapping_unique_pair') THEN
    ALTER TABLE public.partner_client_mapping
      ADD CONSTRAINT partner_client_mapping_unique_pair UNIQUE (partner_tenant_id, client_tenant_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_partner_client_mapping_partner ON public.partner_client_mapping (partner_tenant_id);
CREATE INDEX IF NOT EXISTS idx_partner_client_mapping_client  ON public.partner_client_mapping (client_tenant_id);
CREATE INDEX IF NOT EXISTS idx_partner_client_mapping_status  ON public.partner_client_mapping (invitation_status);

-- Trigger: erzwingt tenant_kind-Konsistenz. SECURITY DEFINER damit Tenant-Lookup
-- nicht an RLS scheitert (Lookup laeuft als Funktions-Owner=postgres).
CREATE OR REPLACE FUNCTION public.check_partner_client_mapping_tenant_kinds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_partner_kind text;
  v_client_kind  text;
BEGIN
  SELECT tenant_kind INTO v_partner_kind FROM public.tenants WHERE id = NEW.partner_tenant_id;
  IF v_partner_kind IS DISTINCT FROM 'partner_organization' THEN
    RAISE EXCEPTION 'partner_tenant_id must reference a tenant with tenant_kind=partner_organization (got: %)', v_partner_kind
      USING ERRCODE = '23514';
  END IF;

  SELECT tenant_kind INTO v_client_kind FROM public.tenants WHERE id = NEW.client_tenant_id;
  IF v_client_kind IS DISTINCT FROM 'partner_client' THEN
    RAISE EXCEPTION 'client_tenant_id must reference a tenant with tenant_kind=partner_client (got: %)', v_client_kind
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_client_mapping_tenant_kinds ON public.partner_client_mapping;
CREATE TRIGGER trg_partner_client_mapping_tenant_kinds
  BEFORE INSERT OR UPDATE ON public.partner_client_mapping
  FOR EACH ROW EXECUTE FUNCTION public.check_partner_client_mapping_tenant_kinds();

ALTER TABLE public.partner_client_mapping ENABLE ROW LEVEL SECURITY;

-- partner_admin liest eigene Mappings.
DROP POLICY IF EXISTS pcm_select_own_partner_admin ON public.partner_client_mapping;
CREATE POLICY pcm_select_own_partner_admin ON public.partner_client_mapping
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND partner_tenant_id = auth.user_tenant_id()
  );

-- Mandant darf das eigene Mapping lesen (fuer Branding-Resolution in SLC-104).
DROP POLICY IF EXISTS pcm_select_own_mandant ON public.partner_client_mapping;
CREATE POLICY pcm_select_own_mandant ON public.partner_client_mapping
  FOR SELECT TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_member', 'employee')
    AND client_tenant_id = auth.user_tenant_id()
  );

-- partner_admin INSERT eigene Mappings.
DROP POLICY IF EXISTS pcm_insert_own_partner_admin ON public.partner_client_mapping;
CREATE POLICY pcm_insert_own_partner_admin ON public.partner_client_mapping
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'partner_admin'
    AND partner_tenant_id = auth.user_tenant_id()
  );

-- partner_admin UPDATE eigene Mappings (z.B. accepted/revoked-Wechsel).
DROP POLICY IF EXISTS pcm_update_own_partner_admin ON public.partner_client_mapping;
CREATE POLICY pcm_update_own_partner_admin ON public.partner_client_mapping
  FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND partner_tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'partner_admin'
    AND partner_tenant_id = auth.user_tenant_id()
  );

-- strategaize_admin Full-Access.
DROP POLICY IF EXISTS pcm_all_strategaize_admin ON public.partner_client_mapping;
CREATE POLICY pcm_all_strategaize_admin ON public.partner_client_mapping
  FOR ALL TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_client_mapping TO authenticated;
GRANT SELECT, INSERT, UPDATE          ON public.partner_client_mapping TO partner_admin;
GRANT ALL                              ON public.partner_client_mapping TO service_role;

-- ============================================================
-- 6. RLS-Policy-Erweiterung auf bestehenden Tabellen fuer partner_admin
-- ============================================================
-- ADDITIV: keine bestehenden Policies werden veraendert/gedropped.
-- Jede Policy prueft Rolle UND Tenant-Bindung (Defense-in-Depth).

-- ---------- tenants ----------
-- partner_admin sieht: (a) eigene Partner-Org-Tenant-Row,
--                      (b) eigene Mandanten-Tenants (parent = own).
DROP POLICY IF EXISTS tenant_select_own_partner_admin ON public.tenants;
CREATE POLICY tenant_select_own_partner_admin ON public.tenants
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND (
      id = auth.user_tenant_id()
      OR parent_partner_tenant_id = auth.user_tenant_id()
    )
  );

-- ---------- capture_session ----------
-- partner_admin sieht capture_sessions seiner aktiv eingeladenen Mandanten.
DROP POLICY IF EXISTS cs_select_partner_admin_via_mapping ON public.capture_session;
CREATE POLICY cs_select_partner_admin_via_mapping ON public.capture_session
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND EXISTS (
      SELECT 1 FROM public.partner_client_mapping pcm
       WHERE pcm.partner_tenant_id = auth.user_tenant_id()
         AND pcm.client_tenant_id  = capture_session.tenant_id
         AND pcm.invitation_status = 'accepted'
    )
  );

-- ---------- knowledge_unit ----------
DROP POLICY IF EXISTS ku_select_partner_admin_via_mapping ON public.knowledge_unit;
CREATE POLICY ku_select_partner_admin_via_mapping ON public.knowledge_unit
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND EXISTS (
      SELECT 1
        FROM public.capture_session cs
        JOIN public.partner_client_mapping pcm
          ON pcm.client_tenant_id = cs.tenant_id
       WHERE cs.id = knowledge_unit.capture_session_id
         AND pcm.partner_tenant_id = auth.user_tenant_id()
         AND pcm.invitation_status = 'accepted'
    )
  );

-- ---------- block_checkpoint ----------
DROP POLICY IF EXISTS bc_select_partner_admin_via_mapping ON public.block_checkpoint;
CREATE POLICY bc_select_partner_admin_via_mapping ON public.block_checkpoint
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND EXISTS (
      SELECT 1
        FROM public.capture_session cs
        JOIN public.partner_client_mapping pcm
          ON pcm.client_tenant_id = cs.tenant_id
       WHERE cs.id = block_checkpoint.capture_session_id
         AND pcm.partner_tenant_id = auth.user_tenant_id()
         AND pcm.invitation_status = 'accepted'
    )
  );

-- ---------- validation_layer ----------
-- validation_layer-Pfad: knowledge_unit → capture_session → partner_client_mapping.
DROP POLICY IF EXISTS vl_select_partner_admin_via_mapping ON public.validation_layer;
CREATE POLICY vl_select_partner_admin_via_mapping ON public.validation_layer
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND EXISTS (
      SELECT 1
        FROM public.knowledge_unit ku
        JOIN public.capture_session cs ON cs.id = ku.capture_session_id
        JOIN public.partner_client_mapping pcm ON pcm.client_tenant_id = cs.tenant_id
       WHERE ku.id = validation_layer.knowledge_unit_id
         AND pcm.partner_tenant_id = auth.user_tenant_id()
         AND pcm.invitation_status = 'accepted'
    )
  );

-- ============================================================
-- 7. GRANTS fuer partner_admin auf bestehende Tabellen
-- ============================================================
-- Ermoeglicht SET LOCAL ROLE partner_admin in der DB. Policies regeln Row-Visibility.
GRANT SELECT ON public.tenants           TO partner_admin;
GRANT SELECT ON public.profiles          TO partner_admin;
GRANT SELECT ON public.capture_session   TO partner_admin;
GRANT SELECT ON public.knowledge_unit    TO partner_admin;
GRANT SELECT ON public.block_checkpoint  TO partner_admin;
GRANT SELECT ON public.validation_layer  TO partner_admin;
GRANT SELECT ON public.template          TO partner_admin;

COMMIT;

-- ============================================================
-- Verifikation (manuell nach Apply)
-- ============================================================
-- \d+ tenants                                 → tenant_kind + parent_partner_tenant_id + CHECKs sichtbar
-- \d+ partner_organization                    → 12 Spalten, CHECKs, UNIQUE tenant_id
-- \d+ partner_client_mapping                  → 8 Spalten, UNIQUE (partner_tenant_id, client_tenant_id), Trigger
-- \du partner_admin                           → Rolle NOLOGIN existiert
-- \dp partner_organization                    → 3 Policies
-- \dp partner_client_mapping                  → 5 Policies
-- SELECT polname FROM pg_policy WHERE polrelid='public.tenants'::regclass;
--   → admin_full_tenants, tenant_select_own_tenant, tenant_select_own_partner_admin
