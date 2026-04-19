-- Migration 045: Template V2 fields — sop_prompt + owner_fields
-- SLC-016 MT-2

DO $$ BEGIN

-- Add sop_prompt column (template-specific SOP generation prompt)
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'template' AND column_name = 'sop_prompt'
) THEN
  ALTER TABLE template ADD COLUMN sop_prompt jsonb DEFAULT NULL;
  RAISE NOTICE 'template.sop_prompt added';
ELSE
  RAISE NOTICE 'template.sop_prompt already exists — skipping';
END IF;

-- Add owner_fields column (template-specific owner data collection fields)
IF NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'template' AND column_name = 'owner_fields'
) THEN
  ALTER TABLE template ADD COLUMN owner_fields jsonb DEFAULT NULL;
  RAISE NOTICE 'template.owner_fields added';
ELSE
  RAISE NOTICE 'template.owner_fields already exists — skipping';
END IF;

END $$;
