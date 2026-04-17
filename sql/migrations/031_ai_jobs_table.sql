-- Migration 031: Onboarding-Plattform V1 — ai_jobs Queue-Tabelle
-- Datum: 2026-04-17
-- Slice: SLC-006 MT-1
-- Dependencies: 021 (capture schema)
--
-- Erstellt die Job-Queue-Tabelle fuer asynchrone KI-Verarbeitung.
-- Jobs werden in SLC-006 enqueued (Block-Submit), in SLC-008 verarbeitet (Worker).
-- Pattern: SKIP LOCKED Claim via RPC (kommt in SLC-008).

-- ============================================================
-- AI_JOBS — Job Queue
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants ON DELETE CASCADE,
  job_type        text        NOT NULL,
  payload         jsonb       NOT NULL DEFAULT '{}',
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'claimed', 'running', 'completed', 'failed', 'cancelled')),
  claimed_at      timestamptz,
  completed_at    timestamptz,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index fuer Worker-Polling: pending Jobs nach Erstellung sortiert
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status_created
  ON ai_jobs (status, created_at)
  WHERE status = 'pending';

-- Index fuer Tenant-Filter (Dashboard, Admin-Ansicht)
CREATE INDEX IF NOT EXISTS idx_ai_jobs_tenant
  ON ai_jobs (tenant_id, created_at DESC);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: Cross-Tenant Vollzugriff
CREATE POLICY "ai_jobs_admin_full"
  ON ai_jobs FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant_admin: Lesen eigener Jobs (fuer Status-Anzeige im UI)
CREATE POLICY "ai_jobs_tenant_read"
  ON ai_jobs FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

-- tenant_admin: INSERT eigener Jobs (defense-in-depth, Hauptweg ist RPC)
CREATE POLICY "ai_jobs_tenant_admin_insert"
  ON ai_jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.user_role() IN ('tenant_admin', 'tenant_owner')
    AND tenant_id = auth.user_tenant_id()
  );

-- Worker (service_role) bypassed RLS automatisch — kein separates Policy noetig.
