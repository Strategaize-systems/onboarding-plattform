-- Migration 027: Demo-Tenant als Seed-Row fuer Login-Smoke-Test
-- Datum: 2026-04-16
-- Slice: SLC-002b MT-1
-- Dependencies: SLC-001 (schema.sql -> tenants), SLC-002 (Rollen kanonisch)
-- Strategie-Kontext: DEC-011 trennt Tenant-Row (public-Schema, SQL-Migration)
--   von Auth-User-Seed (scripts/seed-admin.mjs via Supabase Admin-API).
--
-- Inhalt:
--   1 Zeile in public.tenants mit fester UUID (Konvention: '...00de' = Demo).
--   Kein Auth-User, keine Profile-Row — das erledigt scripts/seed-admin.mjs
--   nach dem Deploy ueber die offizielle Admin-API (bcrypt + identities korrekt).
--
-- Idempotenz:
--   ON CONFLICT (id) DO NOTHING — Re-Deploy laeuft sauber, aendert nichts.
--
-- Fixe UUID statt ENV:
--   '00000000-0000-0000-0000-0000000000de' ist Konvention der Plattform
--   (sprechend: "de" = Demo). scripts/seed-admin.mjs liest dieselbe UUID
--   als Konstante. Keine Postgres-Custom-Config, kein ENV-Leak in pg_stat.
--
-- Rollback:
--   DELETE FROM tenants WHERE id = '00000000-0000-0000-0000-0000000000de';
--   Cascade loescht abhaengige Profile/Capture-Rows (ON DELETE CASCADE).

BEGIN;

INSERT INTO public.tenants (id, name, language)
VALUES (
  '00000000-0000-0000-0000-0000000000de',
  'Demo Onboarding GmbH',
  'de'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================
-- Verifikation (nach Deploy manuell ausfuehren):
--   SELECT id, name, language FROM public.tenants
--    WHERE id = '00000000-0000-0000-0000-0000000000de';
--     -> 1 Zeile, Demo Onboarding GmbH, de
--   SELECT COUNT(*) FROM public.tenants;
--     -> 1 (V1-Baseline) oder N+1 (falls weitere Tenants bereits existieren)
-- ============================================================
