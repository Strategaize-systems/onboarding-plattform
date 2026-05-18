-- Migration 097a: V7 partner_organization.slug DEFAULT-Wert fuer Legacy-Inserts
-- SLC-131 MT-7 Auto-Fix (Deviation Rule 1 — auto-fix bugs)
--
-- ZIEL
-- ====
-- Migration 097 hat `slug NOT NULL` ohne DEFAULT gesetzt. Production-Code
-- (`createPartnerOrganization` in src/app/admin/partners/actions.ts) setzt
-- slug explizit per `generateUniqueSlug`. Aber bestehende V6-DB-Tests
-- (z.B. seedMandantenFixture in mandanten-actions-db.test.ts) inserten raw
-- per pg.Client ohne slug-Wert und schlagen jetzt mit
-- `null value in column "slug" of relation "partner_organization"`
-- fehl (135 Test-Regressions).
--
-- Fix: ALTER COLUMN slug SET DEFAULT mit gen_random_uuid()-basiertem Pattern.
-- DEFAULT wird im Production-Pfad NIE getriggert (actions.ts setzt slug
-- immer explizit). Im Test-Pfad bekommt jeder Insert automatisch einen
-- unique slug, der den UNIQUE-Constraint nicht verletzt.
--
-- Trade-off: ad-hoc-Inserts via SQL-Konsole ohne explicit slug bekommen
-- den DEFAULT-Wert ('p-' + 32 Hex). Lesbar, kollisionssicher, aber kein
-- sinnvoller Marketing-Slug. Akzeptabel weil Production-Anlage stets
-- ueber actions.ts laeuft.
--
-- IDEMPOTENZ
-- ==========
-- ALTER COLUMN ... SET DEFAULT ist idempotent (kein Fehler bei mehrfacher
-- Anwendung).
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/097a_v7_partner_organization_slug_default.sql
--   echo '<BASE64>' | base64 -d > /tmp/097a_v7.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/097a_v7.sql
--
-- VERIFIKATION
-- ============
--   \d partner_organization
--     → Default-Spalte zeigt `('p-'::text || replace(...))` Expression.

BEGIN;

ALTER TABLE public.partner_organization
  ALTER COLUMN slug SET DEFAULT ('p-' || replace(gen_random_uuid()::text, '-', ''));

COMMIT;
