-- Migration 092a: SLC-106 MT-6 — Worker-Claim respektiert payload.scheduled_at
-- Datum: 2026-05-14
-- Slice: SLC-106 MT-6 (FEAT-046)
-- Dependencies: 035 (rpc_claim_next_ai_job_for_type original), 092 (lead_push_retry job_type)
--
-- ZIEL
-- ====
-- Erweiterung der bestehenden Claim-RPC um einen scheduled_at-Filter, damit
-- der Lead-Push-Retry-Worker NICHT sofort feuert, sondern den im payload
-- abgelegten Zeitpunkt respektiert (5min/30min Backoff laut DEC-112).
--
-- Backwards-kompatibel: ein NULL/fehlendes `payload.scheduled_at` (== alle 14
-- bestehenden Job-Types der V1..V5.x) bleibt sofort-claimbar. Nur Jobs mit
-- konkret gesetztem `scheduled_at` werden bis zur Faelligkeit zurueckgehalten.
--
-- HINTERGRUND
-- ===========
-- ai_jobs hat KEIN dediziertes scheduled_at-Feld (Schema 031), nur payload jsonb.
-- Wir koennten ein Feld nachruesten, aber das ist additive Overhead — alle
-- existierenden Inserts muessten NULL setzen, neue Indizes etc. Stattdessen:
-- RPC liest payload->>'scheduled_at' direkt. Die neue Variante laesst es bei
-- Jobs ohne dieses Feld wie bisher.
--
-- IDEMPOTENZ
-- ==========
-- CREATE OR REPLACE FUNCTION ueberschreibt die bestehende Funktion. Ein zweiter
-- Apply ist ein No-Op. EXECUTE-GRANT auf service_role wird neu vergeben (durch
-- CREATE OR REPLACE erhalten, aber explizit erneuert fuer Klarheit).
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/092a_ai_jobs_claim_scheduled_at_filter.sql
--   echo '<BASE64>' | base64 -d > /tmp/092a.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/092a.sql
--
-- PRE-APPLY-BACKUP-PFLICHT
-- ========================
--   docker exec <db-container> pg_dump -U postgres -d postgres \
--     --schema-only --function=public.rpc_claim_next_ai_job_for_type \
--     > /opt/onboarding-plattform-backups/pre-mig-092a_$(date +%Y%m%d_%H%M%S).sql
--   (oder volle Schema-Backup wenn pg_dump --function nicht unterstuetzt; Fallback:
--    pg_dump --schema-only > Backup mit allem.)
--
-- VERIFIKATION (nach Apply)
-- =========================
--   \df+ rpc_claim_next_ai_job_for_type
--     -> source enthaelt "payload->>'scheduled_at'"
--
--   -- Sanity-Smoke: ein lead_push_retry mit zukunftigem scheduled_at darf
--   -- NICHT geclaimt werden, mit Vergangenheit aber schon (RLS bypass via
--   -- service_role oder superuser).
--   SELECT id FROM ai_jobs WHERE job_type='lead_push_retry'
--     AND status='pending'
--     AND (payload->>'scheduled_at' IS NULL OR (payload->>'scheduled_at')::timestamptz <= now());

-- WICHTIG: Schema-qualifizieren — der postgres-User hat in Supabase-self-hosted
-- den search_path '"", storage, public, extensions'. Ohne explizites `public.`
-- landet die Function in `storage` (siehe IMP-Lehre 2026-05-14).
CREATE OR REPLACE FUNCTION public.rpc_claim_next_ai_job_for_type(p_job_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
BEGIN
  -- Claim aeltesten pending Job mit SKIP LOCKED (concurrency-safe).
  -- Faellige Faelligkeitspruefung:
  --   payload->>'scheduled_at' IS NULL  → klassischer Sofort-Job
  --   payload->>'scheduled_at' <= now() → Backoff-Zeit erreicht (SLC-106 Retry)
  SELECT id, tenant_id, job_type, payload, status, created_at
  INTO v_job
  FROM public.ai_jobs
  WHERE status = 'pending'
    AND job_type = p_job_type
    AND (
      payload->>'scheduled_at' IS NULL
      OR (payload->>'scheduled_at')::timestamptz <= now()
    )
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- Kein Job gefunden (oder noch nicht faellig)
  IF v_job IS NULL THEN
    RETURN NULL;
  END IF;

  -- Status auf claimed setzen
  UPDATE public.ai_jobs
  SET status = 'claimed',
      claimed_at = now()
  WHERE id = v_job.id;

  -- Job-Daten zurueckgeben
  RETURN jsonb_build_object(
    'id', v_job.id,
    'tenant_id', v_job.tenant_id,
    'job_type', v_job.job_type,
    'payload', v_job.payload,
    'created_at', v_job.created_at
  );
END;
$$;

-- Aufraeum-Statement: falls in einem vorherigen Apply (2026-05-14) versehentlich
-- eine `storage.rpc_claim_next_ai_job_for_type` angelegt wurde, entfernen wir
-- sie hier idempotent. Production-Workers nutzten weiterhin die public-Version,
-- die storage-Kopie war toter Code.
DROP FUNCTION IF EXISTS storage.rpc_claim_next_ai_job_for_type(text);

-- service_role behaelt EXECUTE (CREATE OR REPLACE preserved es bereits; explizit
-- nachreichen fuer Klarheit + Idempotenz).
GRANT EXECUTE ON FUNCTION public.rpc_claim_next_ai_job_for_type(text) TO service_role;
