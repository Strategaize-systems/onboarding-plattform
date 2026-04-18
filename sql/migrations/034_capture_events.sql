-- Migration 034: Capture Events (SLC-008 MT-A6)
-- Datum: 2026-04-18
-- Feature: FEAT-005 — Event-basierte Antwort-Speicherung fuer Capture-Sessions
-- Analog zu Blueprint question_events, aber fuer capture_session.

CREATE TABLE IF NOT EXISTS capture_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid        NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE,
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  block_key       text        NOT NULL,
  question_id     text        NOT NULL,
  client_event_id text        NOT NULL,
  event_type      text        NOT NULL
                              CHECK (event_type IN ('answer_submitted', 'note_added')),
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(session_id, client_event_id)
);

COMMENT ON TABLE capture_events IS 'Event-Log pro Frage in einer Capture-Session. Speichert Antwort-Versionen chronologisch.';
COMMENT ON COLUMN capture_events.question_id IS 'Template-Question-ID (z.B. uuid aus template.blocks[].questions[].id)';
COMMENT ON COLUMN capture_events.client_event_id IS 'Idempotency-Key vom Client (crypto.randomUUID)';

-- Indexes
CREATE INDEX idx_capture_events_session_question
  ON capture_events(session_id, block_key, question_id);

CREATE INDEX idx_capture_events_session_client
  ON capture_events(session_id, client_event_id);

-- RLS
ALTER TABLE capture_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_own_capture_events ON capture_events
  FOR SELECT USING (
    tenant_id = auth.user_tenant_id()
  );

CREATE POLICY tenant_insert_own_capture_events ON capture_events
  FOR INSERT WITH CHECK (
    tenant_id = auth.user_tenant_id()
  );

-- GRANTs
GRANT SELECT, INSERT ON capture_events TO authenticated;
GRANT ALL ON capture_events TO service_role;
