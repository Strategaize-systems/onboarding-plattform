-- 040_orchestrator_extensions.sql
-- SLC-013: Orchestrator-Integration — Schema-Erweiterungen
-- (1) quality_report JSONB auf block_checkpoint
-- (2) feature-Spalte auf ai_cost_ledger
-- (3) checkpoint_type CHECK um 'backspelling_recondense' erweitern
-- Idempotent: alle Aenderungen mit IF NOT EXISTS / DO $$ ... $$

BEGIN;

-- (1) quality_report JSONB-Spalte auf block_checkpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'block_checkpoint'
      AND column_name = 'quality_report'
  ) THEN
    ALTER TABLE public.block_checkpoint
      ADD COLUMN quality_report jsonb DEFAULT NULL;
    RAISE NOTICE 'block_checkpoint.quality_report added';
  ELSE
    RAISE NOTICE 'block_checkpoint.quality_report already exists — skipping';
  END IF;
END $$;

-- (2) feature-Spalte auf ai_cost_ledger (Default 'condensation' fuer bestehende Rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ai_cost_ledger'
      AND column_name = 'feature'
  ) THEN
    ALTER TABLE public.ai_cost_ledger
      ADD COLUMN feature text NOT NULL DEFAULT 'condensation';
    RAISE NOTICE 'ai_cost_ledger.feature added';
  ELSE
    RAISE NOTICE 'ai_cost_ledger.feature already exists — skipping';
  END IF;
END $$;

-- (3) checkpoint_type CHECK erweitern um 'backspelling_recondense'
-- DROP + recreate: CHECK-Constraints koennen nicht in-place erweitert werden.
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- Finde den CHECK-Constraint auf checkpoint_type
  SELECT c.conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
  WHERE c.conrelid = 'public.block_checkpoint'::regclass
    AND c.contype = 'c'
    AND a.attname = 'checkpoint_type';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.block_checkpoint DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped checkpoint_type constraint: %', v_constraint_name;
  END IF;

  -- Neuer CHECK mit erweitertem Enum
  ALTER TABLE public.block_checkpoint
    ADD CONSTRAINT block_checkpoint_checkpoint_type_check
    CHECK (checkpoint_type IN ('questionnaire_submit', 'meeting_final', 'backspelling_recondense'));

  RAISE NOTICE 'checkpoint_type CHECK recreated with backspelling_recondense';
END $$;

-- (4) ai_cost_ledger.role CHECK erweitern um 'orchestrator'
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT c.conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
  WHERE c.conrelid = 'public.ai_cost_ledger'::regclass
    AND c.contype = 'c'
    AND a.attname = 'role';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ai_cost_ledger DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped ai_cost_ledger role constraint: %', v_constraint_name;
  END IF;

  ALTER TABLE public.ai_cost_ledger
    ADD CONSTRAINT ai_cost_ledger_role_check
    CHECK (role IN ('analyst', 'challenger', 'chat', 'memory', 'embedding', 'orchestrator'));

  RAISE NOTICE 'ai_cost_ledger role CHECK recreated with orchestrator';
END $$;

COMMIT;
