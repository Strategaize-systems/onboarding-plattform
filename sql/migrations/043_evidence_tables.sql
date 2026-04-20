-- Migration 043: evidence_file + evidence_chunk tables + RLS + Indexes + GRANTs
-- SLC-018 MT-1 — Evidence-Mode Infrastruktur (FEAT-013)

DO $$ BEGIN

-- =============================================
-- 1. evidence_file — Metadaten hochgeladener Dateien
-- =============================================
CREATE TABLE IF NOT EXISTS evidence_file (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  block_key             text,
  storage_path          text        NOT NULL,
  original_filename     text        NOT NULL,
  mime_type             text        NOT NULL,
  file_size_bytes       integer     NOT NULL,
  extraction_status     text        NOT NULL DEFAULT 'pending'
                                    CHECK (extraction_status IN (
                                      'pending', 'extracting', 'extracted', 'failed')),
  extraction_error      text,
  created_by            uuid        NOT NULL REFERENCES auth.users,
  created_at            timestamptz NOT NULL DEFAULT now()
);

RAISE NOTICE 'evidence_file table created';

-- RLS
ALTER TABLE evidence_file ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: full cross-tenant access
CREATE POLICY evidence_file_admin_full ON evidence_file
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant_admin/member: read + write own tenant
CREATE POLICY evidence_file_tenant_read ON evidence_file
  FOR SELECT
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY evidence_file_tenant_insert ON evidence_file
  FOR INSERT
  WITH CHECK (
    auth.user_role() IN ('tenant_admin', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

RAISE NOTICE 'evidence_file RLS policies created';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_evidence_file_tenant
  ON evidence_file(tenant_id);

CREATE INDEX IF NOT EXISTS idx_evidence_file_session
  ON evidence_file(capture_session_id);

CREATE INDEX IF NOT EXISTS idx_evidence_file_status
  ON evidence_file(extraction_status) WHERE extraction_status != 'extracted';

RAISE NOTICE 'evidence_file indexes created';

-- GRANTs
GRANT ALL ON evidence_file TO service_role;
GRANT SELECT, INSERT ON evidence_file TO authenticated;

RAISE NOTICE 'evidence_file grants applied';

-- updated_at trigger (reuse existing _set_updated_at function — not needed here,
-- evidence_file has no updated_at column by design: files are immutable after upload)

-- =============================================
-- 2. evidence_chunk — Extrahierte Text-Chunks mit KI-Mapping
-- =============================================
CREATE TABLE IF NOT EXISTS evidence_chunk (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  evidence_file_id      uuid        NOT NULL REFERENCES evidence_file ON DELETE CASCADE,
  chunk_index           integer     NOT NULL,
  chunk_text            text        NOT NULL,
  mapping_suggestion    jsonb,
  mapping_status        text        NOT NULL DEFAULT 'pending'
                                    CHECK (mapping_status IN (
                                      'pending', 'suggested', 'confirmed', 'rejected')),
  confirmed_question_id uuid,
  confirmed_block_key   text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

RAISE NOTICE 'evidence_chunk table created';

-- RLS
ALTER TABLE evidence_chunk ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: full cross-tenant access
CREATE POLICY evidence_chunk_admin_full ON evidence_chunk
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant_admin/member: read own tenant
CREATE POLICY evidence_chunk_tenant_read ON evidence_chunk
  FOR SELECT
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

-- tenant_admin/member: update mapping status on own tenant
CREATE POLICY evidence_chunk_tenant_update ON evidence_chunk
  FOR UPDATE
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() IN ('tenant_admin', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

RAISE NOTICE 'evidence_chunk RLS policies created';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_evidence_chunk_file
  ON evidence_chunk(evidence_file_id);

CREATE INDEX IF NOT EXISTS idx_evidence_chunk_tenant
  ON evidence_chunk(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_chunk_unique
  ON evidence_chunk(evidence_file_id, chunk_index);

RAISE NOTICE 'evidence_chunk indexes created';

-- GRANTs
GRANT ALL ON evidence_chunk TO service_role;
GRANT SELECT, UPDATE ON evidence_chunk TO authenticated;

RAISE NOTICE 'evidence_chunk grants applied';

END $$;
