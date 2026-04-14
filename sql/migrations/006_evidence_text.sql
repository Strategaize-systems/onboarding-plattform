-- Migration 006: Extracted text für Evidence-Dokumente
-- Datum: 2026-03-29

ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS extracted_text text;

COMMENT ON COLUMN evidence_items.extracted_text IS 'Extrahierter Text aus PDF/TXT/DOCX. Wird als LLM-Kontext genutzt.';
