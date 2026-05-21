-- Migration 099: V7.1 SLC-138 helper_text + examples_md Schema-Validation
-- SLC-138 MT-2 (FEAT-057, MIG-045) — DEC-073, DEC-142, RPT-XXX
--
-- ZIEL
-- ====
-- Validation-Function + Trigger fuer das additive Schema
--   template.blocks[].questions[].helper_text  (string, max 300 chars)
--   template.blocks[].questions[].examples_md  (string, max 800 chars Markdown)
--
-- KEINE ALTER TABLE noetig — JSONB-additiv. Nur Validation-Function +
-- Enforcement-Trigger BEFORE INSERT OR UPDATE OF blocks.
--
-- KANONISCHE SCHEMA-DEFINITION
-- ============================
-- DEC-073 (Cross-Repo OP V7.1 spiegelt DEC-070 char-limited Subset).
-- Bewusste Drift gegen IS V3 (word-counted helper_text + array examples_md)
-- ist dokumentiert im Memory project_op_v71_cross_repo_helper_text_sync.md
-- und wird in OP V7.2+ aufgeloest.
--
-- IDEMPOTENZ
-- ==========
-- CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- Zweiter Apply ist No-Op.
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   # Lokal:
--   base64 -w 0 sql/migrations/099_v71_helper_text_validation.sql
--   # Auf Server (root@159.69.207.29):
--   echo '<BASE64>' | base64 -d > /tmp/099_v71.sql
--   wc -l /tmp/099_v71.sql
--   DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep ^supabase-db)
--   docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < /tmp/099_v71.sql
--   docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres \
--     -c "NOTIFY pgrst, 'reload schema'"
--
-- VERIFIKATION (nach Apply)
-- =========================
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('validate_helper_text_schema', 'enforce_helper_text_schema_trigger');
--   -- erwartet: 2 Rows
--
--   SELECT tgname FROM pg_trigger
--     WHERE tgrelid='public.template'::regclass
--       AND tgname='template_helper_text_schema_check';
--   -- erwartet: 1 Row
--
--   -- Bestaegende Templates muessen weiter durch (helper_text/examples_md NULL):
--   SELECT slug, public.validate_helper_text_schema(blocks) AS violation
--     FROM public.template;
--   -- erwartet: alle violation=NULL
--
--   -- Funktionaler Smoke (rollback im Anschluss):
--   BEGIN;
--   INSERT INTO public.template (slug, version, name, blocks)
--     VALUES ('smoke_mig045_too_long', 'v1', 'smoke',
--       jsonb_build_array(jsonb_build_object(
--         'key', 'b1', 'questions', jsonb_build_array(jsonb_build_object(
--           'key', 'q1', 'label', 'Test',
--           'helper_text', repeat('X', 301)
--         ))
--       )));
--   -- erwartet: ERROR helper_text/examples_md schema violation
--   ROLLBACK;

DO $mig045_step1$ BEGIN

-- ============================================================
-- 1. validate_helper_text_schema(blocks) — Pure Validation
-- ============================================================
-- Inspect-Funktion. Iteriert blocks[].questions[] und prueft Laengen-Limits
-- fuer helper_text + examples_md. Bei Violation: returns JSONB error detail.
-- Bei OK: returns NULL.
--
-- IMMUTABLE + PARALLEL SAFE damit Postgres es spaeter auch in CHECK-Constraint
-- nutzen koennte (V7.2+ falls Strict-Mode gewuenscht).

CREATE OR REPLACE FUNCTION public.validate_helper_text_schema(blocks_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  block_idx int := 0;
  block jsonb;
  q_idx int;
  q jsonb;
  ht text;
  ex text;
BEGIN
  IF blocks_input IS NULL OR jsonb_typeof(blocks_input) != 'array' THEN
    RETURN NULL;
  END IF;

  FOR block IN SELECT * FROM jsonb_array_elements(blocks_input)
  LOOP
    IF block ? 'questions' AND jsonb_typeof(block->'questions') = 'array' THEN
      q_idx := 0;
      FOR q IN SELECT * FROM jsonb_array_elements(block->'questions')
      LOOP
        ht := q->>'helper_text';
        ex := q->>'examples_md';

        IF ht IS NOT NULL AND char_length(ht) > 300 THEN
          RETURN jsonb_build_object(
            'field', 'helper_text',
            'block_index', block_idx,
            'block_key', block->>'key',
            'question_index', q_idx,
            'question_key', q->>'key',
            'length', char_length(ht),
            'limit', 300
          );
        END IF;

        IF ex IS NOT NULL AND char_length(ex) > 800 THEN
          RETURN jsonb_build_object(
            'field', 'examples_md',
            'block_index', block_idx,
            'block_key', block->>'key',
            'question_index', q_idx,
            'question_key', q->>'key',
            'length', char_length(ex),
            'limit', 800
          );
        END IF;

        q_idx := q_idx + 1;
      END LOOP;
    END IF;
    block_idx := block_idx + 1;
  END LOOP;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.validate_helper_text_schema(jsonb) IS
  'V7.1 SLC-138: Validiert blocks[].questions[].helper_text (<= 300 chars) + examples_md (<= 800 chars). Returns JSONB-Violation-Detail oder NULL bei OK. DEC-073, MIG-045.';

RAISE NOTICE 'MIG-045/099: validate_helper_text_schema function ensured';

-- ============================================================
-- 2. Trigger-Function fuer Enforcement
-- ============================================================
-- Ruft validate_helper_text_schema(NEW.blocks) und RAISES bei Violation.
-- Trigger ist BEFORE INSERT OR UPDATE OF blocks — feuert nur bei
-- blocks-Aenderung, nicht bei reinen Metadata-Updates.

CREATE OR REPLACE FUNCTION public.enforce_helper_text_schema_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  violation jsonb;
BEGIN
  violation := public.validate_helper_text_schema(NEW.blocks);
  IF violation IS NOT NULL THEN
    RAISE EXCEPTION 'helper_text/examples_md schema violation: %', violation::text
      USING HINT = 'helper_text max 300 chars, examples_md max 800 chars (DEC-073)';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_helper_text_schema_trigger() IS
  'V7.1 SLC-138: Trigger-Function. Verhindert INSERT/UPDATE wenn helper_text/examples_md Laengen-Limits verletzen. DEC-073, MIG-045.';

RAISE NOTICE 'MIG-045/099: enforce_helper_text_schema_trigger function ensured';

-- ============================================================
-- 3. Trigger auf public.template
-- ============================================================
-- DROP + CREATE statt CREATE TRIGGER IF NOT EXISTS (Postgres kennt kein IF
-- NOT EXISTS auf CREATE TRIGGER). Idempotent durch DROP IF EXISTS.

DROP TRIGGER IF EXISTS template_helper_text_schema_check ON public.template;
CREATE TRIGGER template_helper_text_schema_check
  BEFORE INSERT OR UPDATE OF blocks ON public.template
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_helper_text_schema_trigger();

COMMENT ON TRIGGER template_helper_text_schema_check ON public.template IS
  'V7.1 SLC-138: Enforced helper_text + examples_md Laengen-Limits aus DEC-073. Feuert nur bei blocks-Aenderung.';

RAISE NOTICE 'MIG-045/099: template_helper_text_schema_check trigger ensured';

-- ============================================================
-- 4. Pre-flight: bestehende Templates validieren
-- ============================================================
-- Sanity-Check: alle drei bestehenden Templates (exit_readiness,
-- mitarbeiter_wissenserhebung, partner_diagnostic) duerfen den Trigger
-- nicht versehentlich blocken. Da helper_text/examples_md noch nicht
-- seeded sind, muss validate_helper_text_schema NULL liefern.
--
-- Bei Violation: Migration abbrechen damit Initial-Content-Drift
-- frueh entdeckt wird.

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT slug, version, public.validate_helper_text_schema(blocks) AS violation
      FROM public.template
  LOOP
    IF rec.violation IS NOT NULL THEN
      RAISE EXCEPTION 'Pre-flight failed for template %/%: %',
        rec.slug, rec.version, rec.violation::text;
    END IF;
  END LOOP;

  RAISE NOTICE 'MIG-045/099: pre-flight validation passed for all existing templates';
END;
$$;

END $mig045_step1$;
