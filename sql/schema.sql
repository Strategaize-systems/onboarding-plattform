-- StrategAIze Onboarding-Plattform V1 — Baseline Schema
-- Tenants + Profiles bilden das Auth-Fundament fuer alle Capture-Tabellen.
-- Core-Capture-Tabellen (template, capture_session, block_checkpoint,
-- knowledge_unit, validation_layer) kommen ueber Migrations 021-023.
-- Ausfuehrung: einmalig beim DB-Start (docker-entrypoint-initdb.d/01_schema.sql).

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TENANTS
-- Kundenunternehmen. Admin-verwaltet.
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  language    text        NOT NULL DEFAULT 'de' CHECK (language IN ('de', 'en', 'nl')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES auth.users ON DELETE SET NULL
);

COMMENT ON TABLE tenants IS 'Kundenunternehmen. Admin-verwaltet.';

-- ============================================================
-- PROFILES
-- Eine Zeile pro auth.users-Eintrag. Verknuepft User mit Tenant + Rolle.
-- Wird ausschliesslich ueber handle_new_user()-Trigger erzeugt
-- (siehe functions.sql).
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  tenant_id   uuid        REFERENCES tenants ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('strategaize_admin', 'tenant_admin', 'tenant_member')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role      ON profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_email     ON profiles (lower(email));

COMMENT ON TABLE profiles IS 'User-Profil, verknuepft mit auth.users. tenant_id NULL fuer strategaize_admin.';
