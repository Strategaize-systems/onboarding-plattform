-- Migration 091: V6 Partner-Branding + RPC + Storage-Bucket + CHECK-Erweiterungen
-- SLC-104 (FEAT-044, MIG-034 Step 2) — DEC-099, DEC-106, DEC-108, DEC-109, DEC-111
--
-- ZIEL
-- ====
-- 1) partner_branding_config-Tabelle (1:1 zu partner_organization-Tenants) + RLS.
-- 2) RPC rpc_get_branding_for_tenant (SECURITY DEFINER, anon+authenticated EXECUTE).
--    Resolved Partner-Branding ueber parent_partner_tenant_id-Beziehung. DEC-099-Pattern.
-- 3) CHECK-Erweiterungen auf bestehenden Tabellen, die V6+ Slices brauchen:
--      - validation_layer.reviewer_role: +tenant_member,+employee,+partner_admin,+system_auto
--      - block_checkpoint.checkpoint_type: +auto_final
-- 4) Storage-Bucket partner-branding-assets (privat, 500KB, PNG/SVG/JPG)
--    + 3 Storage-RLS-Policies (insert/select/delete) mit Pfad-Praefix tenant_id.
-- 5) Backfill: bestehende partner_organization-Tenants bekommen Default-Branding-Row.
--
-- IDEMPOTENZ
-- ==========
-- Alle DDL-Statements verwenden IF NOT EXISTS / DROP POLICY IF EXISTS / ON CONFLICT
-- und sind so geschrieben, dass ein zweiter Apply ein No-Op ist.
-- CONSTRAINT-Erweiterungen per DO-Block + pg_constraint-Lookup (PG < 16 hat
-- kein ADD CONSTRAINT IF NOT EXISTS).
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/091_v6_partner_branding_and_template_metadata.sql
--   echo '<BASE64>' | base64 -d > /tmp/091_v6.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/091_v6.sql
--
-- PRE-APPLY-BACKUP-PFLICHT
-- ========================
--   docker exec <db-container> pg_dump -U postgres -d postgres \
--     --schema-only --table=public.partner_branding_config \
--     > /opt/onboarding-plattform-backups/pre-mig-034-091_$(date +%Y%m%d_%H%M%S).sql
--
-- VERIFIKATION (nach Apply)
-- =========================
--   \dt partner_branding_config                 -> Tabelle existiert
--   \dp partner_branding_config                 -> 4 Policies
--   \df rpc_get_branding_for_tenant             -> Function SECURITY DEFINER, owner postgres
--   SELECT COUNT(*) FROM partner_branding_config
--     -> Anzahl == SELECT COUNT(*) FROM tenants WHERE tenant_kind='partner_organization'
--   SELECT id, name, public, file_size_limit, allowed_mime_types
--     FROM storage.buckets WHERE id='partner-branding-assets'
--     -> 1 Row, public=false, 524288, image-mimes
--   SELECT public.rpc_get_branding_for_tenant(NULL)
--     -> Strategaize-Default-JSON

DO $mig034_step2$ BEGIN

-- ============================================================
-- 1. partner_branding_config Tabelle
-- ============================================================
CREATE TABLE IF NOT EXISTS public.partner_branding_config (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id  uuid        NOT NULL UNIQUE
                                 REFERENCES public.tenants(id) ON DELETE CASCADE,
  logo_url           text        NULL,
  primary_color      text        NOT NULL DEFAULT '#2563eb',
  secondary_color    text        NULL,
  display_name       text        NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Hex-Format-CHECKs (idempotent via pg_constraint-Lookup)
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_branding_config_primary_color_check') THEN
  ALTER TABLE public.partner_branding_config
    ADD CONSTRAINT partner_branding_config_primary_color_check
      CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$');
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_branding_config_secondary_color_check') THEN
  ALTER TABLE public.partner_branding_config
    ADD CONSTRAINT partner_branding_config_secondary_color_check
      CHECK (secondary_color IS NULL OR secondary_color ~ '^#[0-9a-fA-F]{6}$');
END IF;

-- UNIQUE-Constraint impliziert Index, aber expliziter Lookup-Index hilft RLS-Joins
CREATE INDEX IF NOT EXISTS idx_partner_branding_config_partner ON public.partner_branding_config (partner_tenant_id);

ALTER TABLE public.partner_branding_config ENABLE ROW LEVEL SECURITY;

-- partner_admin liest eigene Branding-Row (Tenant-Constraint).
DROP POLICY IF EXISTS pbc_select_own_partner_admin ON public.partner_branding_config;
CREATE POLICY pbc_select_own_partner_admin ON public.partner_branding_config
  FOR SELECT TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND partner_tenant_id = auth.user_tenant_id()
  );

-- partner_admin updated eigene Branding-Row.
DROP POLICY IF EXISTS pbc_update_own_partner_admin ON public.partner_branding_config;
CREATE POLICY pbc_update_own_partner_admin ON public.partner_branding_config
  FOR UPDATE TO authenticated
  USING (
    auth.user_role() = 'partner_admin'
    AND partner_tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'partner_admin'
    AND partner_tenant_id = auth.user_tenant_id()
  );

-- partner_admin INSERT eigene Branding-Row (falls Backfill nicht griff oder
-- Re-Initialisierung via UI). Backfill-Pfad ist normalerweise authoritativ;
-- partner_admin-INSERT existiert als Defense-in-Depth fuer Edge-Cases.
DROP POLICY IF EXISTS pbc_insert_own_partner_admin ON public.partner_branding_config;
CREATE POLICY pbc_insert_own_partner_admin ON public.partner_branding_config
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.user_role() = 'partner_admin'
    AND partner_tenant_id = auth.user_tenant_id()
  );

-- strategaize_admin Full-Access (Anlage neuer Partner via /admin/partners).
DROP POLICY IF EXISTS pbc_all_strategaize_admin ON public.partner_branding_config;
CREATE POLICY pbc_all_strategaize_admin ON public.partner_branding_config
  FOR ALL TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_branding_config TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.partner_branding_config TO partner_admin;
GRANT ALL                            ON public.partner_branding_config TO service_role;

RAISE NOTICE 'MIG-034/091: partner_branding_config table + 4 policies created';

-- ============================================================
-- 2. RPC rpc_get_branding_for_tenant (SECURITY DEFINER)
-- ============================================================
-- DEC-099-Pattern (analog rpc_get_walkthrough_video_path).
-- DEC-109-Tradeoff: KEIN Auth-Check — Branding ist absichtlich "best-effort lesbar"
-- damit Login-Page brandable bleibt (Branding vor Auth bekannt). UUID-v4 mitigiert
-- Enumeration-Risiko. GRANT EXECUTE TO anon + authenticated.
--
-- Logik:
--   (a) p_tenant_id IS NULL  → Strategaize-Default
--   (b) tenants-Row nicht gefunden → Strategaize-Default
--   (c) tenant_kind='partner_client' AND parent_partner_tenant_id IS NOT NULL:
--       → SELECT partner_branding_config WHERE partner_tenant_id = parent
--   (d) tenant_kind='partner_organization':
--       → SELECT eigene partner_branding_config
--   (e) ELSE (direct_client) ODER kein Branding-Row gefunden:
--       → Strategaize-Default
CREATE OR REPLACE FUNCTION public.rpc_get_branding_for_tenant(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $func$
DECLARE
  v_tenant_kind   text;
  v_parent_id     uuid;
  v_lookup_tenant uuid;
  v_branding      record;
  v_default       jsonb := jsonb_build_object(
    'logo_url',        NULL,
    'primary_color',   '#2563eb',
    'secondary_color', NULL,
    'display_name',    'Strategaize'
  );
BEGIN
  -- (a) NULL-Input → Default
  IF p_tenant_id IS NULL THEN
    RETURN v_default;
  END IF;

  -- (b) Tenant existiert nicht → Default
  SELECT tenant_kind, parent_partner_tenant_id
    INTO v_tenant_kind, v_parent_id
    FROM public.tenants
   WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN v_default;
  END IF;

  -- (c) Mandant unter Partner → Lookup auf Parent
  -- (d) Partner-Organization → Lookup auf sich selbst
  -- (e) Direct-Client / NULL-parent / inkonsistente Daten → Default
  IF v_tenant_kind = 'partner_client' AND v_parent_id IS NOT NULL THEN
    v_lookup_tenant := v_parent_id;
  ELSIF v_tenant_kind = 'partner_organization' THEN
    v_lookup_tenant := p_tenant_id;
  ELSE
    RETURN v_default;
  END IF;

  -- Branding-Row laden (Default falls keine Row vorhanden — Backfill sollte
  -- alle partner_organization-Tenants abdecken, aber best-effort hier)
  SELECT logo_url, primary_color, secondary_color, display_name
    INTO v_branding
    FROM public.partner_branding_config
   WHERE partner_tenant_id = v_lookup_tenant;

  IF NOT FOUND THEN
    RETURN v_default;
  END IF;

  RETURN jsonb_build_object(
    'logo_url',        v_branding.logo_url,
    'primary_color',   v_branding.primary_color,
    'secondary_color', v_branding.secondary_color,
    'display_name',    v_branding.display_name
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_get_branding_for_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_branding_for_tenant(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_branding_for_tenant(uuid) TO service_role;

RAISE NOTICE 'MIG-034/091: rpc_get_branding_for_tenant created (SECURITY DEFINER, anon+authenticated)';

-- ============================================================
-- 3. CHECK-Erweiterungen auf bestehenden Tabellen
-- ============================================================
-- 3a) validation_layer.reviewer_role: bestehend ('strategaize_admin','tenant_admin')
--     wird erweitert um tenant_member, employee, partner_admin, system_auto.
--     Pattern: dynamisches DROP via pg_constraint-Lookup (kein hardcodierter Name).
DECLARE
  v_constraint_name text;
BEGIN
  SELECT c.conname INTO v_constraint_name
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
   WHERE c.conrelid = 'public.validation_layer'::regclass
     AND c.contype = 'c'
     AND a.attname = 'reviewer_role';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.validation_layer DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped validation_layer.reviewer_role CHECK: %', v_constraint_name;
  END IF;

  ALTER TABLE public.validation_layer
    ADD CONSTRAINT validation_layer_reviewer_role_check
    CHECK (reviewer_role IN (
      'strategaize_admin', 'tenant_admin', 'tenant_member', 'employee',
      'partner_admin', 'system_auto'
    ));

  RAISE NOTICE 'MIG-034/091: validation_layer.reviewer_role CHECK recreated with +tenant_member,+employee,+partner_admin,+system_auto';
END;

-- 3b) block_checkpoint.checkpoint_type: bestehend
--     ('questionnaire_submit','meeting_final','backspelling_recondense')
--     wird erweitert um auto_final.
DECLARE
  v_constraint_name text;
BEGIN
  SELECT c.conname INTO v_constraint_name
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
   WHERE c.conrelid = 'public.block_checkpoint'::regclass
     AND c.contype = 'c'
     AND a.attname = 'checkpoint_type';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.block_checkpoint DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped block_checkpoint.checkpoint_type CHECK: %', v_constraint_name;
  END IF;

  ALTER TABLE public.block_checkpoint
    ADD CONSTRAINT block_checkpoint_checkpoint_type_check
    CHECK (checkpoint_type IN (
      'questionnaire_submit', 'meeting_final', 'backspelling_recondense', 'auto_final'
    ));

  RAISE NOTICE 'MIG-034/091: block_checkpoint.checkpoint_type CHECK recreated with +auto_final';
END;

-- ============================================================
-- 4. Storage-Bucket partner-branding-assets + RLS
-- ============================================================
-- Privater Bucket (DEC-106 — Logos werden ueber Server-Proxy ausgeliefert,
-- nicht direkt vom Browser geladen). 500KB-Limit (Slice-Spec).
-- MIMEs: PNG / SVG / JPG.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'partner-branding-assets',
  'partner-branding-assets',
  false,
  524288,
  ARRAY['image/png', 'image/svg+xml', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

RAISE NOTICE 'MIG-034/091: partner-branding-assets bucket ensured';

-- INSERT: nur partner_admin in EIGENEN Tenant-Folder (Pfad-Praefix = partner_tenant_id).
DROP POLICY IF EXISTS partner_branding_assets_insert ON storage.objects;
CREATE POLICY partner_branding_assets_insert ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'partner-branding-assets'
    AND auth.user_role() = 'partner_admin'
    AND (storage.foldername(name))[1] = auth.user_tenant_id()::text
  );

-- UPDATE: nur partner_admin in EIGENEN Tenant-Folder (Overwrite bei Logo-Re-Upload).
DROP POLICY IF EXISTS partner_branding_assets_update ON storage.objects;
CREATE POLICY partner_branding_assets_update ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'partner-branding-assets'
    AND auth.user_role() = 'partner_admin'
    AND (storage.foldername(name))[1] = auth.user_tenant_id()::text
  )
  WITH CHECK (
    bucket_id = 'partner-branding-assets'
    AND auth.user_role() = 'partner_admin'
    AND (storage.foldername(name))[1] = auth.user_tenant_id()::text
  );

-- DELETE: partner_admin im EIGENEN Folder + strategaize_admin (Lifecycle/Cleanup).
DROP POLICY IF EXISTS partner_branding_assets_delete ON storage.objects;
CREATE POLICY partner_branding_assets_delete ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'partner-branding-assets'
    AND (
      (auth.user_role() = 'partner_admin'
        AND (storage.foldername(name))[1] = auth.user_tenant_id()::text)
      OR auth.user_role() = 'strategaize_admin'
    )
  );

-- KEINE SELECT-Policy auf storage.objects: Logo-Download laeuft ueber
-- Server-Proxy /api/partner-branding/[partner_tenant_id]/logo mit
-- service_role-Client (BYPASSRLS), und der Proxy macht RPC-Auth-Check
-- via rpc_get_branding_for_tenant. Browser darf NICHT direkt aus dem
-- Bucket lesen — auch nicht der eigene partner_admin. Defense-in-Depth.

RAISE NOTICE 'MIG-034/091: partner-branding-assets 3 storage policies (insert/update/delete) created';

-- ============================================================
-- 5. Backfill bestehender partner_organization-Tenants
-- ============================================================
-- Jeder Tenant mit tenant_kind='partner_organization' bekommt eine
-- Default-Branding-Row. Idempotent durch UNIQUE(partner_tenant_id)
-- + ON CONFLICT DO NOTHING. R-102-4 (Stub-Logik aus SLC-102 wird hierdurch
-- final abgeloest).
INSERT INTO public.partner_branding_config (partner_tenant_id, primary_color, display_name)
SELECT t.id, '#2563eb', po.display_name
  FROM public.tenants t
  LEFT JOIN public.partner_organization po ON po.tenant_id = t.id
 WHERE t.tenant_kind = 'partner_organization'
ON CONFLICT (partner_tenant_id) DO NOTHING;

RAISE NOTICE 'MIG-034/091: backfill partner_branding_config completed';

END $mig034_step2$;
