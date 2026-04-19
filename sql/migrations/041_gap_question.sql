-- 041_gap_question.sql
-- SLC-014: Gap-Question-Tabelle fuer Orchestrator-erkannte Wissensluecken
-- Idempotent: CREATE TABLE IF NOT EXISTS

BEGIN;

-- Tabelle
CREATE TABLE IF NOT EXISTS public.gap_question (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  block_checkpoint_id   uuid        NOT NULL REFERENCES block_checkpoint ON DELETE CASCADE,
  knowledge_unit_id     uuid        REFERENCES knowledge_unit ON DELETE SET NULL,
  question_text         text        NOT NULL,
  context               text,
  subtopic              text,
  priority              text        NOT NULL DEFAULT 'required'
                                    CHECK (priority IN ('required', 'nice_to_have')),
  status                text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'answered', 'skipped', 'recondensed')),
  answer_text           text,
  answered_at           timestamptz,
  backspelling_round    integer     NOT NULL DEFAULT 1,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- RLS aktivieren
ALTER TABLE public.gap_question ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$
BEGIN
  -- strategaize_admin: Full Cross-Tenant
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'gap_question_admin_full' AND tablename = 'gap_question') THEN
    CREATE POLICY gap_question_admin_full ON public.gap_question
      FOR ALL TO authenticated
      USING (auth.user_role() = 'strategaize_admin')
      WITH CHECK (auth.user_role() = 'strategaize_admin');
  END IF;

  -- tenant_admin/member: Read eigener Tenant
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'gap_question_tenant_read' AND tablename = 'gap_question') THEN
    CREATE POLICY gap_question_tenant_read ON public.gap_question
      FOR SELECT TO authenticated
      USING (
        auth.user_role() IN ('tenant_admin', 'tenant_member')
        AND tenant_id = auth.user_tenant_id()
      );
  END IF;

  -- tenant_admin/member: Write eigener Tenant (fuer Gap-Antworten)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'gap_question_tenant_write' AND tablename = 'gap_question') THEN
    CREATE POLICY gap_question_tenant_write ON public.gap_question
      FOR UPDATE TO authenticated
      USING (
        auth.user_role() IN ('tenant_admin', 'tenant_member')
        AND tenant_id = auth.user_tenant_id()
      )
      WITH CHECK (
        auth.user_role() IN ('tenant_admin', 'tenant_member')
        AND tenant_id = auth.user_tenant_id()
      );
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gap_question_tenant ON public.gap_question(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gap_question_checkpoint ON public.gap_question(block_checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_gap_question_session ON public.gap_question(capture_session_id);
CREATE INDEX IF NOT EXISTS idx_gap_question_status ON public.gap_question(status) WHERE status = 'pending';

-- GRANTs
GRANT ALL ON public.gap_question TO service_role;
GRANT SELECT, UPDATE ON public.gap_question TO authenticated;

COMMIT;
