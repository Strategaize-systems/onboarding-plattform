-- Migration 012: Owner-Profil Tabelle (V2.2 Personalized LLM)
-- Datum: 2026-04-02
-- Feature: FEAT-026 — Owner-Profil ("Frage Null")

CREATE TABLE IF NOT EXISTS owner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Persönliche Informationen
  display_name TEXT,
  age_range TEXT,
  education TEXT,
  career_summary TEXT,
  years_as_owner TEXT,

  -- Anrede-Präferenz
  address_formal BOOLEAN DEFAULT true,
  address_by_lastname BOOLEAN DEFAULT true,

  -- Selbsteinordnung
  leadership_style TEXT,
  disc_style TEXT,

  -- Freie Vorstellung
  introduction TEXT,

  -- Meta
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(tenant_id)
);

COMMENT ON TABLE owner_profiles IS 'Persönliches Profil des Tenant-Owners. Wird in LLM-Prompts injiziert für personalisierte Rückfragen.';
COMMENT ON COLUMN owner_profiles.address_formal IS 'true = Sie, false = Du';
COMMENT ON COLUMN owner_profiles.address_by_lastname IS 'true = Nachname, false = Vorname';
COMMENT ON COLUMN owner_profiles.leadership_style IS 'patriarchal, cooperative, delegative, coaching, visionary';
COMMENT ON COLUMN owner_profiles.disc_style IS 'dominant, influential, steady, conscientious';

-- RLS
ALTER TABLE owner_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_own_profile ON owner_profiles
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY tenant_insert_own_profile ON owner_profiles
  FOR INSERT WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY tenant_update_own_profile ON owner_profiles
  FOR UPDATE USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- GRANTs für service_role (adminClient)
GRANT ALL ON owner_profiles TO service_role;
