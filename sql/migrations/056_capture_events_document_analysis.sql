-- Migration 056: Add document_analysis + evidence_attached to capture_events CHECK
-- Ported from Blueprint pattern: KI-Dokumentanalyse nach Evidence-Upload

BEGIN;

ALTER TABLE capture_events
DROP CONSTRAINT IF EXISTS capture_events_event_type_check;

ALTER TABLE capture_events
ADD CONSTRAINT capture_events_event_type_check
CHECK (event_type IN (
  'answer_submitted',
  'note_added',
  'evidence_attached',
  'document_analysis'
));

COMMIT;
