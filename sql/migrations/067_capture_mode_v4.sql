-- Migration 067: capture_session.capture_mode + knowledge_unit.source CHECKs additiv erweitert
-- SLC-033 MT-3 — V4 Schema-Fundament (FEAT-022, FEAT-025, DEC-040)
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)
--
-- Bestehende Constraints (nach Migration 060):
--   capture_session.capture_mode CHECK: NULL oder IN ('questionnaire','evidence','dialogue')
--   knowledge_unit.source CHECK:        IN ('questionnaire','exception','ai_draft','meeting_final',
--                                            'manual','evidence','dialogue')
--
-- V4 Additive Erweiterung:
--   capture_mode: + 'employee_questionnaire', + 'walkthrough_stub' (Spike fuer SC-V4-6)
--   source:       + 'employee_questionnaire'

BEGIN;

-- =============================================
-- 1. capture_session.capture_mode CHECK additiv erweitert
-- =============================================
ALTER TABLE public.capture_session
  DROP CONSTRAINT IF EXISTS capture_session_capture_mode_check;

ALTER TABLE public.capture_session
  ADD CONSTRAINT capture_session_capture_mode_check
  CHECK (
    capture_mode IS NULL
    OR capture_mode IN (
      'questionnaire',
      'evidence',
      'dialogue',
      'employee_questionnaire',
      'walkthrough_stub'
    )
  );

-- =============================================
-- 2. knowledge_unit.source CHECK additiv erweitert
-- =============================================
ALTER TABLE public.knowledge_unit
  DROP CONSTRAINT IF EXISTS knowledge_unit_source_check;

ALTER TABLE public.knowledge_unit
  ADD CONSTRAINT knowledge_unit_source_check
  CHECK (source IN (
    'questionnaire',
    'exception',
    'ai_draft',
    'meeting_final',
    'manual',
    'evidence',
    'dialogue',
    'employee_questionnaire'
  ));

COMMIT;
