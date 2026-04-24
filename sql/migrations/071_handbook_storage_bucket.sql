-- Migration 071: Supabase Storage Bucket 'handbook' + 3 Policies
-- SLC-033 MT-7 — V4 Schema-Fundament (FEAT-026, DEC-038)
-- Pattern: analog 061_recordings_bucket.sql und 044_evidence_storage_bucket.sql
-- Pfad-Pattern: {tenant_id}/{snapshot_id}.zip

BEGIN;

-- =============================================
-- 1. Create bucket (not public, 50 MB limit, ZIP only)
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'handbook',
  'handbook',
  false,
  52428800,  -- 50 MB
  ARRAY['application/zip']
)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 2. Storage Policies — tenant-isolated access
-- =============================================

-- INSERT: nur service_role schreibt (Worker-Job handbook_snapshot_generation)
-- Keine direkte User-Upload-Option.
DROP POLICY IF EXISTS handbook_insert_service_role_only ON storage.objects;
CREATE POLICY handbook_insert_service_role_only ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'handbook'
    AND auth.user_role() = 'strategaize_admin'
  );

-- SELECT: tenant_admin des eigenen Tenants + strategaize_admin (Cross-Tenant)
-- Pfad-Pattern: {tenant_id}/... -> storage.foldername(name)[1] = tenant_id
DROP POLICY IF EXISTS handbook_select_tenant_admin_or_strategaize ON storage.objects;
CREATE POLICY handbook_select_tenant_admin_or_strategaize ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'handbook'
    AND (
      auth.user_role() = 'strategaize_admin'
      OR (
        auth.user_role() = 'tenant_admin'
        AND (storage.foldername(name))[1] = auth.user_tenant_id()::text
      )
    )
  );

-- DELETE: nur strategaize_admin
DROP POLICY IF EXISTS handbook_delete_strategaize_only ON storage.objects;
CREATE POLICY handbook_delete_strategaize_only ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'handbook'
    AND auth.user_role() = 'strategaize_admin'
  );

COMMIT;
