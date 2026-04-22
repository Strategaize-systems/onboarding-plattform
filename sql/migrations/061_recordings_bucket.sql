-- Migration 061: Supabase Storage Bucket 'recordings' + Policies
-- SLC-028 MT-2 — Recording-Storage via Supabase Storage (DEC-028)
-- Pattern: analog 044_evidence_storage_bucket.sql

BEGIN;

-- =============================================
-- 1. Create bucket (not public, 500 MB limit, video/audio MIME types)
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recordings',
  'recordings',
  false,
  524288000,  -- 500 MB (1h Meeting in MP4 = ~100-200 MB bei Jibri)
  ARRAY[
    'video/mp4',
    'video/webm',
    'audio/wav',
    'audio/webm',
    'audio/mpeg'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 2. Storage Policies — tenant-isolated access
-- Path pattern: {tenant_id}/{dialogue_session_id}/recording.mp4
-- =============================================

-- INSERT: service_role + strategaize_admin can upload recordings
-- (Finalize-Script uploads via service_role, not end-user)
CREATE POLICY recordings_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recordings'
    AND (
      (storage.foldername(name))[1] = auth.user_tenant_id()::text
      OR auth.user_role() = 'strategaize_admin'
    )
  );

-- SELECT: tenant members can read own tenant recordings
CREATE POLICY recordings_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recordings'
    AND (
      (storage.foldername(name))[1] = auth.user_tenant_id()::text
      OR auth.user_role() = 'strategaize_admin'
    )
  );

-- DELETE: only strategaize_admin can delete recordings
CREATE POLICY recordings_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'recordings'
    AND auth.user_role() = 'strategaize_admin'
  );

COMMIT;
