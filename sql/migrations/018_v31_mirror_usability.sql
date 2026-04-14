-- Migration 018: V3.1 Mirror Usability — mirror_nominations + mirror_profiles + runs.due_date
-- Datum: 2026-04-07
-- Features: FEAT-032, FEAT-033, FEAT-034

-- ============================================================
-- 1. mirror_nominations — GF schlägt Mirror-Teilnehmer vor
-- ============================================================
CREATE TABLE IF NOT EXISTS mirror_nominations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  respondent_layer TEXT NOT NULL CHECK (respondent_layer IN ('leadership_1', 'leadership_2', 'key_staff')),
  department TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nominated' CHECK (status IN ('nominated', 'invited')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE mirror_nominations ENABLE ROW LEVEL SECURITY;

-- tenant_admin: voller CRUD auf eigenen Tenant
CREATE POLICY "tenant_admin_manage_nominations"
  ON mirror_nominations FOR ALL
  TO authenticated
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

-- GRANTs
GRANT ALL ON mirror_nominations TO authenticated;
GRANT ALL ON mirror_nominations TO service_role;

-- ============================================================
-- 2. mirror_profiles — Profil pro Mirror-Teilnehmer
-- ============================================================
CREATE TABLE IF NOT EXISTS mirror_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name TEXT,
  address_formal BOOLEAN NOT NULL DEFAULT true,
  department TEXT,
  position_title TEXT,
  leadership_style TEXT,
  disc_style TEXT,
  introduction TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE mirror_profiles ENABLE ROW LEVEL SECURITY;

-- mirror_respondent: eigenes Profil lesen + schreiben
CREATE POLICY "mirror_respondent_own_profile"
  ON mirror_profiles FOR ALL
  TO authenticated
  USING (
    auth.user_role() = 'mirror_respondent'
    AND profile_id = auth.uid()
  )
  WITH CHECK (
    auth.user_role() = 'mirror_respondent'
    AND profile_id = auth.uid()
  );

-- GRANTs
GRANT ALL ON mirror_profiles TO authenticated;
GRANT ALL ON mirror_profiles TO service_role;

-- ============================================================
-- 3. runs.due_date — optionale Deadline
-- ============================================================
ALTER TABLE runs ADD COLUMN IF NOT EXISTS due_date DATE;
