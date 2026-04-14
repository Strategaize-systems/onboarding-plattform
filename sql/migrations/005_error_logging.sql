-- Migration 005: Error Logging Tabelle
-- Datum: 2026-03-29

CREATE TABLE IF NOT EXISTS error_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  level       text        NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warning', 'info')),
  source      text        NOT NULL,  -- z.B. 'api/tenant/runs', 'llm/chat', 'auth/login'
  message     text        NOT NULL,
  stack       text,                  -- Stack trace wenn vorhanden
  metadata    jsonb       DEFAULT '{}',  -- User-ID, Run-ID, Request-Details etc.
  user_id     uuid        REFERENCES auth.users ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_level ON error_log (level);
CREATE INDEX IF NOT EXISTS idx_error_log_source ON error_log (source);

COMMENT ON TABLE error_log IS 'Internes Error-Logging. Kann spaeter durch Sentry ersetzt werden.';

-- RLS: nur strategaize_admin darf lesen, service_role darf schreiben
ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_errors" ON error_log FOR SELECT TO authenticated
  USING (auth.user_role() = 'strategaize_admin');

-- service_role braucht INSERT (wird von API-Routes genutzt)
GRANT ALL ON error_log TO service_role;
GRANT SELECT ON error_log TO authenticated;
