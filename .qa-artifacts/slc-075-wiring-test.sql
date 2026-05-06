-- SLC-075 /qa Wiring-Chain-Test gegen Coolify-Live-DB
-- Simuliert startWalkthroughSession() vollstaendig via service_role.
-- Pflicht-Pattern: BEGIN + ROLLBACK, keine permanenten Daten.
-- User: richard@bellaerts.de (employee in Demo-Tenant)
\set ON_ERROR_STOP on
BEGIN;

\echo '--- Step 1: Pick aeltestes Template (Self-Spawn-Action-Logik) ---'
SELECT id, slug, version FROM public.template ORDER BY created_at ASC LIMIT 1 \gset template_

\echo '--- Step 2: INSERT capture_session via service_role (analog admin.from(capture_session).insert) ---'
INSERT INTO public.capture_session (
  tenant_id, template_id, template_version, owner_user_id,
  status, capture_mode
) VALUES (
  '00000000-0000-0000-0000-0000000000de'::uuid,
  :'template_id'::uuid,
  :'template_version',
  '86304afb-2baa-443b-9670-fea7ac8762b1'::uuid,
  'open',
  'walkthrough'
) RETURNING id \gset capture_

\echo '--- Step 3: INSERT walkthrough_session via service_role ---'
INSERT INTO public.walkthrough_session (
  tenant_id, capture_session_id, recorded_by_user_id, status
) VALUES (
  '00000000-0000-0000-0000-0000000000de'::uuid,
  :'capture_id'::uuid,
  '86304afb-2baa-443b-9670-fea7ac8762b1'::uuid,
  'recording'
) RETURNING id, status, capture_session_id \gset walk_

\echo '--- Step 4: Verifikation als employee (RLS-Sichtperimeter) ---'
SET LOCAL request.jwt.claims = '{"sub":"86304afb-2baa-443b-9670-fea7ac8762b1","role":"authenticated"}';
SET LOCAL ROLE authenticated;

\echo '   capture_session SELECT als employee (sollte 1 Row zeigen):'
SELECT id, capture_mode, owner_user_id, status FROM public.capture_session WHERE id = :'capture_id'::uuid;

\echo '   walkthrough_session SELECT als employee (sollte 1 Row zeigen):'
SELECT id, recorded_by_user_id, status, capture_session_id FROM public.walkthrough_session WHERE id = :'walk_id'::uuid;

RESET ROLE;

\echo '--- Step 5: Verifikation als anderer employee (sollte 0 Rows zeigen, RLS Self-Only) ---'
-- Synthetic foreign user — wir lesen nur, kein INSERT
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000099","role":"authenticated"}';
SET LOCAL ROLE authenticated;

\echo '   walkthrough_session als foreign user (sollte 0 Rows):'
SELECT count(*) AS foreign_visible FROM public.walkthrough_session WHERE id = :'walk_id'::uuid;

RESET ROLE;

ROLLBACK;
\echo '--- ROLLBACK done — keine permanenten Daten ---'
