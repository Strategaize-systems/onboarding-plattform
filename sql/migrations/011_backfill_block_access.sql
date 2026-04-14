-- Migration 011: Backfill member_block_access für bestehende tenant_member
-- Datum: 2026-03-31
-- Problem: ISSUE-029 — Block-Zugriffskontrolle funktioniert nicht
-- Ursache: handle_new_user() erstellt Einträge nur für Runs die zum Invite-Zeitpunkt existieren.
--          Wenn der Run erst nach dem Invite erstellt wird, fehlen die Einträge.

-- Dieses Skript erstellt member_block_access Einträge basierend auf den
-- allowed_blocks aus der User-Metadata für alle bestehenden Runs.

-- Schritt 1: Prüfe welche tenant_member keine block_access Einträge haben
-- (Diagnostik — nicht ändernd)
SELECT
  p.id AS profile_id,
  p.email,
  p.role,
  p.tenant_id,
  r.id AS run_id,
  r.title AS run_title,
  au.raw_user_meta_data->>'allowed_blocks' AS metadata_blocks,
  (SELECT COUNT(*) FROM member_block_access mba
   WHERE mba.profile_id = p.id AND mba.run_id = r.id) AS existing_entries
FROM profiles p
JOIN runs r ON r.tenant_id = p.tenant_id
LEFT JOIN auth.users au ON au.id = p.id
WHERE p.role = 'tenant_member'
ORDER BY p.tenant_id, p.email, r.title;

-- Schritt 2: Erstelle fehlende Einträge basierend auf Metadata
-- ACHTUNG: Vor Ausführung Schritt 1 prüfen!
-- Nur ausführen wenn Schritt 1 zeigt, dass Einträge fehlen.

-- INSERT INTO member_block_access (profile_id, run_id, block)
-- SELECT p.id, r.id, block_text.value
-- FROM profiles p
-- JOIN runs r ON r.tenant_id = p.tenant_id
-- JOIN auth.users au ON au.id = p.id
-- CROSS JOIN LATERAL jsonb_array_elements_text(au.raw_user_meta_data->'allowed_blocks') AS block_text(value)
-- WHERE p.role = 'tenant_member'
--   AND au.raw_user_meta_data ? 'allowed_blocks'
--   AND NOT EXISTS (
--     SELECT 1 FROM member_block_access mba
--     WHERE mba.profile_id = p.id AND mba.run_id = r.id AND mba.block = block_text.value
--   )
-- ON CONFLICT (profile_id, run_id, block) DO NOTHING;
