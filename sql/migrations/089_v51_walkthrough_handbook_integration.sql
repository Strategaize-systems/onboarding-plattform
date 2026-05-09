-- Migration 089 — V5.1 Walkthrough Handbuch-Integration
-- MIG-033 — SLC-091 MT-4 (FEAT-038)
--
-- Zweck:
--   1. CREATE OR REPLACE FUNCTION rpc_get_walkthrough_video_path — RLS-Gateway fuer
--      den Storage-Proxy /api/walkthrough/[sessionId]/embed (DEC-099). Pattern-Reuse
--      aus FEAT-028 SLC-040 rpc_get_handbook_snapshot_path.
--   2. DML idempotent: existing produktive Templates (handbook_schema NOT NULL +
--      sections-Array) bekommen eine Walkthroughs-Section mit Default order=15
--      (DEC-095). Containment-Check verhindert doppelten Insert bei Re-Apply.
--
-- Apply-Pattern (per sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/089_v51_walkthrough_handbook_integration.sql
--   echo '<BASE64>' | base64 -d > /tmp/089_v51.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/089_v51.sql
--
-- Pre-Apply-Backup-Pflicht:
--   docker exec <db-container> psql -U postgres -d postgres -c \
--     "COPY (SELECT id, name, version, handbook_schema FROM template) TO STDOUT WITH CSV HEADER" \
--     > /opt/onboarding-plattform-backups/pre-mig-033_$(date +%Y%m%d_%H%M%S).csv
--
-- Verifikation:
--   1. \df rpc_get_walkthrough_video_path
--      → zeigt Function (SECURITY DEFINER, owner postgres)
--   2. SELECT id, name, jsonb_array_length(handbook_schema -> 'sections') AS n_sections
--        FROM template WHERE handbook_schema IS NOT NULL;
--      → Anzahl Sections jedes Templates +1 nach Apply (vs. pre-apply-backup)
--   3. SELECT name, handbook_schema -> 'sections' FROM template
--        WHERE handbook_schema -> 'sections' @> '[{"key":"walkthroughs"}]'::jsonb;
--      → beide produktiven Templates listed
--   4. RPC-Smoke gegen existing approved Session (z.B. 75098a5d):
--      docker exec <db-container> psql -U postgres -d postgres -c \
--        "SELECT public.rpc_get_walkthrough_video_path('<session-uuid>'::uuid);"
--      → liefert {"storage_path":"...","created_at":"..."} oder error-JSONB
--
-- Rollback:
--   1. DROP FUNCTION IF EXISTS public.rpc_get_walkthrough_video_path(uuid);
--   2. DML-Restore via Pre-Apply-Backup-CSV (manuell falls noetig).

DO $mig033$ BEGIN

-- =============================================
-- 1. RPC fuer Storage-Proxy-RLS-Check (DEC-099)
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_get_walkthrough_video_path(
  p_walkthrough_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $func$
DECLARE
  v_session record;
  v_role    text;
  v_tenant  uuid;
BEGIN
  -- Authorization-Context
  v_role := auth.user_role();
  v_tenant := auth.user_tenant_id();

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  -- Reader-Zugriff nur fuer tenant_admin + strategaize_admin (V4.1 DEC-V4.1-2,
  -- konsistent mit FEAT-028 Reader-Routing).
  IF v_role NOT IN ('tenant_admin', 'strategaize_admin') THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Session laden (RLS bypassed via SECURITY DEFINER — Authorization manuell oben)
  SELECT id, tenant_id, status, storage_path, created_at, reviewed_at
    INTO v_session
    FROM public.walkthrough_session
    WHERE id = p_walkthrough_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- Tenant-Check: tenant_admin nur eigener Tenant; strategaize_admin cross-tenant
  IF v_role = 'tenant_admin' AND v_session.tenant_id != v_tenant THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Status-Check: nur approved Sessions liefern Video
  IF v_session.status != 'approved' THEN
    RETURN jsonb_build_object('error', 'not_approved', 'status', v_session.status);
  END IF;

  -- Storage-Path muss vorhanden sein (sonst inkonsistenter DB-State — V5-Worker
  -- setzt storage_path nach Upload, approved-Session ohne path wuerde nie
  -- existieren — wir defensive-checken trotzdem)
  IF v_session.storage_path IS NULL OR length(v_session.storage_path) = 0 THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'storage_path', v_session.storage_path,
    'created_at',   v_session.created_at,
    'reviewed_at',  v_session.reviewed_at
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_get_walkthrough_video_path(uuid) TO authenticated;

RAISE NOTICE 'MIG-033/089: rpc_get_walkthrough_video_path created';

-- =============================================
-- 2. DML: Walkthroughs-Section in produktive Templates idempotent einfuegen
-- =============================================
-- Containment-Check verhindert Doppel-Insert bei Re-Apply. Templates ohne
-- handbook_schema (NULL) oder ohne sections-Array werden NICHT angefasst.
UPDATE public.template
SET handbook_schema = jsonb_set(
  handbook_schema,
  '{sections}',
  (handbook_schema -> 'sections') || jsonb_build_array(
    jsonb_build_object(
      'key',   'walkthroughs',
      'title', 'Walkthroughs',
      'order', 15,
      'sources', jsonb_build_array(
        jsonb_build_object(
          'type',   'walkthrough',
          'filter', jsonb_build_object('min_status', 'approved')
        )
      ),
      'render', jsonb_build_object(
        'subsections_by', 'subtopic',
        'intro_template', null
      )
    )
  )
)
WHERE handbook_schema IS NOT NULL
  AND handbook_schema ? 'sections'
  AND jsonb_typeof(handbook_schema -> 'sections') = 'array'
  AND NOT (handbook_schema -> 'sections' @> '[{"key":"walkthroughs"}]'::jsonb);

RAISE NOTICE 'MIG-033/089: walkthroughs-section ensured in templates with handbook_schema';

END $mig033$;
