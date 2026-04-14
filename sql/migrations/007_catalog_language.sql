-- 007_catalog_language.sql
-- Add language support to catalog snapshots (SLC-027)
-- Allows importing the same catalog version in multiple languages (DE/EN/NL)

-- Step 1: Add language column (defaults to 'de' for existing snapshots)
ALTER TABLE question_catalog_snapshots
ADD COLUMN language text NOT NULL DEFAULT 'de'
CHECK (language IN ('de', 'en', 'nl'));

-- Step 2: Drop the old version-only unique constraint
ALTER TABLE question_catalog_snapshots
DROP CONSTRAINT IF EXISTS question_catalog_snapshots_version_key;

-- Step 3: Add new composite unique constraint on (version, language)
ALTER TABLE question_catalog_snapshots
ADD CONSTRAINT question_catalog_snapshots_version_language_key
UNIQUE (version, language);
