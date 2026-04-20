-- Migration 044: Supabase Storage Bucket 'evidence' + RLS Policies
-- SLC-018 MT-2 — Evidence-Mode Storage (FEAT-013)

BEGIN;

-- =============================================
-- 1. Create bucket (not public, 20MB limit, restricted MIME types)
-- =============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence',
  'evidence',
  false,
  20971520,  -- 20 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'application/zip'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- 2. Storage Policies — tenant-isolated upload + read
-- =============================================

-- INSERT: authenticated users can upload to their own tenant path
-- Path pattern: {tenant_id}/{session_id}/{filename}
CREATE POLICY evidence_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = auth.user_tenant_id()::text
  );

-- SELECT: authenticated users can read files from their own tenant path
CREATE POLICY evidence_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (
      (storage.foldername(name))[1] = auth.user_tenant_id()::text
      OR auth.user_role() = 'strategaize_admin'
    )
  );

-- DELETE: only strategaize_admin can delete evidence files
CREATE POLICY evidence_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'evidence'
    AND auth.user_role() = 'strategaize_admin'
  );

COMMIT;
