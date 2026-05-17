-- V6.3 SLC-105 /qa Frontend-Pass Live-Smoke Test-Fixture
-- TEMPORAER — fuer Live-Smoke AC-1+AC-2+AC-10+AC-14. Cleanup via Cleanup-Block am Ende.
--
-- Anlegt:
--   1. partner_organization-Tenant "QA-Partner-Steuerberater" (UUID aaaaa...01)
--   2. partner_client-Tenant "QA-Mandant GmbH" (UUID aaaaa...02), parent=01
--   3. partner_branding_config fuer Partner mit display_name + primary_color #c4302b
--   4. auth.users qa-mandant@strategaizetransition.com (UUID aaaaa...03), password=QaSmoke2026!
--   5. profiles-Eintrag tenant_admin im partner_client-Tenant
--
-- Cleanup-Block am Ende auskommentiert — nach Live-Smoke aktivieren.

BEGIN;

-- Stabile UUIDs (aaaaa-Prefix fuer eindeutige Identifikation)
DO $$
DECLARE
  v_partner_id   uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_mandant_id   uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_user_id      uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_user_email   text := 'qa-mandant@strategaizetransition.com';
  v_user_pw      text := 'QaSmoke2026!';
BEGIN
  -- 1. Partner-Org-Tenant
  INSERT INTO tenants (id, name, language, tenant_kind, parent_partner_tenant_id, onboarding_wizard_state)
    VALUES (v_partner_id, 'QA Partner Steuerberater', 'de', 'partner_organization', NULL, 'completed')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  -- 2. Partner-Branding-Config fuer AC-10
  INSERT INTO partner_branding_config (partner_tenant_id, primary_color, display_name)
    VALUES (v_partner_id, '#c4302b', 'QA-Steuerberater Demo')
    ON CONFLICT (partner_tenant_id) DO UPDATE
      SET primary_color = EXCLUDED.primary_color, display_name = EXCLUDED.display_name;

  -- 3. partner_client-Tenant (Mandant) mit parent=Partner
  INSERT INTO tenants (id, name, language, tenant_kind, parent_partner_tenant_id, onboarding_wizard_state)
    VALUES (v_mandant_id, 'QA Mandant GmbH', 'de', 'partner_client', v_partner_id, 'completed')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  -- 4. auth.users-Eintrag (Self-hosted Supabase Pattern: crypt + bf)
  -- handle_new_user-Trigger erstellt profile automatisch aus raw_user_meta_data.
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_user_email,
    crypt(v_user_pw, gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('tenant_id', v_mandant_id::text, 'role', 'tenant_admin'),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET encrypted_password = EXCLUDED.encrypted_password,
        email_confirmed_at = now(),
        raw_user_meta_data = EXCLUDED.raw_user_meta_data,
        updated_at = now();

  -- 5. profiles-Eintrag — UPSERT damit der Trigger-INSERT (oder ein
  -- vorhandenes Profile aus frueheren Runs) korrekt auf tenant_admin im
  -- partner_client zeigt.
  INSERT INTO profiles (id, tenant_id, email, role)
    VALUES (v_user_id, v_mandant_id, v_user_email, 'tenant_admin')
    ON CONFLICT (id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id, role = EXCLUDED.role, email = EXCLUDED.email;

  RAISE NOTICE 'Fixture angelegt: partner=%, mandant=%, user=%, email=%, pw=%',
    v_partner_id, v_mandant_id, v_user_id, v_user_email, v_user_pw;
END;
$$;

COMMIT;

-- Verifikation
SELECT 'tenants' AS table_name, id, name, tenant_kind, parent_partner_tenant_id
  FROM tenants WHERE id IN (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000002'
  );
SELECT 'profiles' AS table_name, id, tenant_id, email, role
  FROM profiles WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';
SELECT 'branding' AS table_name, partner_tenant_id, display_name, primary_color
  FROM partner_branding_config WHERE partner_tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- =========================================================================
-- CLEANUP-BLOCK — nach Live-Smoke aktivieren (auskommentieren entfernen)
-- =========================================================================
-- BEGIN;
--   DELETE FROM capture_session WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000002';
--   DELETE FROM ai_jobs WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000002';
--   DELETE FROM ai_cost_ledger WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-000000000002';
--   DELETE FROM profiles WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';
--   DELETE FROM auth.users WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';
--   DELETE FROM partner_branding_config WHERE partner_tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
--   DELETE FROM tenants WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
--   DELETE FROM tenants WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- COMMIT;
