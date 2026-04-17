-- Migration 030: Add answers JSONB column to capture_session
-- Datum: 2026-04-17
-- Slice: SLC-005 MT-1
-- Decision: DEC-013 — JSONB auf Session-Ebene statt separater Tabelle

-- Key-Pattern: { "A.891e8158-a7d8-4048-95ce-86d66f642b86": "Antwort-Text", ... }
-- Format: "${blockKey}.${questionId}" → string value

ALTER TABLE capture_session
  ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN capture_session.answers IS 'Questionnaire-Antworten als JSONB. Key = "${blockKey}.${questionId}", Value = Antwort-Text. DEC-013.';
