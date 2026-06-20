-- MIG-123 / V9.8 SLC-V9.8-A MT-1 — knowledge_unit.themes (Tag-Export-Propagation)
--
-- Slice: slices/SLC-V9.8-A-tag-export-propagation.md (MT-1)
-- Feature: FEAT-089  Backlog: BL-505
-- DECs: DEC-228 (Theme-Export-Ziel = dedizierte knowledge_unit.themes text[] + GIN
--       statt metadata JSONB — Findbarkeit ist Produktkern, queryable/facetten-faehig)
--
-- Was diese Migration tut:
--   knowledge_unit bekommt erstmals eine dedizierte themes-Spalte, damit die im
--   Bulk-Lauf erarbeiteten themes (email_synthesized_unit.themes, MIG-111) beim
--   Promote ins Handbuch verlustfrei + queryable uebernommen werden koennen.
--     1. ADD COLUMN themes text[] NOT NULL DEFAULT '{}'.
--        NOT NULL + konstanter DEFAULT = Metadata-only-ALTER (PG11+, KEIN
--        Table-Rewrite — Bestands-Rows bekommen '{}' ohne Heap-Rewrite). AC-A-1.
--     2. CREATE INDEX idx_knowledge_unit_themes USING gin (themes) — Containment-
--        Queries (themes @> ARRAY[...] / themes && ARRAY[...]) GIN-gestuetzt. AC-A-4.
--   Additiv, forward-only, KEIN Content-Backfill (Bestands-Rows = '{}', AC-A-1 /
--   Out of Scope: kein retroaktives Re-Tagging). Idempotent (IF NOT EXISTS).
--
-- Stil-Referenz: sql/migrations/119_v95_synthesis_stage.sql.
--
-- Apply-Pattern (per .claude/rules/sql-migration-hetzner.md):
--   base64 -w 0 sql/migrations/123_v98_knowledge_unit_themes.sql               (lokal)
--   echo '<BASE64>' | base64 -d > /tmp/123_v98.sql                            (server)
--   docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) \
--     psql -U postgres -d postgres < /tmp/123_v98.sql
--
-- R-A-1 (Deploy-Ordering, BLOCKING fuer /deploy): Der Promote-Pfad spreadet
--   themes in den knowledge_unit-INSERT → diese Migration MUSS LIVE-applied sein
--   BEVOR der Code-Redeploy live geht, sonst wirft der INSERT
--   `column "themes" does not exist`. Live-Apply ist /deploy, NICHT die Slice.
--
-- Verifikation post-LIVE:
--   \d knowledge_unit                  (themes text[] NOT NULL DEFAULT '{}'::text[])
--   \di idx_knowledge_unit_themes      (gin)
--   SELECT id FROM knowledge_unit WHERE themes @> ARRAY['x'];   (parsed/laeuft)
--   2. Apply = 0 Drift (idempotent).
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.knowledge_unit
  ADD COLUMN IF NOT EXISTS themes text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_knowledge_unit_themes
  ON public.knowledge_unit USING gin (themes);

-- PostgREST-Schema-Cache neu laden: der Promote-Pfad INSERTet knowledge_unit.themes
-- ueber den supabase-js Admin-Client (PostgREST). Ohne Reload kennt der API-Layer
-- die neue Spalte nicht → `column "themes" does not exist` trotz vorhandener Spalte.
NOTIFY pgrst, 'reload schema';

COMMIT;
