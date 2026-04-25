-- Migration 077: USAGE auf auth-Schema fuer authenticated + anon
-- SLC-036 QA-Discovery — fehlender USAGE-Grant blockierte RLS-Policies indirekt
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)
--
-- ROOT CAUSE
-- ==========
-- Auf der Live-Onboarding-DB war:
--   pg_namespace.nspacl fuer auth = {supabase_auth_admin=UC/supabase_auth_admin}
--   → KEIN USAGE-Grant fuer authenticated/anon.
--
-- Konsequenz: Wenn eine RLS-Policy `auth.user_role()` oder `auth.user_tenant_id()`
-- aufruft und der Caller die Funktion ueber den vollqualifizierten Pfad referenziert,
-- konnte Postgres die Funktion zwar via EXECUTE-Privilege aufrufen, aber das Schema
-- selbst nicht "sehen". In manchen Code-Pfaden funktionierte das durch search_path-
-- Resolution still — in anderen (besonders bei Cross-Schema-Function-Calls innerhalb
-- von Policy-Expressions) NICHT. Effekt: Policy-Evaluation lieferte stillschweigend
-- FALSE → empty result-set, kein Error.
--
-- Konkret aufgefallen bei MIG-024 (tenant_admin_select_tenant_profiles):
-- Policy enthaelt `auth.user_role() = 'tenant_admin' AND tenant_id = auth.user_tenant_id()`.
-- Ohne USAGE-Grant lieferte das selbst fuer korrekt eingeloggten tenant_admin null
-- Profile-Rows zurueck → /admin/team Aktive-Mitarbeiter leer, /admin/bridge
-- Edit-Dialog Mitarbeiter-Dropdown leer, ProposalCard "Noch nicht zugeordnet"
-- trotz gesetztem proposed_employee_user_id.
--
-- FIX
-- ===
-- GRANT USAGE ON SCHEMA auth TO authenticated, anon.
-- Idempotent (GRANT-only, kein REVOKE).
-- Standard-Supabase-Setup (sollte ab self-hosted-Init bereits da sein —
-- in unserer Instanz war es nicht).
--
-- ROLLBACK
-- ========
-- REVOKE USAGE ON SCHEMA auth FROM anon, authenticated;
-- (NICHT empfohlen — bricht alle Auth-abhaengigen RLS-Policies wieder.)

BEGIN;

GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO anon;

COMMIT;
