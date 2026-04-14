-- Migration 013: Run Memory Tabelle (V2.2 Personalized LLM)
-- Datum: 2026-04-02
-- Feature: FEAT-027 — LLM Run Memory

CREATE TABLE IF NOT EXISTS run_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,

  memory_text TEXT NOT NULL DEFAULT '',
  version INT NOT NULL DEFAULT 0,

  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(run_id)
);

COMMENT ON TABLE run_memory IS 'LLM-kuratiertes Memory pro Run. Max ~800 Tokens. Wird bei jeder Session als System-Kontext geladen.';
COMMENT ON COLUMN run_memory.memory_text IS 'Vom LLM geschriebene Zusammenfassung: Themen, Muster, offene Punkte, Antwortstil';
COMMENT ON COLUMN run_memory.version IS 'Inkrementiert bei jedem Memory-Update';

-- RLS: Tenant kann nur Memory seiner eigenen Runs lesen
ALTER TABLE run_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_own_memory ON run_memory
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM runs
      WHERE tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Memory wird server-seitig via adminClient geschrieben (BYPASSRLS)
-- Kein INSERT/UPDATE Policy für authenticated nötig

-- GRANTs für service_role (adminClient)
GRANT ALL ON run_memory TO service_role;
