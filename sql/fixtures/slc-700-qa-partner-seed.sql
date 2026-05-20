-- V7 SLC-700 IS-Cross-System-Live-Smoke Pre-Condition Seed
-- Pflicht-Vor-Setup fuer Live-Smoke per:
--   strategaize-intelligence-studio/qa/SLC-700-live-smoke.md (Pre-Condition #5)
--   strategaize-onboarding-plattform/docs/V7_LIVE_SMOKE_PLAN.md (Pre-Condition Slug)
--
-- Anlegt:
--   1. partner_organization-Tenant "QA Steuerberater Demo" (UUID bbbbb...01)
--   2. partner_organization-Row mit slug='qa-steuerberater-demo'
--   3. partner_branding_config mit display_name + primary_color
--
-- Idempotent: ON CONFLICT-Klauseln erlauben Re-Run ohne Fehler.
-- Slug-Pattern stabil per UUID 'bbbbbbbb-0000-0000-0000-000000000001'.

BEGIN;

DO $$
DECLARE
  v_partner_tenant_id uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
BEGIN
  -- 1. tenants-Row (Partner-Org-Tenant)
  INSERT INTO tenants (
    id, name, language, tenant_kind, parent_partner_tenant_id, onboarding_wizard_state
  )
  VALUES (
    v_partner_tenant_id,
    'QA Steuerberater Demo',
    'de',
    'partner_organization',
    NULL,
    'completed'
  )
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        tenant_kind = EXCLUDED.tenant_kind,
        onboarding_wizard_state = EXCLUDED.onboarding_wizard_state;

  -- 2. partner_organization-Row mit stabilem Slug
  --    Unique-Constraint auf tenant_id → ON CONFLICT (tenant_id) DO UPDATE
  INSERT INTO partner_organization (
    tenant_id,
    legal_name,
    display_name,
    partner_kind,
    contact_email,
    country,
    slug
  )
  VALUES (
    v_partner_tenant_id,
    'QA Steuerberater Demo Kanzlei GmbH',
    'QA Steuerberater Demo',
    'tax_advisor',
    'qa-steuerberater-demo@strategaize.de',
    'DE',
    'qa-steuerberater-demo'
  )
  ON CONFLICT (tenant_id) DO UPDATE
    SET legal_name = EXCLUDED.legal_name,
        display_name = EXCLUDED.display_name,
        contact_email = EXCLUDED.contact_email,
        country = EXCLUDED.country,
        slug = EXCLUDED.slug;

  -- 3. partner_branding_config — primary_color + display_name fuer Branding-Resolve
  INSERT INTO partner_branding_config (
    partner_tenant_id, primary_color, display_name
  )
  VALUES (
    v_partner_tenant_id,
    '#0066cc',
    'QA Steuerberater Demo'
  )
  ON CONFLICT (partner_tenant_id) DO UPDATE
    SET primary_color = EXCLUDED.primary_color,
        display_name = EXCLUDED.display_name;

  RAISE NOTICE 'Seed angelegt: partner_tenant_id=%, slug=qa-steuerberater-demo',
    v_partner_tenant_id;
END;
$$;

COMMIT;

-- PostgREST Schema-Reload (Pflicht per reference_postgrest_schema_reload)
NOTIFY pgrst, 'reload schema';

-- Verifikation
SELECT 'partner_organization' AS table_name, id, display_name, slug, tenant_id
  FROM partner_organization WHERE slug = 'qa-steuerberater-demo';
SELECT 'partner_branding_config' AS table_name, partner_tenant_id, display_name, primary_color
  FROM partner_branding_config WHERE partner_tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
SELECT 'tenants' AS table_name, id, name, tenant_kind
  FROM tenants WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- =========================================================================
-- CLEANUP-BLOCK — nach Live-Smoke aktivieren wenn der Slug nicht persistent bleiben soll
-- =========================================================================
-- BEGIN;
--   DELETE FROM partner_branding_config WHERE partner_tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
--   DELETE FROM partner_organization WHERE tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';
--   DELETE FROM tenants WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001';
-- COMMIT;
