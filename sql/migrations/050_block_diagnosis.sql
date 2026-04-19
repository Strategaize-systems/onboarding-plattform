-- Migration 050: block_diagnosis table + RLS + Indexes + GRANTs
-- SLC-023 MT-1 — Diagnosis results per block (FEAT-016)

DO $$ BEGIN

-- Create block_diagnosis table
CREATE TABLE IF NOT EXISTS block_diagnosis (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  block_key             text        NOT NULL,
  block_checkpoint_id   uuid        NOT NULL REFERENCES block_checkpoint ON DELETE CASCADE,
  content               jsonb       NOT NULL,
  status                text        NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'reviewed', 'confirmed')),
  generated_by_model    text        NOT NULL,
  cost_usd              numeric(10,6),
  created_by            uuid        REFERENCES auth.users,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

RAISE NOTICE 'block_diagnosis table created';

-- RLS
ALTER TABLE block_diagnosis ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: full access
CREATE POLICY block_diagnosis_admin_full ON block_diagnosis
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant_admin: read own tenant
CREATE POLICY block_diagnosis_tenant_read ON block_diagnosis
  FOR SELECT
  USING (tenant_id = auth.user_tenant_id());

RAISE NOTICE 'block_diagnosis RLS policies created';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_block_diagnosis_session_block
  ON block_diagnosis(capture_session_id, block_key);

CREATE INDEX IF NOT EXISTS idx_block_diagnosis_checkpoint
  ON block_diagnosis(block_checkpoint_id);

RAISE NOTICE 'block_diagnosis indexes created';

-- updated_at trigger (reuses existing _set_updated_at function)
CREATE TRIGGER set_block_diagnosis_updated_at
  BEFORE UPDATE ON block_diagnosis
  FOR EACH ROW
  EXECUTE FUNCTION _set_updated_at();

RAISE NOTICE 'block_diagnosis updated_at trigger created';

-- GRANTs for authenticated + service_role
GRANT ALL ON block_diagnosis TO authenticated;
GRANT ALL ON block_diagnosis TO service_role;

RAISE NOTICE 'block_diagnosis grants applied';

END $$;
