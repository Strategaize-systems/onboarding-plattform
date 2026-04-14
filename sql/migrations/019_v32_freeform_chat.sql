-- Migration 019: V3.2 Free-Form Chat — freeform_conversations
-- Datum: 2026-04-08
-- Feature: FEAT-035

-- ============================================================
-- 1. freeform_conversations — Free-Form Gesprächsverläufe
-- ============================================================
CREATE TABLE IF NOT EXISTS freeform_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  conversation_number INT NOT NULL DEFAULT 1,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'mapping_pending', 'mapped', 'closed')),
  message_count INT NOT NULL DEFAULT 0,
  mapping_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, created_by, conversation_number)
);

-- ============================================================
-- 2. RLS
-- ============================================================
ALTER TABLE freeform_conversations ENABLE ROW LEVEL SECURITY;

-- Tenant: eigene Conversations lesen
CREATE POLICY "freeform_select_own"
  ON freeform_conversations FOR SELECT
  TO authenticated
  USING (
    tenant_id = auth.user_tenant_id()
    AND created_by = auth.uid()
  );

-- Tenant: neue Conversation erstellen (nur wenn Run nicht locked)
CREATE POLICY "freeform_insert_own"
  ON freeform_conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = auth.user_tenant_id()
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM runs r WHERE r.id = run_id AND r.status != 'locked')
  );

-- ============================================================
-- 3. GRANTs
-- ============================================================
GRANT ALL ON freeform_conversations TO authenticated;
GRANT ALL ON freeform_conversations TO service_role;
