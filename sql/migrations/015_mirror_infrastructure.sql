-- Migration 015: Mirror-Infrastruktur (V3 Operational Reality Mirror)
-- Datum: 2026-04-04
-- Features: FEAT-028, FEAT-029, FEAT-030

-- ============================================================
-- 1. runs.survey_type
-- ============================================================
ALTER TABLE runs ADD COLUMN IF NOT EXISTS survey_type TEXT NOT NULL DEFAULT 'management'
  CHECK (survey_type IN ('management', 'mirror'));

CREATE INDEX IF NOT EXISTS idx_runs_survey_type ON runs (tenant_id, survey_type, status);

-- ============================================================
-- 2. question_catalog_snapshots.survey_type
-- ============================================================
ALTER TABLE question_catalog_snapshots ADD COLUMN IF NOT EXISTS survey_type TEXT NOT NULL DEFAULT 'management'
  CHECK (survey_type IN ('management', 'mirror'));

-- Drop old UNIQUE (version, language) and create new one including survey_type
ALTER TABLE question_catalog_snapshots
  DROP CONSTRAINT IF EXISTS question_catalog_snapshots_version_language_key;

ALTER TABLE question_catalog_snapshots
  ADD CONSTRAINT question_catalog_snapshots_version_language_survey_type_key
  UNIQUE (version, language, survey_type);

-- ============================================================
-- 3. profiles.role CHECK erweitern um mirror_respondent
-- ============================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('strategaize_admin', 'tenant_admin', 'tenant_owner', 'tenant_member', 'mirror_respondent'));

-- ============================================================
-- 4. profiles.respondent_layer
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS respondent_layer TEXT
  CHECK (respondent_layer IS NULL OR respondent_layer IN ('owner', 'leadership_1', 'leadership_2', 'key_staff'));

-- ============================================================
-- 5. member_block_access.survey_type
-- ============================================================
ALTER TABLE member_block_access ADD COLUMN IF NOT EXISTS survey_type TEXT NOT NULL DEFAULT 'management'
  CHECK (survey_type IN ('management', 'mirror'));

-- Drop old UNIQUE and create new one including survey_type
ALTER TABLE member_block_access
  DROP CONSTRAINT IF EXISTS member_block_access_profile_id_run_id_block_key;

ALTER TABLE member_block_access
  ADD CONSTRAINT member_block_access_unique
  UNIQUE (profile_id, run_id, block, survey_type);

-- ============================================================
-- 6. mirror_policy_confirmations (neue Tabelle)
-- ============================================================
CREATE TABLE IF NOT EXISTS mirror_policy_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  policy_version TEXT NOT NULL DEFAULT 'v1.0',
  UNIQUE(profile_id, tenant_id)
);

COMMENT ON TABLE mirror_policy_confirmations IS 'Tracks whether a mirror_respondent has confirmed the confidentiality policy.';

-- RLS for mirror_policy_confirmations
ALTER TABLE mirror_policy_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_full_mirror_policy ON mirror_policy_confirmations
  FOR ALL TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY respondent_read_own_policy ON mirror_policy_confirmations
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY respondent_insert_own_policy ON mirror_policy_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- ============================================================
-- 7. GRANTs
-- ============================================================
GRANT ALL ON mirror_policy_confirmations TO service_role;
GRANT SELECT, INSERT ON mirror_policy_confirmations TO authenticated;
