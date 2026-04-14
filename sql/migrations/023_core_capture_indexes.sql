-- Migration 023: Onboarding-Plattform V1 — Indizes fuer Capture-Schema
-- Datum: 2026-04-14
-- Slice: SLC-001 MT-3
-- Dependencies: 021

-- Tenant-Filter (RLS-Hot-Path)
CREATE INDEX IF NOT EXISTS idx_capture_session_tenant_id
  ON capture_session (tenant_id);

CREATE INDEX IF NOT EXISTS idx_block_checkpoint_tenant_id
  ON block_checkpoint (tenant_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_unit_tenant_id
  ON knowledge_unit (tenant_id);

CREATE INDEX IF NOT EXISTS idx_validation_layer_tenant_id
  ON validation_layer (tenant_id);

-- FK-Joins
CREATE INDEX IF NOT EXISTS idx_capture_session_template_id
  ON capture_session (template_id);

CREATE INDEX IF NOT EXISTS idx_capture_session_owner_user_id
  ON capture_session (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_block_checkpoint_session
  ON block_checkpoint (capture_session_id);

CREATE INDEX IF NOT EXISTS idx_block_checkpoint_session_block
  ON block_checkpoint (capture_session_id, block_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_unit_checkpoint
  ON knowledge_unit (block_checkpoint_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_unit_session_block
  ON knowledge_unit (capture_session_id, block_key);

CREATE INDEX IF NOT EXISTS idx_validation_layer_ku
  ON validation_layer (knowledge_unit_id, created_at DESC);

-- Template-Slug-Lookup wird schon durch UNIQUE-Constraint gedeckt; kein zusaetzlicher Index noetig.
