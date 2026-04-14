-- ═══════════════════════════════════════════════════════════════════════
-- V1.1 Consolidated Migration — Run BEFORE Redeploy
-- ═══════════════════════════════════════════════════════════════════════
-- Enthält: MIG-007, MIG-008, MIG-009
-- Idempotent: Kann sicher mehrfach ausgeführt werden.
-- Ausführen: Supabase SQL Editor auf Hetzner (als postgres/superuser)
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── MIG-007: question_events CHECK Constraint erweitert ────────────
-- Erlaubt 'document_analysis' als event_type (SLC-020)
-- Idempotent: DROP IF EXISTS + neu anlegen

ALTER TABLE question_events
DROP CONSTRAINT IF EXISTS question_events_event_type_check;

ALTER TABLE question_events
ADD CONSTRAINT question_events_event_type_check
CHECK (event_type IN ('answer_submitted', 'note_added', 'evidence_attached', 'status_changed', 'document_analysis'));

-- ─── MIG-008: tenants.language Spalte ───────────────────────────────
-- Sprachauswahl pro Tenant für i18n (SLC-024)
-- Idempotent: ADD COLUMN IF NOT EXISTS

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
      AND column_name = 'language'
  ) THEN
    ALTER TABLE tenants
    ADD COLUMN language text NOT NULL DEFAULT 'de'
    CHECK (language IN ('de', 'en', 'nl'));
  END IF;
END $$;

-- ─── MIG-009: question_catalog_snapshots.language Spalte ────────────
-- Katalog-Snapshots pro Sprache (SLC-027)
-- Idempotent: ADD COLUMN IF NOT EXISTS + Constraint-Handling

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'question_catalog_snapshots'
      AND column_name = 'language'
  ) THEN
    ALTER TABLE question_catalog_snapshots
    ADD COLUMN language text NOT NULL DEFAULT 'de'
    CHECK (language IN ('de', 'en', 'nl'));
  END IF;
END $$;

-- Drop old version-only unique constraint (if exists)
ALTER TABLE question_catalog_snapshots
DROP CONSTRAINT IF EXISTS question_catalog_snapshots_version_key;

-- Add composite unique constraint (version + language)
-- Idempotent: DROP IF EXISTS first
ALTER TABLE question_catalog_snapshots
DROP CONSTRAINT IF EXISTS question_catalog_snapshots_version_language_key;

ALTER TABLE question_catalog_snapshots
ADD CONSTRAINT question_catalog_snapshots_version_language_key
UNIQUE (version, language);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- Verification (run after migration):
-- ═══════════════════════════════════════════════════════════════════════
-- \d tenants               → language column visible
-- \d question_catalog_snapshots  → language column + version_language_key visible
-- \d question_events       → event_type_check includes 'document_analysis'
