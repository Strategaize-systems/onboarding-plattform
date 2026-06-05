-- =====================================================
-- MIG-109 — V8.0.2 OP Storage-Schema GRANTs Hotfix (Cross-Repo-Mirror BS MIG-043)
-- =====================================================
-- Slice: SLC-169 (V8.0.2 OP Storage-GRANTs-Hotfix-Mirror)
-- Cross-Repo-Quelle: BS MIG-043 V8.13 SLC-894 (RPT-574 2026-06-03)
-- Audit-Quelle: Pre-Check via SSH OP 159.69.207.29 2026-06-03 + Cross-Repo-Doc
--   `c:/strategaize/strategaize-business-system/docs/CROSS_REPO_V813_STORAGE_GRANTS.md`
--
-- Problem heute (OP Pre-Apply-Audit 2026-06-03):
--   Rolle `authenticated` und `anon` haben NUR `SELECT` auf 2 Tables
--   im storage-Schema (`s3_multipart_uploads` + `s3_multipart_uploads_parts`).
--   0 GRANTs auf den kritischen Tables `buckets`, `migrations`, `objects`.
--   Damit scheitert jeder Storage-INSERT/SELECT/UPDATE/DELETE via Supabase-JS
--   mit:
--
--     {"code":"42501","file":"aclchk.c","line":"3650",
--      "routine":"aclcheck_error",
--      "message":"new row violates row-level security policy"}
--
--   `aclchk.c:3650` ist die PostgreSQL Access-Control-Layer (GRANT-Check).
--   Storage v1.11.13 castet ALLE 42501-Errors zu Misleading-Message
--   "row-level security policy" → diagnostische Verwirrung als RLS-Bug.
--   Echte Wurzel: fehlende table-level GRANTs.
--
-- Cross-Repo-Versions-Matrix (RPT-573 + Pre-Check 2026-06-03):
--   BS (heute)  : GoTrue v2.160.0 + Storage v1.11.13 → fixed via MIG-043
--   OP (heute)  : GoTrue v2.160.0 + Storage v1.11.13 → fix via DIESE Migration
--   IS          : GoTrue v2.186.0 + Storage v1.44.2  → Default-GRANTs ok
--   ImSch       : GoTrue v2.186.0 + Storage v1.44.2  → Default-GRANTs ok
--
-- OP ist sogar schlimmer betroffen als BS:
--   BS hatte vor MIG-043: authenticated+anon SELECT auf alle 5 Tables
--   OP hat aktuell: authenticated+anon NUR SELECT auf 2 s3_-Tables
--
-- Fix (1:1 Pattern aus BS MIG-043):
--   1. GRANT SELECT, INSERT, UPDATE, DELETE auf alle bestehenden Tables
--      im storage-Schema fuer `authenticated` + `anon`.
--   2. GRANT USAGE, SELECT auf alle Sequences (defensive No-Op fuer
--      Future-Proofness bei Storage-Container-Upgrades v1.44+).
--   3. ALTER DEFAULT PRIVILEGES fuer postgres + supabase_storage_admin
--      damit kuenftige Tables/Sequences automatisch GRANTs bekommen.
--   4. NOTIFY pgrst, 'reload schema' damit PostgREST den GRANT-Cache flusht.
--
-- Was die Migration NICHT macht:
--   - KEIN REVOKE (additiv only).
--   - KEINE Aenderung an service_role-GRANTs.
--   - KEINE Aenderung an Schema-USAGE (bereits gesetzt).
--   - KEINE Aenderung an den 18 bestehenden RLS-Policies (`bulk_email_bucket_*`,
--     `evidence_*`, `handbook_*`, `partner_branding_assets_*`, `recordings_*`,
--     `walkthroughs_bucket_*`). Die bleiben aktiv und greifen weiterhin.
--
-- ISSUE-089-Pendant (auth.users.aud Normalisierung):
--   Pre-Check 2026-06-03 zeigt OP `auth.users.aud` Verteilung:
--     5 Rows mit `<empty>`, 0 Rows mit `'authenticated'`
--   → KEIN MIG-044-Mirror noetig. Fresh-Signup-Default in v2.160 ist `aud=''`,
--   OP hat keine SQL-Direct-Seeded-User mit `aud='authenticated'`.
--
-- Idempotent: GRANT-Statements sind in PostgreSQL nativ idempotent (No-Op
-- bei bereits gewaehrten Privileges). ALTER DEFAULT PRIVILEGES ueberschreibt
-- bestehende Eintraege fuer die gleiche (role_for, schema, obj_type)-Tupel.
--
-- Anwenden via SSH+base64+psql analog .claude/rules/sql-migration-hetzner.md
-- (als `postgres` Superuser im Container).

-- =====================================================
-- 1. Table-level GRANTs (idempotent additive)
-- =====================================================
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA storage
  TO authenticated, anon;

-- =====================================================
-- 2. Sequence-level GRANTs (idempotent, defensive)
-- =====================================================
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA storage
  TO authenticated, anon;

-- =====================================================
-- 3. ALTER DEFAULT PRIVILEGES (Future-Proofness fuer Container-Upgrades)
-- =====================================================
-- Default-Privileges greifen nur fuer Objekte, die von der ausfuehrenden
-- Rolle (hier: `postgres`) erstellt werden. Bei Storage-Container-Upgrades
-- legt das Storage-Init-Script die neuen Tables/Sequences typischerweise
-- als `supabase_storage_admin` an — fuer dessen-Erstellungen muessen wir
-- separate Default-Privileges definieren.
ALTER DEFAULT PRIVILEGES IN SCHEMA storage
  GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLES
  TO authenticated, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA storage
  GRANT USAGE, SELECT
  ON SEQUENCES
  TO authenticated, anon;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage
  GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLES
  TO authenticated, anon;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_storage_admin IN SCHEMA storage
  GRANT USAGE, SELECT
  ON SEQUENCES
  TO authenticated, anon;

-- =====================================================
-- 4. PostgREST Schema-Cache-Flush
-- =====================================================
NOTIFY pgrst, 'reload schema';

-- =====================================================
-- Verifikations-Queries (manuell, nach Apply)
-- =====================================================
-- SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE table_schema='storage'
--    AND grantee IN ('authenticated','anon')
--    AND privilege_type IN ('INSERT','UPDATE','DELETE')
--  ORDER BY table_name, grantee, privilege_type;
--   -- Erwartet: 30 Rows (5 Tables * 2 Roles * 3 Privileges).
--
-- SELECT tablename, policyname FROM pg_policies
--  WHERE schemaname='storage'
--  ORDER BY tablename, policyname;
--   -- Erwartet: 18 Rows (alle bestehenden RLS-Policies unangetastet):
--   --   bulk_email_bucket_{delete,insert,select} (V9-Vorbereitung)
--   --   evidence_{delete,insert,select} (V2)
--   --   handbook_{delete_strategaize_only,insert_service_role_only,select_tenant_admin_or_strategaize} (V4.1)
--   --   partner_branding_assets_{delete,insert,update} (V6.1)
--   --   recordings_{delete,insert,select} (V4)
--   --   walkthroughs_bucket_{delete,insert,select} (V5)
