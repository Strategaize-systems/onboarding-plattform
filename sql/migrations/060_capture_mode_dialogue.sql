-- Migration 060: ADD capture_mode to capture_session + ALTER knowledge_unit source CHECK
-- SLC-028 MT-2 — Dialogue als gleichwertiger Capture-Mode (FEAT-019)
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)

BEGIN;

-- =============================================
-- 1. capture_session: ADD capture_mode column
-- =============================================
-- capture_mode war bisher implizit (nur Fragebogen). V2 fuehrte Evidence ein,
-- V3 fuegt Dialogue hinzu. Nullable fuer bestehende Sessions (default: questionnaire).
ALTER TABLE public.capture_session
  ADD COLUMN IF NOT EXISTS capture_mode text
    CHECK (capture_mode IS NULL OR capture_mode IN ('questionnaire', 'evidence', 'dialogue'));

-- Bestehende Sessions auf 'questionnaire' setzen (optional, nullable bleibt erlaubt)
-- UPDATE public.capture_session SET capture_mode = 'questionnaire' WHERE capture_mode IS NULL;

-- =============================================
-- 2. knowledge_unit: Erweitere source CHECK um 'evidence' + 'dialogue'
-- =============================================
-- Bestehende Constraint: CHECK (source IN ('questionnaire', 'exception', 'ai_draft', 'meeting_final', 'manual'))
-- Neue Werte: 'evidence' (V2 Evidence-Mode), 'dialogue' (V3 Dialogue-Mode)
ALTER TABLE public.knowledge_unit
  DROP CONSTRAINT IF EXISTS knowledge_unit_source_check;

ALTER TABLE public.knowledge_unit
  ADD CONSTRAINT knowledge_unit_source_check
    CHECK (source IN ('questionnaire', 'exception', 'ai_draft', 'meeting_final', 'manual', 'evidence', 'dialogue'));

COMMIT;
