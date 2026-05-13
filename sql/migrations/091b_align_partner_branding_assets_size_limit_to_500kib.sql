-- ============================================================
-- Migration 091b — Align partner-branding-assets Storage-Bucket auf exakt 500 KiB
--   ISSUE-047 (SLC-104 MT-12): Storage-Bucket file_size_limit war 524288 Byte (=512 KiB),
--   UI/Spec versprechen "500 KB". Server-Action-Constant MAX_LOGO_BYTES wurde auf
--   500*1024 = 512000 Byte korrigiert. Damit Bucket-Limit konsistent ist, hier
--   selbe Anpassung auf 512000.
--
--   Vorher: 524288 Byte (=512 KiB) — 12 KiB ueber dem dokumentierten Limit.
--   Nachher: 512000 Byte (=500 KiB exakt).
--
-- Rollback-Hinweis: bei Bedarf zurueck auf 524288 via UPDATE storage.buckets ...
-- Risk: nahe Null — Bucket existiert seit Migration 091, war bisher leer oder mit
--   <= 500-KB-Uploads bestueckt (Client-Validation hat 524288-Files faktisch fast
--   nie erlaubt, weil UI 500 KB versprochen hat). Bestehende Logo-Files bleiben
--   unangetastet — Limit gilt nur fuer NEUE Uploads.
-- ============================================================

BEGIN;

UPDATE storage.buckets
   SET file_size_limit = 512000,
       updated_at = NOW()
 WHERE id = 'partner-branding-assets';

DO $$
DECLARE
  v_limit BIGINT;
BEGIN
  SELECT file_size_limit INTO v_limit
    FROM storage.buckets
   WHERE id = 'partner-branding-assets';

  IF v_limit IS DISTINCT FROM 512000 THEN
    RAISE EXCEPTION 'MIG-091b: partner-branding-assets file_size_limit Verify FAIL (got=%, expected=512000)', v_limit;
  END IF;

  RAISE NOTICE 'MIG-091b: partner-branding-assets file_size_limit aligned to 512000 (=500 KiB)';
END $$;

COMMIT;
