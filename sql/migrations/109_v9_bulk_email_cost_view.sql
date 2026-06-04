-- Migration 109 — V9 SLC-167 MT-1 vw_bulk_email_cost_monthly View
--
-- Slice: SLC-167 — V9 Pattern-Extraktion + Curation-UI + Cost-Cap (FEAT-073)
-- ARCHITECTURE.md V9-Section DEC-182 (Cost-Cap-Enforcement-Flow):
--   "Lookup vw_bulk_email_cost_monthly fuer Tenant + aktueller Monat"
--   "Check: monatlicher Stand + Pre-Estimate > 100 EUR Hard-Cap?"
--
-- SICHERHEITS-HOTFIX:
--   Die View `vw_bulk_email_cost_monthly` wurde bereits in MIG-051/106
--   (SLC-165 MT-2b) angelegt — aber OHNE `security_invoker = true`. Default
--   security_definer = false in PostgreSQL bedeutet: View laeuft mit
--   View-Owner-Privilegien (postgres = Superuser = BYPASSRLS). Ein
--   authenticated-tenant-Admin haette Cross-Tenant-Cost-Daten gesehen.
--   MIG-054/109 droppt die alte View und ersetzt sie durch eine RLS-konforme
--   Variante mit security_invoker=true + getypten Output-Spalten (::date,
--   ::numeric(12,4), ::integer fuer stabile Type-Inference im Cost-Cap-Service).
--
-- Konsequenzen:
--   - tenant_admin sieht ab MIG-054/109 nur eigene Tenant-Monats-Summen.
--   - service_role hat BYPASSRLS und sieht weiterhin Cross-Tenant (Cron/Audit OK).
--   - Cost-Cap-Service MT-3 (`src/lib/bulk-email/cost-cap.ts → checkTenantMonthlyCap`)
--     kann ab jetzt ohne Risk-Wrapping aufrufen.
--
-- Pattern-Quelle: aequivalente einfache Aggregations-View, kein Strategaize-
-- Vorgaenger als 1:1-Reuse fuer die Security-Hardening. Aufbau folgt
-- PostgreSQL-Standard + RLS-Inheritance via WITH (security_invoker = true)
-- (Supabase-Konvention).
--
-- RLS-Verhalten:
--   security_invoker=true => View nutzt die Permissions+RLS-Policies des
--   Callers (authenticated-User), nicht des View-Erstellers. Damit erbt die
--   View automatisch die `auth_tenant_id() = tenant_id`-Policy von
--   email_bulk_run (siehe MIG-051/106 RLS-Block). Tenant-A sieht nur Tenant-A-
--   Aggregate, kein Cross-Tenant-Leak.
--
-- Filter `status != 'failed'`:
--   Failed Runs zaehlen nicht in den Monatsverbrauch — sie wurden ja
--   abgebrochen vor finaler Cost-Akkumulation. Verhindert dass eine fehl-
--   geschlagene 100 EUR Pattern-Extraktion den Tenant fuer den Monat sperrt.
--
-- Apply auf Hetzner per .claude/rules/sql-migration-hetzner.md:
--   1. base64 -w 0 sql/migrations/109_v9_bulk_email_cost_view.sql
--   2. ssh root@<server> "echo 'BASE64' | base64 -d > /tmp/m109.sql"
--   3. ssh root@<server> "docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m109.sql"
--   4. Verify:
--        \d+ public.vw_bulk_email_cost_monthly
--        SELECT * FROM vw_bulk_email_cost_monthly LIMIT 1;  -- als authenticated
--
-- Idempotent: DROP VIEW IF EXISTS + CREATE VIEW + GRANT.
-- DROP-first weil die alte MIG-051/106-View ohne security_invoker und mit
-- timestamptz/bigint-Typen existiert. CREATE OR REPLACE VIEW kann Spalten-
-- Typen nicht aendern, DROP + CREATE schon.

BEGIN;

DROP VIEW IF EXISTS public.vw_bulk_email_cost_monthly;

-- ─── View ───────────────────────────────────────────────────────────────
-- Aggregiert Pattern-Extraktion-Kosten + Pre-Filter-Kosten pro Tenant + Monat.
-- total_cost_eur ist GENERATED-Spalte (pre_filter + pattern_extraction).
CREATE VIEW public.vw_bulk_email_cost_monthly
WITH (security_invoker = true)
AS
SELECT
  tenant_id,
  date_trunc('month', created_at)::date AS month,
  SUM(total_cost_eur)::numeric(12, 4) AS total_cost_eur,
  COUNT(*)::integer AS run_count
FROM public.email_bulk_run
WHERE status <> 'failed'
GROUP BY tenant_id, date_trunc('month', created_at);

COMMENT ON VIEW public.vw_bulk_email_cost_monthly IS
  'V9 SLC-167 MT-1 (MIG-054/109): Monats-Aggregation der Bulk-Email-Kosten pro Tenant. Wird vom Cost-Cap-Service fuer Hard-Cap-Check (>100 EUR Tenant/Monat per DEC-182) gelesen. Erbt RLS via security_invoker=true aus email_bulk_run.';

-- ─── Grants ─────────────────────────────────────────────────────────────
-- authenticated: GF (tenant_admin) liest die View ueber RLS-Filter.
-- service_role: BYPASSRLS — Cron + Background-Jobs koennen Cross-Tenant-Audit.
GRANT SELECT ON public.vw_bulk_email_cost_monthly TO authenticated;
GRANT SELECT ON public.vw_bulk_email_cost_monthly TO service_role;

COMMIT;
