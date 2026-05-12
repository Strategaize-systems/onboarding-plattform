-- Migration 091a: Align Strategaize-Default brand color to Style Guide V2 (#4454b8)
-- SLC-104 MT-6 (FEAT-044, DEC-NEU "Strategaize-Default-Brand-Color = Style Guide V2")
--
-- ZIEL
-- ====
-- 1) partner_branding_config.primary_color DEFAULT von '#2563eb' (Tailwind-Blue, arbitrary)
--    auf '#4454b8' (Style Guide V2 Strategaize-Brand-Primary).
-- 2) rpc_get_branding_for_tenant() v_default-Fallback-JSON von '#2563eb' auf '#4454b8'.
-- 3) Bestaetigt: 0 bestehende partner_branding_config-Rows in Production (Pre-Apply-Probe
--    ergab COUNT=0). Daher KEIN UPDATE-Statement auf existierende Rows noetig.
--    Sollte spaeter doch eine Row mit dem alten '#2563eb' auftauchen (z.B. aus Test-Daten
--    oder einem Re-Apply von 091): manueller UPDATE-Befehl unten in den Apply-Notizen.
--
-- HINTERGRUND
-- ===========
-- Migration 091 (SLC-104 MT-1..3) hat '#2563eb' als Strategaize-Default gesetzt — ein
-- arbitrary Tailwind-Blue-Wert, der NICHT mit dem Style-Guide-V2-Brand-Primary (#4454b8)
-- ueberein stimmt. Resolver in src/lib/branding/resolve.ts ist parallel auf #4454b8
-- umgestellt. Damit Direct-Client + Partner-ohne-Branding identisch zum Style Guide V2
-- aussehen, muss DB-seitig der RPC-Fallback und der Tabellen-Default angeglichen werden.
--
-- IDEMPOTENZ
-- ==========
-- ALTER COLUMN ... SET DEFAULT ist idempotent (overwrite).
-- CREATE OR REPLACE FUNCTION ist idempotent.
-- Re-Apply ist sicher und produziert keine Aenderung.
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/091a_align_strategaize_default_brand_color_styleguide_v2.sql
--   echo '<BASE64>' | base64 -d > /tmp/091a.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/091a.sql
--
-- PRE-APPLY-PROBE (Kontroll-Output)
-- =================================
--   SELECT COUNT(*) FROM partner_branding_config WHERE primary_color = '#2563eb';
--   -- Erwartet: 0
--   SELECT pg_get_functiondef('public.rpc_get_branding_for_tenant'::regproc::oid);
--   -- v_default soll '#2563eb' enthalten (pre-091a-Zustand)
--
-- POST-APPLY-VERIFIKATION
-- =======================
--   SELECT pg_get_expr(adbin, adrelid) FROM pg_attrdef
--    WHERE adrelid = 'public.partner_branding_config'::regclass
--      AND adnum = (SELECT attnum FROM pg_attribute
--                    WHERE attrelid = 'public.partner_branding_config'::regclass
--                      AND attname = 'primary_color');
--   -- Erwartet: '#4454b8'::text
--   SELECT public.rpc_get_branding_for_tenant(NULL);
--   -- Erwartet: {"logo_url": null, "primary_color": "#4454b8", "secondary_color": null,
--   --           "display_name": "Strategaize"}

DO $mig034_step2a$ BEGIN

-- ============================================================
-- 1. partner_branding_config.primary_color DEFAULT angleichen
-- ============================================================
ALTER TABLE public.partner_branding_config
  ALTER COLUMN primary_color SET DEFAULT '#4454b8';

RAISE NOTICE 'MIG-034/091a: partner_branding_config.primary_color DEFAULT angeglichen auf #4454b8';

-- Optionaler Cleanup (sollte 0 betreffen in Production):
-- UPDATE public.partner_branding_config SET primary_color = '#4454b8' WHERE primary_color = '#2563eb';

END $mig034_step2a$;

-- ============================================================
-- 2. RPC rpc_get_branding_for_tenant — v_default-JSON angleichen
-- ============================================================
-- CREATE OR REPLACE replaced unveraendert ausser v_default-Hex-Wert.
-- Logik (NULL-Input / Tenant-not-found / partner_client / partner_organization /
-- direct_client-Fallback / Branding-Row-not-found) ist bit-identisch zu 091.
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
    'primary_color',   '#4454b8',  -- SLC-104 MT-6 (091a): aligned to Style Guide V2 (was '#2563eb' in 091)
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

  -- Branding-Row laden (Default falls keine Row vorhanden)
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

-- Post-Apply Smoke (auskommentiert, im psql-Session manuell laufen lassen):
-- SELECT public.rpc_get_branding_for_tenant(NULL);
-- -- Erwartet: {"logo_url": null, "primary_color": "#4454b8", "secondary_color": null, "display_name": "Strategaize"}
