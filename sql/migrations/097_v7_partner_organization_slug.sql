-- Migration 097: V7 partner_organization.slug + Backfill + UNIQUE-Index
-- SLC-131 MT-1 (FEAT-052, MIG-041) — DEC-129..138, RPT-298, ARCHITECTURE.md V7-Sektion
--
-- ZIEL
-- ====
-- 1) partner_organization.slug text-Spalte (zunaechst nullable fuer Backfill).
-- 2) DO-Block Backfill ueber alle Bestand-Rows mit slug IS NULL: lower +
--    translate(Umlaute/Sonderzeichen) + regexp_replace(non-alphanum) +
--    WHILE-Loop fuer Suffix-Kollisions-Resolver (-2, -3, ...).
-- 3) ALTER COLUMN slug SET NOT NULL nach Backfill.
-- 4) UNIQUE-Index auf lower(slug) — Case-insensitive Eindeutigkeit fuer
--    Public-Resolve-Endpoint (SLC-131 MT-6) und Slug-Generator (MT-3).
--
-- Hinweis Backfill-Translit-Tabelle:
-- Die SQL-Translit ist absichtlich naiv (ASCII-best-effort). Der TypeScript-
-- Slug-Generator in src/lib/partner/slug.ts (MT-3) macht echte deutsche
-- Umlaut-Behandlung (ae/oe/ue/ss). Backfill = Best-Effort fuer V6-Bestand;
-- Strategaize-Admin kann manuell korrigieren falls noetig. Source-Mapping
-- analog ARCHITECTURE.md Line 6126-6128.
--
-- IDEMPOTENZ
-- ==========
-- ADD COLUMN IF NOT EXISTS + WHERE slug IS NULL (DO-Loop iteriert nur ueber
-- noch-nicht-befuellte Rows) + ALTER COLUMN SET NOT NULL (idempotent fuer
-- bereits NOT NULL) + CREATE UNIQUE INDEX IF NOT EXISTS.
-- Zweiter Apply ist ein No-Op.
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/097_v7_partner_organization_slug.sql
--   echo '<BASE64>' | base64 -d > /tmp/097_v7.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/097_v7.sql
--
-- PRE-APPLY-CHECK (R-1 aus Slice)
-- ===============================
--   docker exec <db-container> psql -U postgres -d postgres -c \
--     "SELECT id, display_name FROM public.partner_organization
--      WHERE display_name IS NULL OR length(trim(display_name)) = 0"
--   → Muss leer sein, sonst Manual-Fix bevor Migration laufen kann (sonst
--     wirft SET NOT NULL fail nach erfolglosem Backfill).
--
-- PRE-APPLY-BACKUP-PFLICHT
-- ========================
--   docker exec <db-container> pg_dump -U postgres -d postgres \
--     --table=public.partner_organization \
--     > /opt/onboarding-plattform-backups/pre-mig-041-097_$(date +%Y%m%d_%H%M%S).sql
--
-- VERIFIKATION (nach Apply)
-- =========================
--   \d partner_organization
--     → Zeigt `slug text NOT NULL` + Index `partner_organization_slug_lower_unique`.
--   SELECT COUNT(*) FROM partner_organization WHERE slug IS NULL;
--     → 0
--   SELECT id, display_name, slug FROM partner_organization;
--     → Alle Rows haben sinnvollen Slug.

BEGIN;

-- 1. Spalte hinzufuegen (nullable initial fuer Backfill)
ALTER TABLE public.partner_organization
  ADD COLUMN IF NOT EXISTS slug text;

-- 2. Backfill via DO-Block (idempotent durch WHERE slug IS NULL)
DO $$
DECLARE
  r record;
  base_slug text;
  candidate text;
  suffix int;
BEGIN
  FOR r IN
    SELECT id, display_name FROM public.partner_organization
    WHERE slug IS NULL
    ORDER BY created_at ASC  -- aelteste zuerst gewinnen ohne Suffix
  LOOP
    -- Naive ASCII-Transliteration via translate + lower + regex.
    -- Echte Umlaut-Behandlung (ae/oe/ue/ss) macht TS-Generator (MT-3).
    -- Source/Target: ARCHITECTURE.md V7-Sektion Line 6126-6128.
    base_slug := lower(translate(r.display_name,
      'äöüÄÖÜßéèêàâîïôûñç ',
      'aouAOUseeeaaiiouna-'));
    base_slug := regexp_replace(base_slug, '[^a-z0-9-]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '-+', '-', 'g');
    base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
    base_slug := left(base_slug, 60);

    -- Edge-Case: display_name produziert leer-Slug (z.B. nur Sonderzeichen).
    -- Fallback auf 'partner-<short-id>' damit NOT NULL nicht fehlschlaegt.
    IF base_slug = '' THEN
      base_slug := 'partner-' || substring(r.id::text, 1, 8);
    END IF;

    candidate := base_slug;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM public.partner_organization WHERE slug = candidate) LOOP
      candidate := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;

    UPDATE public.partner_organization SET slug = candidate WHERE id = r.id;
  END LOOP;
END$$;

-- 3. NOT NULL nach Backfill (idempotent — kein Fehler wenn schon NOT NULL)
ALTER TABLE public.partner_organization ALTER COLUMN slug SET NOT NULL;

-- 4. UNIQUE-Index auf lower(slug) — Case-insensitive Eindeutigkeit
CREATE UNIQUE INDEX IF NOT EXISTS partner_organization_slug_lower_unique
  ON public.partner_organization (lower(slug));

COMMIT;
