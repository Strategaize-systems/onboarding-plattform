-- Migration 084 — V5 Walkthrough-Mode / MIG-031 Teil 3 — Storage-Bucket + Storage-RLS
-- SLC-071 MT-3 — V5 Foundation (FEAT-034, DEC-075, DEC-077, DEC-078)
--
-- Zweck:
--   Anlegen des privaten Storage-Buckets `walkthroughs` mit 500MB-Limit + WebM-only-MIME-Filter.
--   Definiert 3 Storage-RLS-Policies (insert/select/delete) fuer Tenant-Isolation per Pfad-Praefix.
--
-- Sequencing-Pflicht:
--   Migration 083 (walkthrough_session-Tabelle) MUSS vor 084 deployed sein —
--   die SELECT-Policy referenziert public.walkthrough_session.
--
-- RLS-Translation-Note:
--   ARCHITECTURE.md V5-Sketch verwendet `(auth.jwt()->>'role')` + `tenant_user`-Subqueries.
--   Translation auf Onboarding-Plattform-Helper auth.user_role() + auth.user_tenant_id() (DEC-001).
--
-- Apply-Pattern (per sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/084_v5_walkthrough_storage_bucket.sql           (lokal)
--   echo '<BASE64>' | base64 -d > /tmp/084_v5.sql                             (server)
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/084_v5.sql
--
-- Verifikation:
--   docker exec <db-container> psql -U postgres -d postgres \
--     -c "SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='walkthroughs'"
--   docker exec <db-container> psql -U postgres -d postgres \
--     -c "SELECT polname FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname LIKE 'walkthroughs%'"

DO $mig031_part3$ BEGIN

-- =============================================
-- 1. Storage-Bucket walkthroughs
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'walkthroughs',
  'walkthroughs',
  false,                                       -- KEIN Public-Access (R-V5-3 Privacy)
  524288000,                                   -- 500 MB Hard-Cap (Sicherheits-Puffer ueber 30min/300MB)
  ARRAY['video/webm']                          -- DEC-075 nur WebM/VP9 in V5
)
ON CONFLICT (id) DO NOTHING;

RAISE NOTICE 'MIG-031/084: walkthroughs bucket ensured';

-- =============================================
-- 2. Storage-RLS-Policies
-- =============================================

-- INSERT: Pfad-Praefix muss tenant_id des aufnehmenden Users sein
DROP POLICY IF EXISTS walkthroughs_bucket_insert ON storage.objects;
CREATE POLICY walkthroughs_bucket_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'walkthroughs'
    AND (storage.foldername(name))[1] = auth.user_tenant_id()::text
  );

-- SELECT: nur recorded_by_user_id, oder tenant_admin (eigener Tenant), oder strategaize_admin.
-- Pre/Post-Approve identisch — V5 keine breitere Sichtbarkeit, weil PII noch nicht redacted ist.
-- Referenziert public.walkthrough_session aus Migration 083 (Sequencing-Pflicht).
DROP POLICY IF EXISTS walkthroughs_bucket_select ON storage.objects;
CREATE POLICY walkthroughs_bucket_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'walkthroughs'
    AND EXISTS (
      SELECT 1 FROM public.walkthrough_session ws
      WHERE ws.storage_path = name
        AND (
          ws.recorded_by_user_id = auth.uid()
          OR auth.user_role() = 'strategaize_admin'
          OR (
            auth.user_role() = 'tenant_admin'
            AND ws.tenant_id = auth.user_tenant_id()
          )
        )
    )
  );

-- DELETE: nur strategaize_admin (Lifecycle/Cleanup) oder Auto-Delete-Job (service_role via BYPASSRLS).
DROP POLICY IF EXISTS walkthroughs_bucket_delete ON storage.objects;
CREATE POLICY walkthroughs_bucket_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'walkthroughs'
    AND auth.user_role() = 'strategaize_admin'
  );

RAISE NOTICE 'MIG-031/084: walkthroughs 3 storage policies created';

END $mig031_part3$;
