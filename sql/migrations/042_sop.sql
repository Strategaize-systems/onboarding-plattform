-- Migration 042: SOP table + RLS
-- SLC-016 MT-1 — Standard Operating Procedures pro Block

DO $$ BEGIN

-- Create sop table
CREATE TABLE IF NOT EXISTS sop (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  block_key             text        NOT NULL,
  block_checkpoint_id   uuid        NOT NULL REFERENCES block_checkpoint ON DELETE CASCADE,
  content               jsonb       NOT NULL,
  generated_by_model    text        NOT NULL,
  cost_usd              numeric(10,6),
  created_by            uuid        REFERENCES auth.users,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

RAISE NOTICE 'sop table created';

-- RLS
ALTER TABLE sop ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: full access
CREATE POLICY sop_admin_full ON sop
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant_admin: read own tenant
CREATE POLICY sop_tenant_read ON sop
  FOR SELECT
  USING (tenant_id = auth.user_tenant_id());

RAISE NOTICE 'sop RLS policies created';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sop_session_block
  ON sop(capture_session_id, block_key);

CREATE INDEX IF NOT EXISTS idx_sop_checkpoint
  ON sop(block_checkpoint_id);

RAISE NOTICE 'sop indexes created';

-- GRANTs for authenticated + service_role
GRANT ALL ON sop TO authenticated;
GRANT ALL ON sop TO service_role;

RAISE NOTICE 'sop grants applied';

END $$;
