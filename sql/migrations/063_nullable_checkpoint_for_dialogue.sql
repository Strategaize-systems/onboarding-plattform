-- Migration 063: Make block_checkpoint_id nullable on knowledge_unit
-- SLC-031 prerequisite — Dialogue KUs have no checkpoint (source='dialogue')
-- NOTE: Explicit public. schema prefix required (IMP-103)
--
-- Questionnaire KUs have a block_checkpoint_id (from block submit).
-- Dialogue KUs come from transcript analysis — no checkpoint exists.
-- FK + CASCADE stays: when a checkpoint IS present and deleted, KUs cascade.
-- When block_checkpoint_id IS NULL (dialogue), cascade is irrelevant.

BEGIN;

ALTER TABLE public.knowledge_unit
  ALTER COLUMN block_checkpoint_id DROP NOT NULL;

COMMIT;
