-- Migration 133: Onboarding-Plattform V20 — DB/Authz-Hardening (SLC-193 / FEAT-110 / BL-537)
-- Datum: 2026-07-09
-- Slice: SLC-193 (MT-1) · DEC-279 / DEC-286 · ARCHITECTURE.md "## X. V20 Architecture" §X.4
-- Grundlage: /security-audit RPT-633 (ISSUE-125 tier-INSERT-Bypass, ISSUE-129 berater-RPC
--            Caller-Param-Trust) + profiles.role-Defense-in-Depth-Port (P-080, IMP-1717).
-- Quellen (verbatim re-gelesen, /architecture §X.2 + SLC-193 MT-0-Grounding):
--   - capture_session_tier_change_guard + Trigger:  121_v975_tier_gating_foundation.sql:172-192
--   - ai_jobs_session_tier_insert_guard (service_role+postgres-Muster): 121:214-232
--   - berater_assigned_tenant_ids(uuid):             132_v104_berater_foundation.sql:129-151
--   - handle_new_user (SECURITY DEFINER owner postgres, INSERT public.profiles): live-gegroundet
-- Reuse: BS V8.14 SLC-912 profiles.role current_user-Guard-Pattern (P-080,
--        strategaize-pattern-reuse.md).
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS/CREATE TRIGGER +
--             ALTER COLUMN SET DEFAULT. 2x-Apply = No-Op.
--
-- Rollback:
--   -- 1. tier-Guard auf reine BEFORE-UPDATE-Variante (121) zuruecksetzen:
--   --    \i sql/migrations/121_v975_tier_gating_foundation.sql (Abschnitt 3) — CREATE OR
--   --    REPLACE stellt Body wieder her; danach Trigger auf BEFORE UPDATE zuruecksetzen.
--   ALTER TABLE public.capture_session ALTER COLUMN tier SET DEFAULT 'handbook';
--   -- 2. berater_assigned_tenant_ids: \i sql/migrations/132 (Schritt 4) re-applyen.
--   -- 3. profiles-Guard entfernen:
--   DROP TRIGGER IF EXISTS profiles_role_change_guard ON public.profiles;
--   DROP FUNCTION IF EXISTS public.profiles_role_change_guard();

BEGIN;

-- ============================================================
-- 1. capture_session.tier — INSERT-Coerce + UPDATE-Deny (DEC-279, ISSUE-125)
-- ============================================================
-- Bisher (121): nur BEFORE UPDATE, blockt tier-Change fuer non-service_role.
-- Loch (ISSUE-125): ein authenticated tenant_admin kann per direktem PostgREST-INSERT
-- {tier:'handbook'} eine Voll-Kunde-Session anlegen (INSERT wurde nie gegated).
-- Fix: Trigger auf BEFORE INSERT OR UPDATE erweitern.
--   - INSERT durch non-service_role  -> tier ZWANGS-'free' (Coerce, kein Block, damit
--     legit authenticated Capture-Flows weiter Sessions anlegen; Feature-Tier wird
--     per service_role nachgezogen, MT-2).
--   - INSERT durch service_role      -> expliziter tier bleibt (App-Feature-Flows).
--   - UPDATE tier durch non-service_role -> EXCEPTION (unveraendert seit 121).
-- Hinweis: postgres-Superuser-INSERT wird ebenfalls auf 'free' coerced (Wartung via
--   SET ROLE service_role) — akzeptiert, konsistent mit dem 121-Kommentarblock. Es gibt
--   keinen SECURITY-DEFINER/postgres-Pfad, der capture_session mit elevated tier anlegt.
CREATE OR REPLACE FUNCTION public.capture_session_tier_change_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user <> 'service_role' THEN
      NEW.tier := 'free';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.tier IS DISTINCT FROM OLD.tier
     AND current_user <> 'service_role' THEN
    RAISE EXCEPTION
      'capture_session.tier change denied for role "%" (service_role required)', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_session_tier_change_guard ON public.capture_session;

CREATE TRIGGER capture_session_tier_change_guard
  BEFORE INSERT OR UPDATE ON public.capture_session
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_session_tier_change_guard();

-- ============================================================
-- 2. capture_session.tier — Column-DEFAULT least-privilege (DEC-279)
-- ============================================================
-- Least-Privilege: eine Session ohne explizit gesetzten tier startet 'free' (nicht mehr
-- 'handbook'). Legit Feature-Entry-Flows setzen ihren entitled tier explizit via
-- service_role (MT-2). CHECK unveraendert (free/blueprint/handbook).
ALTER TABLE public.capture_session
  ALTER COLUMN tier SET DEFAULT 'free';

COMMENT ON COLUMN public.capture_session.tier IS
  'V9.75/V20 Entitlement-Stufe (free/blueprint/handbook). DEFAULT=free (V20 least-privilege). '
  'Schreibpfad nur service_role (Trigger-geschuetzt, INSERT-Coerce + UPDATE-Deny). DEC-219/279.';

-- ============================================================
-- 3. berater_assigned_tenant_ids — Caller-Param-Trust schliessen (DEC-286, ISSUE-129)
-- ============================================================
-- Bisher (132): WHERE bta.berater_user_id = p_uid. Weil GRANT authenticated + p_uid frei
-- waehlbar, kann ein authenticated User FREMDE Berater-Zuweisungen aufloesen (IDOR).
-- Fix: COALESCE(auth.uid(), p_uid) INLINE in beide WHERE-Klauseln — im authenticated-
-- Kontext gewinnt IMMER auth.uid() (Self), der service_role-Query-Layer-Loader (auth.uid()
-- =NULL) faellt auf den explizit uebergebenen p_uid zurueck (unveraendertes Verhalten).
-- Plan-QA-Korrektur RPT-637: Funktion ist LANGUAGE sql -> keine plpgsql-Variable, COALESCE
-- muss inline stehen. LANGUAGE/STABLE/DEFINER/search_path UNVERAENDERT. Body sonst byte-
-- identisch zu 132:136-150.
-- Consumer (grounding-gate-check 3, alle COALESCE-safe): workspace-scope.ts:53 (user-Client,
-- auth.uid()) / :72 (admin, p_uid) / exit-report/route.ts:57 (admin, p_uid) / can_see_tenant
-- (132, intern berater_assigned_tenant_ids(auth.uid())). REVOKE PUBLIC/anon bleibt (132).
CREATE OR REPLACE FUNCTION public.berater_assigned_tenant_ids(p_uid uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT tid), '{}'::uuid[])
  FROM (
    -- direkt zugewiesene Kanzlei-/Direkt-Tenants
    SELECT bta.tenant_id AS tid
    FROM public.berater_tenant_assignments bta
    WHERE bta.berater_user_id = COALESCE(auth.uid(), p_uid)
    UNION
    -- Mandanten der zugewiesenen Kanzleien (Cascade via accepted mapping)
    SELECT pcm.client_tenant_id AS tid
    FROM public.berater_tenant_assignments bta
    JOIN public.partner_client_mapping pcm
      ON pcm.partner_tenant_id = bta.tenant_id
     AND pcm.invitation_status = 'accepted'
    WHERE bta.berater_user_id = COALESCE(auth.uid(), p_uid)
  ) s;
$$;

-- ============================================================
-- 4. profiles.role / profiles.tenant_id — Column-Level-Defense-in-Depth (P-080-Port)
-- ============================================================
-- OP profiles hat KEINE team_id (nur BS) — die authz-tragenden Spalten sind role UND
-- tenant_id. Bisher existiert KEIN Guard (0 non-interne Trigger, live-gegroundet). RLS
-- schuetzt nicht column-level: eine kuenftige/verirrte authenticated-Mutation koennte
-- role/tenant_id self-promoten. Defense-in-Depth-Guard analog capture_session (121) +
-- ai_jobs (121:214-232, das service_role+postgres erlaubt).
--
-- Legit-Schreibpfade (ALLE current_user IN service_role/postgres -> ALLOW):
--   - handle_new_user()  SECURITY DEFINER owner=postgres -> current_user='postgres' -> ALLOW
--     (einziger INSERT-Pfad heute; live-gegroundet)
--   - createAdminClient() service_role                    -> current_user='service_role' -> ALLOW
--   - authenticated (PostgREST direct)                    -> BLOCK
-- Heute existiert KEIN authenticated profiles-Write in der App (grep: 0 Prod-Writes) ->
-- reine Defense-in-Depth, bricht keinen Flow. postgres MUSS erlaubt sein, sonst blockt der
-- Guard den handle_new_user-Signup-Pfad.
CREATE OR REPLACE FUNCTION public.profiles_role_change_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'profiles INSERT denied for role "%" (service_role required)', current_user
      USING ERRCODE = 'insufficient_privilege';
  ELSIF TG_OP = 'UPDATE'
     AND (NEW.role IS DISTINCT FROM OLD.role
          OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
    RAISE EXCEPTION
      'profiles.role/tenant_id change denied for role "%" (service_role required)', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_role_change_guard ON public.profiles;

CREATE TRIGGER profiles_role_change_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_role_change_guard();

-- Schema-Cache-Reload (neue Function-Bodies fuer PostgREST sichtbar machen).
NOTIFY pgrst, 'reload schema';

COMMIT;
