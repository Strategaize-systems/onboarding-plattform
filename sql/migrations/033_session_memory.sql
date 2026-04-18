-- Migration 033: Session Memory (SLC-008 MT-A3)
-- Datum: 2026-04-18
-- Feature: FEAT-005 — KI-Chat Memory pro Capture-Session
-- Analog zu Blueprint run_memory, aber fuer capture_session.

CREATE TABLE IF NOT EXISTS session_memory (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES capture_session(id) ON DELETE CASCADE,

  memory_text text        NOT NULL DEFAULT '',
  version     int         NOT NULL DEFAULT 0,

  updated_at  timestamptz DEFAULT now(),

  UNIQUE(session_id)
);

COMMENT ON TABLE session_memory IS 'LLM-kuratiertes Memory pro Capture-Session. Max ~800 Tokens. Wird bei jeder Chat-Interaktion als Kontext geladen.';
COMMENT ON COLUMN session_memory.memory_text IS 'Vom LLM geschriebene Zusammenfassung: Themen, Muster, offene Punkte, Antwortstil';
COMMENT ON COLUMN session_memory.version IS 'Inkrementiert bei jedem Memory-Update';

-- RLS
ALTER TABLE session_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_own_session_memory ON session_memory
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM capture_session
      WHERE tenant_id = auth.user_tenant_id()
    )
  );

-- Memory wird server-seitig via adminClient geschrieben (BYPASSRLS)
-- Kein INSERT/UPDATE Policy fuer authenticated noetig

-- GRANTs
GRANT SELECT ON session_memory TO authenticated;
GRANT ALL ON session_memory TO service_role;
