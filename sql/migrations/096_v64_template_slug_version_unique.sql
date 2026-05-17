-- Migration 096: V6.4 Echte Template-Versionierung (UNIQUE(slug, version) statt UNIQUE(slug))
-- SLC-130 MT-1 (FEAT-045-V6.4-Polish, MIG-040) — BL-105, RPT-288
--
-- ZIEL
-- ====
-- public.template Constraint von UNIQUE(slug) auf UNIQUE(slug, version) umstellen,
-- damit mehrere Versions desselben Slugs koexistieren koennen. Dadurch behalten
-- alte capture_session.template_id-Verweise ihre originalen Block-Titel + Intros,
-- auch wenn eine neue partner_diagnostic-Template-Version per Migration nachkommt.
--
-- Aenderung:
--   1) DROP CONSTRAINT IF EXISTS template_slug_key (aus MIG-021 historisch UNIQUE(slug))
--   2) CREATE UNIQUE INDEX IF NOT EXISTS template_slug_version_unique ON public.template(slug, version)
--
-- IDEMPOTENZ
-- ==========
-- DROP CONSTRAINT IF EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
-- Zweiter Apply ist ein No-Op (DROP findet Constraint nicht mehr, CREATE findet Index schon).
--
-- KEINE DATENMIGRATION NOETIG
-- ============================
-- Bestehende 3 Template-Rows haben heute eindeutige slug-Werte:
--   - exit_readiness (v1)
--   - mitarbeiter_wissenserhebung (v1)
--   - partner_diagnostic (v1)
-- Damit ist (slug, version) bereits eindeutig — neuer Index laeuft ohne Konflikt.
-- Pre-Apply-Check: SELECT slug, version, COUNT(*) FROM template GROUP BY slug, version
--                  HAVING COUNT(*) > 1; -- erwartet: 0 Rows
--
-- AUSWIRKUNGEN AUF CODE
-- =====================
-- 1) src/app/dashboard/diagnose/start/page.tsx Z.79-85 + src/app/dashboard/diagnose/actions.ts
--    Z.27-28 + Z.117-126: muessen in MT-2 umgestellt werden auf
--      WHERE slug='partner_diagnostic' ORDER BY created_at DESC LIMIT 1
--    statt
--      WHERE slug='partner_diagnostic' AND version='v1'
-- 2) Migrations ab 097+ nutzen ON CONFLICT (slug, version) DO UPDATE statt
--    ON CONFLICT (slug) DO UPDATE (siehe docs/DIAGNOSE_TEMPLATE_EDITING.md).
-- 3) bericht/page.tsx UNVERAENDERT — laedt via session.template_id direkt.
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   # Lokal:
--   base64 -w 0 sql/migrations/096_v64_template_slug_version_unique.sql
--   # Auf Server (root@159.69.207.29):
--   echo '<BASE64>' | base64 -d > /tmp/096_v64.sql
--   wc -l /tmp/096_v64.sql                       # Verifikation Zeilenzahl
--   DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep ^supabase-db)
--   docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < /tmp/096_v64.sql
--
-- PRE-APPLY-BACKUP-PFLICHT
-- ========================
--   mkdir -p /opt/onboarding-plattform-backups
--   DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep ^supabase-db)
--   docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres \
--     --schema-only --table=public.template \
--     > /opt/onboarding-plattform-backups/pre-mig-040-096_$(date +%Y%m%d_%H%M%S).sql
--
-- VERIFIKATION (nach Apply)
-- =========================
--   SELECT conname FROM pg_constraint
--     WHERE conrelid='public.template'::regclass AND contype='u';
--   -- erwartet: KEIN 'template_slug_key' mehr (UNIQUE-Constraint weg)
--
--   SELECT indexname FROM pg_indexes
--     WHERE schemaname='public' AND tablename='template'
--       AND indexname='template_slug_version_unique';
--   -- erwartet: 1 Row
--
--   -- Funktionaler Smoke (rollback im Anschluss):
--   BEGIN;
--   INSERT INTO template (slug, version, name, blocks)
--     VALUES ('smoke_mig096', 'v1', 'smoke', '[]'::jsonb);
--   INSERT INTO template (slug, version, name, blocks)
--     VALUES ('smoke_mig096', 'v2', 'smoke', '[]'::jsonb);
--   -- beide INSERTs muessen klappen (neuer (slug, version)-Constraint erlaubt).
--   ROLLBACK;

DO $mig040_step1$ BEGIN

-- ============================================================
-- 1. Alten UNIQUE(slug)-Constraint loesen
-- ============================================================
-- Default-Name aus MIG-021: 'template_slug_key' (Postgres-Auto-Naming
-- fuer UNIQUE-Constraints: <table>_<column>_key). IF EXISTS macht das
-- Statement idempotent.
ALTER TABLE public.template
  DROP CONSTRAINT IF EXISTS template_slug_key;

RAISE NOTICE 'MIG-040/096: template_slug_key constraint dropped (or already absent)';

-- ============================================================
-- 2. Neuen UNIQUE(slug, version)-Index anlegen
-- ============================================================
-- CREATE UNIQUE INDEX statt ADD CONSTRAINT, damit IF NOT EXISTS
-- moeglich ist (UNIQUE-Constraint via ALTER TABLE kennt kein
-- IF NOT EXISTS). Funktional aequivalent — UNIQUE-Index enforced
-- die UNIQUE-Garantie genauso wie ein UNIQUE-Constraint.
CREATE UNIQUE INDEX IF NOT EXISTS template_slug_version_unique
  ON public.template(slug, version);

COMMENT ON INDEX public.template_slug_version_unique IS
  'V6.4+ Erlaubt mehrere Versions desselben Slugs (z.B. partner_diagnostic v1 + v2). Ersetzt UNIQUE(slug)-Constraint aus MIG-021. Siehe SLC-130, BL-105.';

RAISE NOTICE 'MIG-040/096: template_slug_version_unique index ensured';

END $mig040_step1$;
