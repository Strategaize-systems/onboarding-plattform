-- Migration 117 — V9.1 SLC-V9.1-B MT-1 — Continuous-Cost-Cap Schema-Support (MIG-062)
--
-- Slice: SLC-V9.1-B — Continuous-Cost-Cap-Service + Pipeline-Trigger (FEAT-077)
-- Spec:  slices/SLC-V9.1-B-continuous-cost-cap.md
-- DECs:  DEC-197 (3-Schichten-Cost-Cap: Daily 5 + Monthly 100 + Per-Email > 0.50),
--        DEC-182 (Monthly-Cap-Reuse aus V9.0)
--
-- Diese Migration war im Slice-Spec NICHT als File gelistet — /backend hat zwei
-- harte Schema-Luecken gefunden, ohne die MT-2/MT-3/MT-4 zur Laufzeit gegen die
-- LIVE-DB fehlschlagen wuerden:
--   1. email_bulk_run.status CHECK (MIG-058/113) kennt 'paused' +
--      'awaiting_approval' NICHT. MT-3 setzt status='awaiting_approval'
--      (Per-Email-Approval-Pause), MT-2/MT-4 setzen status='paused'
--      (Cap-Hit-Pause). Ohne Erweiterung:
--      "new row violates check constraint email_bulk_run_status_check".
--   2. vw_bulk_email_cost_daily existiert nicht (V9.0 hat nur die Monthly-View
--      MIG-054/109). Die V9.1-Daily-Schicht (DEC-197) liest aus dieser View.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD; DROP VIEW IF EXISTS + CREATE.
--
-- Apply auf Hetzner per .claude/rules/sql-migration-hetzner.md (postgres-User).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. email_bulk_run.status CHECK — +2 Werte ('paused', 'awaiting_approval')
-- ─────────────────────────────────────────────────────────────────────────────
-- Bestand (MIG-058/113, 14 Werte): uploaded, parsing, parsed, pre_filtering,
--   pre_filtered, thread_redacting, thread_redacted, pattern_extracting,
--   pattern_extracted, curating, importing, completed, failed, continuous
-- V9.1-B ergaenzt (16 Werte total):
--   + paused             (Daily/Monthly-Cap-Hit -> Pipeline-Trigger pausiert Run)
--   + awaiting_approval  (Per-Email-Approval > Schwelle -> Worker pausiert vor Sonnet)
ALTER TABLE public.email_bulk_run
  DROP CONSTRAINT IF EXISTS email_bulk_run_status_check;

ALTER TABLE public.email_bulk_run
  ADD CONSTRAINT email_bulk_run_status_check CHECK (status IN (
    'uploaded',
    'parsing',
    'parsed',
    'pre_filtering',
    'pre_filtered',
    'thread_redacting',
    'thread_redacted',
    'pattern_extracting',
    'pattern_extracted',
    'curating',
    'importing',
    'completed',
    'failed',
    'continuous',
    'paused',
    'awaiting_approval'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. vw_bulk_email_cost_daily — Tages-Aggregation pro Tenant (DEC-197 Daily-Cap)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1:1-Mirror der vw_bulk_email_cost_monthly (MIG-054/109), nur date_trunc('day')
-- statt 'month'. security_invoker=true erbt RLS aus email_bulk_run (Tenant-A
-- sieht nur Tenant-A-Tagessummen, service_role Cross-Tenant fuer Cron).
-- Filter status != 'failed': abgebrochene Runs zaehlen nicht in den Tagesverbrauch.
DROP VIEW IF EXISTS public.vw_bulk_email_cost_daily;

CREATE VIEW public.vw_bulk_email_cost_daily
WITH (security_invoker = true)
AS
SELECT
  tenant_id,
  date_trunc('day', created_at)::date AS day,
  SUM(total_cost_eur)::numeric(12, 4) AS total_cost_eur,
  COUNT(*)::integer AS run_count
FROM public.email_bulk_run
WHERE status <> 'failed'
GROUP BY tenant_id, date_trunc('day', created_at);

COMMENT ON VIEW public.vw_bulk_email_cost_daily IS
  'V9.1 SLC-V9.1-B (MIG-062/117): Tages-Aggregation der Bulk-Email-Kosten pro Tenant. Wird vom Continuous-Cost-Cap-Service fuer den Daily-Cap-Check (>=5 EUR/Tag/Tenant, DEC-197) gelesen. Erbt RLS via security_invoker=true aus email_bulk_run.';

GRANT SELECT ON public.vw_bulk_email_cost_daily TO authenticated;
GRANT SELECT ON public.vw_bulk_email_cost_daily TO service_role;

COMMIT;
