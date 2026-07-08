-- MIG-132 — V10.4 strategaize_berater Foundation (DEC-267/268/269)
-- Datum: 2026-07-07
-- MIG-Doc-ID: MIG-132
-- Slice: SLC-188 (FEAT-105)
-- DECs: DEC-267 (Zuordnungs-Tabelle berater_tenant_assignments, nicht Einzelspalte);
--       DEC-268 (Zuweisung auf Kanzlei-/Direkt-Tenant + Mandanten-Cascade via
--                partner_client_mapping accepted);
--       DEC-269 (can_see_tenant als SECURITY-DEFINER-SQL-Function, P2-Sicht im
--                Query-Layer, KEIN Berater-Zweig auf tenant-RLS-Policies in P2).
--
-- QUELLE DER WAHRHEIT: Live-DB supabase-db-...-162242937585 (Spike 2026-07-07, SLC-188 MT-1).
--   - profiles_role_check live = 4 Werte (strategaize_admin/tenant_admin/employee/partner_admin).
--   - handle_new_user() live-prosrc verbatim uebernommen; EINZIGE Aenderung = 'strategaize_berater'
--     in die valid-role-Liste (Zeile IF v_role NOT IN ...). Berater bleibt cross-tenant OHNE
--     tenant_id (NICHT im tenant_id-Pflicht-Zweig, wie strategaize_admin).
--   - Cascade-Quelle-Spike: parent_partner_tenant_id und partner_client_mapping(accepted) sind
--     live vollstaendig kongruent (Divergenz A+B = 0 Rows) -> partner_client_mapping(accepted)
--     allein liefert die vollstaendige Mandanten-Menge (= aktiver partner_admin-Pfad, DEC-268).
--   - on_auth_user_created-Trigger auf auth.users existiert live (R-ARCH-V-2 bestaetigt).
--
-- Was diese Migration tut (in Reihenfolge, additiv):
--   1. CREATE TABLE berater_tenant_assignments + Index + RLS + GRANTs.
--   2. profiles_role_check 4 -> 5 Werte (+ strategaize_berater).
--   3. handle_new_user() neu (valid-Liste + strategaize_berater; Pflicht-Zweig unveraendert).
--   4. berater_assigned_tenant_ids(uuid) SECURITY DEFINER (zugewiesene ∪ Cascade-Mandanten).
--   5. can_see_tenant(uuid) SECURITY DEFINER (admin OR zugewiesen) — bereit fuer P4-RLS.
--
-- Idempotent: CREATE TABLE/POLICY/INDEX IF NOT EXISTS; DROP CONSTRAINT/POLICY IF EXISTS + ADD;
--   CREATE OR REPLACE FUNCTION. Ein Rollback-Punkt (additiv).
--
-- Apply-Procedure (per .claude/rules/sql-migration-hetzner.md, im /deploy, VOR Redeploy):
--   1. Pre-Apply-Live-Audit (pg_dump -s Snapshot -> /root/mig132_rollback/, MIG-131-Muster).
--   2. base64 -w 0 sql/migrations/132_v104_berater_foundation.sql
--   3. ssh root@159.69.207.29 "echo 'BASE64' | base64 -d > /tmp/m132.sql"
--   4. ssh root@159.69.207.29 "docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m132.sql"
--
-- Rollback: DROP FUNCTION can_see_tenant, berater_assigned_tenant_ids; DROP TABLE
--   berater_tenant_assignments; profiles_role_check zurueck auf 4 Werte; handle_new_user
--   aus dem Pre-Apply-Dump re-applyen.

-- ============================================================
-- Schritt 1 — Zuordnungs-Tabelle berater_tenant_assignments (DEC-267)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.berater_tenant_assignments (
  berater_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  assigned_by     uuid REFERENCES public.profiles(id),
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (berater_user_id, tenant_id)
);

-- Reverse-Lookup (welche Berater betreuen Tenant X)
CREATE INDEX IF NOT EXISTS idx_berater_tenant_assignments_tenant
  ON public.berater_tenant_assignments (tenant_id);

ALTER TABLE public.berater_tenant_assignments ENABLE ROW LEVEL SECURITY;

-- service_role (createAdminClient, SLC-189 Verwaltung) + authenticated (RLS filtert)
REVOKE ALL ON public.berater_tenant_assignments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.berater_tenant_assignments TO authenticated, service_role;

-- Admin verwaltet alles (set/unset), Berater sieht nur eigene Zuweisungen.
DROP POLICY IF EXISTS bta_admin_all ON public.berater_tenant_assignments;
CREATE POLICY bta_admin_all ON public.berater_tenant_assignments
  FOR ALL TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

DROP POLICY IF EXISTS bta_berater_select_own ON public.berater_tenant_assignments;
CREATE POLICY bta_berater_select_own ON public.berater_tenant_assignments
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'strategaize_berater' AND berater_user_id = auth.uid());

-- ============================================================
-- Schritt 2 — profiles_role_check 4 -> 5 Werte (+ strategaize_berater)
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['strategaize_admin'::text, 'tenant_admin'::text, 'employee'::text, 'partner_admin'::text, 'strategaize_berater'::text]));

-- ============================================================
-- Schritt 3 — handle_new_user() neu (valid-Liste + strategaize_berater)
-- Live-prosrc verbatim; einzige Aenderung = 'strategaize_berater' in valid-Liste.
-- Berater NICHT im tenant_id-Pflicht-Zweig -> cross-tenant ohne tenant_id (wie strategaize_admin).
-- ============================================================
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
  v_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'tenant_admin');

  IF v_role NOT IN ('strategaize_admin', 'tenant_admin', 'employee', 'partner_admin', 'strategaize_berater') THEN
    RAISE EXCEPTION 'handle_new_user: invalid role: %', v_role
      USING ERRCODE = 'P0400';
  END IF;

  IF v_role IN ('tenant_admin', 'employee', 'partner_admin') THEN
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
-- Schritt 4 — berater_assigned_tenant_ids(uuid) (DEC-268)
-- Zugewiesene Kanzlei-/Direkt-Tenants ∪ deren Mandanten (partner_client_mapping accepted).
-- SECURITY DEFINER: liest berater_tenant_assignments + partner_client_mapping ohne dass der
-- Caller direkte SELECT-Policies braucht. STABLE (Cache pro Statement). p_uid explizit ->
-- im Query-Layer-Loader (service_role, auth.uid()=NULL) nutzbar via rpc.
-- ============================================================
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
    WHERE bta.berater_user_id = p_uid
    UNION
    -- Mandanten der zugewiesenen Kanzleien (Cascade via accepted mapping)
    SELECT pcm.client_tenant_id AS tid
    FROM public.berater_tenant_assignments bta
    JOIN public.partner_client_mapping pcm
      ON pcm.partner_tenant_id = bta.tenant_id
     AND pcm.invitation_status = 'accepted'
    WHERE bta.berater_user_id = p_uid
  ) s;
$$;

-- ============================================================
-- Schritt 5 — can_see_tenant(uuid) (DEC-269) — bereit fuer P4-RLS
-- admin (cross-tenant) OR Tenant in der Berater-Zuweisung des aktuellen Users.
-- Nutzt auth.uid() intern -> primaer RLS-Nutzung (P4). Der P2-Query-Layer-Loader nutzt
-- direkt berater_assigned_tenant_ids(explizite uid).
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_see_tenant(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.user_role() = 'strategaize_admin'
      OR p_tenant = ANY (public.berater_assigned_tenant_ids(auth.uid()));
$$;

-- ============================================================
-- Schritt 6 — Function-GRANTs (permission-sensitive: REVOKE PUBLIC/anon)
-- ============================================================
REVOKE ALL ON FUNCTION public.berater_assigned_tenant_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_see_tenant(uuid)              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.berater_assigned_tenant_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_see_tenant(uuid)              TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verifikation (auskommentiert)
-- ============================================================
-- CHECK-Def (soll 5 Werte inkl. strategaize_berater):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'profiles_role_check';
-- Tabelle + Policies:
--   \d public.berater_tenant_assignments
--   SELECT policyname FROM pg_policies WHERE tablename = 'berater_tenant_assignments';
-- Functions vorhanden:
--   SELECT proname FROM pg_proc WHERE proname IN ('berater_assigned_tenant_ids','can_see_tenant');
-- handle_new_user valid-Liste (soll 5 Werte):
--   SELECT pg_get_functiondef('public.handle_new_user'::regproc);
