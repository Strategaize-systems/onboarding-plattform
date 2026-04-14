-- Migration 021: Onboarding-Plattform V1 — Kerntabellen fuer Capture-Session-Schema
-- Datum: 2026-04-14
-- Slice: SLC-001 MT-1
-- Dependencies: Blueprint-Baseline (tenants, profiles, auth.user_tenant_id(), auth.user_role())

-- ============================================================
-- TEMPLATE — System-weite Wissens-Template-Definition
-- Keine Tenant-Bindung. Verwaltet durch strategaize_admin.
-- ============================================================
CREATE TABLE IF NOT EXISTS template (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text        NOT NULL UNIQUE,
  name        text        NOT NULL,
  version     text        NOT NULL,
  description text,
  blocks      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE template IS 'System-weite Wissens-Template-Definition (z.B. exit_readiness). Version = Semver.';
COMMENT ON COLUMN template.blocks IS 'Liste der Bloecke: [{id, key, title, description, questions[], order, required_bool}].';

-- ============================================================
-- CAPTURE_SESSION — Laufende Wissenserhebung pro Tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS capture_session (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  template_id       uuid        NOT NULL REFERENCES template ON DELETE RESTRICT,
  template_version  text        NOT NULL,
  owner_user_id     uuid        NOT NULL REFERENCES auth.users ON DELETE SET NULL,
  status            text        NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'in_progress', 'submitted', 'reviewed', 'finalized')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE capture_session IS 'Eine laufende Wissenserhebung eines Tenants gegen ein Template. template_version friert Content-Version ein.';

-- ============================================================
-- BLOCK_CHECKPOINT — Versionierter Submit-Zustand pro Block
-- ============================================================
CREATE TABLE IF NOT EXISTS block_checkpoint (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id  uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  block_key           text        NOT NULL,
  checkpoint_type     text        NOT NULL
                                  CHECK (checkpoint_type IN ('questionnaire_submit', 'meeting_final')),
  content             jsonb       NOT NULL,
  content_hash        text        NOT NULL,
  created_by          uuid        NOT NULL REFERENCES auth.users ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE block_checkpoint IS 'Versionierter Snapshot eines Block-Zustands. content_hash = SHA-256 des kanonisierten content.';

-- ============================================================
-- KNOWLEDGE_UNIT — Verdichtetes KI-Ergebnis pro Block
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_unit (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  capture_session_id    uuid        NOT NULL REFERENCES capture_session ON DELETE CASCADE,
  block_checkpoint_id   uuid        NOT NULL REFERENCES block_checkpoint ON DELETE CASCADE,
  block_key             text        NOT NULL,
  unit_type             text        NOT NULL
                                    CHECK (unit_type IN ('finding', 'risk', 'action', 'observation', 'ai_draft')),
  source                text        NOT NULL
                                    CHECK (source IN ('questionnaire', 'exception', 'ai_draft', 'meeting_final', 'manual')),
  title                 text        NOT NULL,
  body                  text        NOT NULL,
  confidence            text        NOT NULL
                                    CHECK (confidence IN ('low', 'medium', 'high')),
  evidence_refs         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status                text        NOT NULL DEFAULT 'proposed'
                                    CHECK (status IN ('proposed', 'accepted', 'edited', 'rejected')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid        REFERENCES auth.users ON DELETE SET NULL
);

COMMENT ON TABLE knowledge_unit IS 'Verdichtete Wissens-Einheit, pro Block-Checkpoint aus KI-Verdichtung oder manueller Eingabe.';
COMMENT ON COLUMN knowledge_unit.confidence IS 'Enum low|medium|high laut DEC-008.';
COMMENT ON COLUMN knowledge_unit.source IS 'Quelle der KU. manual wird in SLC-009 durch strategaize_admin gesetzt.';

-- ============================================================
-- VALIDATION_LAYER — Audit-Log der Review-Schritte
-- ============================================================
CREATE TABLE IF NOT EXISTS validation_layer (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  knowledge_unit_id uuid        NOT NULL REFERENCES knowledge_unit ON DELETE CASCADE,
  reviewer_user_id  uuid        NOT NULL REFERENCES auth.users ON DELETE SET NULL,
  reviewer_role     text        NOT NULL
                                CHECK (reviewer_role IN ('strategaize_admin', 'tenant_admin')),
  action            text        NOT NULL
                                CHECK (action IN ('accept', 'edit', 'reject', 'comment')),
  previous_status   text,
  new_status        text,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE validation_layer IS 'Audit-Log jeder menschlichen Review-Aktion auf einer knowledge_unit.';

-- ============================================================
-- RLS ENABLE (Policies folgen in Migration 022)
-- ============================================================
ALTER TABLE template          ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_session   ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_checkpoint  ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_unit    ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_layer  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- GRANTS
-- authenticated: liest ueber Policies. service_role: BYPASSRLS, braucht aber Table-GRANTs.
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON template          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON capture_session   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON block_checkpoint  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge_unit    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON validation_layer  TO authenticated;

GRANT ALL ON template          TO service_role;
GRANT ALL ON capture_session   TO service_role;
GRANT ALL ON block_checkpoint  TO service_role;
GRANT ALL ON knowledge_unit    TO service_role;
GRANT ALL ON validation_layer  TO service_role;

-- ============================================================
-- updated_at Trigger (einheitlich fuer die 3 Tabellen mit updated_at)
-- ============================================================
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_template_set_updated_at ON template;
CREATE TRIGGER trg_template_set_updated_at
  BEFORE UPDATE ON template
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

DROP TRIGGER IF EXISTS trg_capture_session_set_updated_at ON capture_session;
CREATE TRIGGER trg_capture_session_set_updated_at
  BEFORE UPDATE ON capture_session
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

DROP TRIGGER IF EXISTS trg_knowledge_unit_set_updated_at ON knowledge_unit;
CREATE TRIGGER trg_knowledge_unit_set_updated_at
  BEFORE UPDATE ON knowledge_unit
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();
