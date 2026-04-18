-- Migration 039: error_log table for application error tracking
-- Source: FEAT-009 / SLC-012 / ARCHITECTURE.md V1.1 Addendum

CREATE TABLE IF NOT EXISTS error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'error',
  source text NOT NULL DEFAULT 'unknown',
  message text NOT NULL,
  stack text,
  metadata jsonb DEFAULT '{}',
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: only strategaize_admin can read, service_role writes (bypasses RLS)
ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY error_log_admin_read ON error_log
  FOR SELECT USING (auth.user_role() = 'strategaize_admin');

-- Index for querying by date
CREATE INDEX IF NOT EXISTS idx_error_log_created_at ON error_log(created_at DESC);

-- service_role needs table-level grants (BYPASSRLS != table permissions)
GRANT ALL ON error_log TO service_role;
