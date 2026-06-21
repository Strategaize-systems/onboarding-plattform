-- Migration 124 — V10 SLC-169 StB Modul-Domaene-Schema (FEAT-091 / BL-510)
-- Datum: 2026-06-21
-- MIG-Doc-ID: MIG-124
-- DECs: DEC-233 (dedizierte modul_output-Tabelle), DEC-235 (job_type
--       module_output_synthesis, lean Fan-out + Bounded-Critic), DEC-239 (tier-gated).
-- ARCHITECTURE.md "## V10 Architecture Addendum" §4 (modul_output-DDL) + §9 (MIG-Skizze).
-- Dependencies: 021 (capture_session/block_checkpoint/tenants/template), 031 (ai_jobs),
--               035 (ai_cost_ledger / claim-RPC), 121 (fn_min_tier_for_job / Tier-Gating).
--
-- Was diese Migration tut (additiv, 0 Aenderung an bestehenden OP-Funktionen — SC-7):
--   Teil 1 (MT-1): CREATE TABLE modul_output (Output-Triple + KI-Hebel mit Reifegrad)
--     + 3 Indizes + RLS-Matrix (Zwei-Teil-USING tenant_id + Rolle; ai_draft-Writes nur
--       service_role via BYPASSRLS; Edit/Status-UPDATE tenant_admin) + GRANTs.
--   Teil 2 (MT-2): fn_min_tier_for_job um 'module_output_synthesis' -> 'blueprint' erweitert
--     + ai_jobs.job_type-CHECK + ai_cost_ledger.role-CHECK je um die neuen Werte erweitert
--     + rpc_enqueue_module_output(p_capture_session_id, p_modul_key) (tier-gated, Ownership-
--       Pre-Check, idempotenter Re-Enqueue-Schutz) + NOTIFY pgrst.
--
-- Fundament fuer SLC-174 (Synthese-Worker schreibt modul_output) + SLC-175 (Reader).
--
-- ───────────────────────────────────────────────────────────────────────────
-- R-169-1 (BLOCKING) — LIVE-Stand-Verifikation VOR dem Schreiben (2026-06-21,
-- IMP-1228-Disziplin, pg_get_constraintdef gegen Coolify-DB
-- supabase-db-bwkg80w04wgccos48gcws8cs):
--   - ai_jobs_job_type_check: 22 LIVE-Werte (MIG-111 hatte nur 19; live ergaenzt
--     'email_bulk_pipeline_trigger', 'email_bulk_retention_sweep', 'email_bulk_synthesis').
--     -> + 'module_output_synthesis' = 23.
--   - ai_cost_ledger_role_check: 21 LIVE-Werte (inkl. 'email_bulk_synthesis',
--     'email_bulk_critic'). -> + 'module_output_synthesis' + 'module_output_critic' = 23.
--     (DEC-235: Worker = lean Draft/Fan-out [synthesis] + Bounded-Critic [critic],
--      2 Cost-Ledger-Rollen analog email_bulk_synthesis/email_bulk_critic.)
--   Der CHECK-Rebuild geht vom LIVE-Stand aus, NICHT von einer Migrations-Datei.
--
-- DEVIATION (Rule 1/3, dokumentiert): Slice-AC-169-3 schreibt literal
--   status='queued'. Der LIVE ai_jobs_status_check kennt 'queued' NICHT
--   ('pending'|'claimed'|'running'|'completed'|'failed'|'cancelled') UND die
--   claim-Loop (rpc_claim_next_ai_job_for_type, MIG-121) claimt status='pending'.
--   'queued' wuerde sowohl die CHECK-Constraint verletzen als auch den Job fuer
--   den Worker unsichtbar machen. Daher status='pending' (konsistent mit allen
--   bestehenden Dispatch-RPCs 032/047/074/073).
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE,
--   CREATE OR REPLACE FUNCTION, DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.
--   2. Apply = 0 Drift (DB-Sidecar-Test deckt das ab).
--
-- Apply-Procedure (per .claude/rules/sql-migration-hetzner.md, im /deploy,
--   VOR Worker-Code-Redeploy — R-169-2):
--   1. base64 -w 0 sql/migrations/124_v10_stb_modul_domain.sql
--   2. ssh root@159.69.207.29 "echo 'BASE64' | base64 -d > /tmp/m124.sql"
--   3. ssh root@<server> "docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m124.sql"
--   4. Verify:
--        \d modul_output
--        SELECT pg_get_constraintdef(oid) FROM pg_constraint
--          WHERE conname IN ('ai_jobs_job_type_check','ai_cost_ledger_role_check');
--        SELECT fn_min_tier_for_job('module_output_synthesis');  -- erwartet 'blueprint'
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.rpc_enqueue_module_output(uuid, text);
--   DROP TABLE IF EXISTS public.modul_output;
--   -- fn_min_tier_for_job + CHECKs durch Re-Apply der Vorgaenger wiederherstellen
--   -- (CREATE OR REPLACE / DROP+ADD haben kein Auto-Undo):
--   --   \i sql/migrations/121_v975_tier_gating_foundation.sql   (fn_min_tier_for_job)
--   --   \i sql/migrations/120_v95_critic_role.sql                (ai_cost_ledger_role_check)
--   --   \i sql/migrations/111_..._role_and_job_type.sql + Folge  (ai_jobs_job_type_check)

BEGIN;

-- ============================================================
-- TEIL 1 (MT-1): modul_output — Tabelle + Indizes + RLS + GRANTs
-- ============================================================

-- Die einzige neue Kern-Tabelle der V10-Lieferdomaene. Exakt nach ARCHITECTURE §4.
-- output_kind 'entscheidung'|'standard'|'implementierungsschritt' = Output-Triple;
-- 'ki_hebel' = KI-Hebel-Eintrag (reifegrad 1-4 gesetzt). source-CHECK ergaenzt das
-- §4-dokumentierte Werteset (ai_draft|edited|manual) als Daten-Integritaet (Rule 2).
CREATE TABLE IF NOT EXISTS public.modul_output (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id),
  capture_session_id  uuid        NOT NULL REFERENCES public.capture_session(id),
  block_checkpoint_id uuid        REFERENCES public.block_checkpoint(id),  -- Herkunfts-Submission
  modul_key           text        NOT NULL,                               -- 'm04'|'m05'|'m06'
  output_kind         text        NOT NULL
    CHECK (output_kind IN ('entscheidung','standard','implementierungsschritt','ki_hebel')),
  title               text,
  body                text        NOT NULL,
  reifegrad           smallint    CHECK (reifegrad BETWEEN 1 AND 4),      -- nur bei output_kind='ki_hebel'
  evidence_refs       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  source              text        NOT NULL DEFAULT 'ai_draft'
    CHECK (source IN ('ai_draft','edited','manual')),
  status              text        NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','accepted','edited','rejected')),
  ai_job_id           uuid,                                              -- erzeugender Synthese-Job
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid
);

COMMENT ON TABLE public.modul_output IS
  'V10 StB-Vertikale Lieferdomaene: strukturierte Modul-Deliverables (Output-Triple + KI-Hebel mit Reifegrad). DEC-233. ai_draft-Writes nur service_role; tenant_admin editiert/akzeptiert.';

-- Indizes (AC-169-1): Reader-Pfade (Tenant-Scope, Session-Gruppierung, Modul-Filter).
CREATE INDEX IF NOT EXISTS idx_modul_output_tenant
  ON public.modul_output (tenant_id);
CREATE INDEX IF NOT EXISTS idx_modul_output_capture_session
  ON public.modul_output (capture_session_id);
CREATE INDEX IF NOT EXISTS idx_modul_output_modul_key
  ON public.modul_output (modul_key);

-- ─── RLS (AC-169-2) ───────────────────────────────────────────────────────
-- Matrix (Zwei-Teil-USING tenant_id = auth.user_tenant_id() + Rollen-Check):
--   - strategaize_admin: ALL cross-tenant (Audit/Verwaltung)
--   - tenant_admin/owner/member: SELECT eigener Tenant (Reader, Konsum-only SLC-175)
--   - tenant_admin/owner: UPDATE eigener Tenant (Edit/Status-Aenderung)
--   - INSERT (ai_draft): KEINE authenticated-Policy -> default-deny. Der Worker
--     schreibt via service_role (BYPASSRLS), NICHT ueber eine RLS-Policy.
ALTER TABLE public.modul_output ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modul_output_admin_full        ON public.modul_output;
DROP POLICY IF EXISTS modul_output_tenant_read       ON public.modul_output;
DROP POLICY IF EXISTS modul_output_tenant_admin_update ON public.modul_output;

CREATE POLICY modul_output_admin_full
  ON public.modul_output FOR ALL
  TO authenticated
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

CREATE POLICY modul_output_tenant_read
  ON public.modul_output FOR SELECT
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_owner', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY modul_output_tenant_admin_update
  ON public.modul_output FOR UPDATE
  TO authenticated
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_owner')
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() IN ('tenant_admin', 'tenant_owner')
    AND tenant_id = auth.user_tenant_id()
  );

-- GRANTs: authenticated nur SELECT+UPDATE (kein Tenant-INSERT/DELETE — ai_draft
-- entsteht ausschliesslich via service_role). RLS bleibt die Tenant-Bremse.
GRANT SELECT, UPDATE ON public.modul_output TO authenticated;
GRANT ALL           ON public.modul_output TO service_role;

-- ============================================================
-- TEIL 2 (MT-2): Tier-Mapping + CHECK-Erweiterung + Enqueue-RPC + NOTIFY
-- ============================================================

-- ─── 2a. fn_min_tier_for_job: + 'module_output_synthesis' -> 'blueprint' ────
-- Voller Body-Re-Create der Matrix-Single-Source (Quelle: MIG-121) + 1 neue Zeile.
-- DEC-239: module_output_synthesis ist tier-gated auf 'blueprint' (gleiche Stufe
-- wie diagnosis_generation — der StB braucht mindestens Blueprint-Entitlement).
CREATE OR REPLACE FUNCTION public.fn_min_tier_for_job(p_job_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_job_type
           -- Stufe 1 (Blueprint): Verdichtung + Diagnose + Self-Backspelling + Chef-Evidence + Bruecke
           WHEN 'knowledge_unit_condensation' THEN 'blueprint'
           WHEN 'diagnosis_generation'        THEN 'blueprint'
           WHEN 'recondense_with_gaps'        THEN 'blueprint'
           WHEN 'evidence_extraction'         THEN 'blueprint'
           WHEN 'bridge_generation'           THEN 'blueprint'
           -- V10 StB-Vertikale: Modul-Output-Synthese (DEC-235/DEC-239)
           WHEN 'module_output_synthesis'     THEN 'blueprint'
           -- Stufe 2 (Handbuch): Organisation + Lueckenschluss + Outputs
           WHEN 'dialogue_transcription'      THEN 'handbook'
           WHEN 'dialogue_extraction'         THEN 'handbook'
           WHEN 'walkthrough_stub_processing' THEN 'handbook'
           WHEN 'walkthrough_transcribe'      THEN 'handbook'
           WHEN 'walkthrough_redact_pii'      THEN 'handbook'
           WHEN 'walkthrough_extract_steps'   THEN 'handbook'
           WHEN 'walkthrough_map_subtopics'   THEN 'handbook'
           WHEN 'email_bulk_parse'            THEN 'handbook'
           WHEN 'email_bulk_pre_filter'       THEN 'handbook'
           WHEN 'email_bulk_thread_redact'    THEN 'handbook'
           WHEN 'email_bulk_pattern_extract'  THEN 'handbook'
           WHEN 'email_bulk_synthesis'        THEN 'handbook'
           WHEN 'sop_generation'              THEN 'handbook'
           WHEN 'handbook_snapshot_generation' THEN 'handbook'
           -- Ungated (kein Capture-/Output-Entitlement): lead_push_retry + alles Unbekannte
           ELSE NULL
         END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_min_tier_for_job(text) TO authenticated, service_role;

-- ─── 2b. ai_jobs.job_type CHECK: LIVE 22 Werte + 'module_output_synthesis' = 23 ─
-- Liste = LIVE-Stand 2026-06-21 (pg_get_constraintdef, R-169-1) + 1 neuer Wert.
ALTER TABLE public.ai_jobs
  DROP CONSTRAINT IF EXISTS ai_jobs_job_type_check;

ALTER TABLE public.ai_jobs
  ADD CONSTRAINT ai_jobs_job_type_check CHECK (
    job_type = ANY (ARRAY[
      'bridge_generation',
      'diagnosis_generation',
      'dialogue_extraction',
      'dialogue_transcription',
      'evidence_extraction',
      'handbook_snapshot_generation',
      'knowledge_unit_condensation',
      'recondense_with_gaps',
      'sop_generation',
      'walkthrough_extract_steps',
      'walkthrough_map_subtopics',
      'walkthrough_redact_pii',
      'walkthrough_stub_processing',
      'walkthrough_transcribe',
      'lead_push_retry',
      'email_bulk_parse',
      'email_bulk_pre_filter',
      'email_bulk_thread_redact',
      'email_bulk_pattern_extract',
      'email_bulk_pipeline_trigger',
      'email_bulk_retention_sweep',
      'email_bulk_synthesis',
      'module_output_synthesis'
    ]::text[])
  );

-- ─── 2c. ai_cost_ledger.role CHECK: LIVE 21 Werte + 2 neue = 23 ──────────────
-- DEC-235: Worker = Draft/Fan-out (role 'module_output_synthesis') + Bounded-Critic
-- (role 'module_output_critic'), analog email_bulk_synthesis/email_bulk_critic.
ALTER TABLE public.ai_cost_ledger
  DROP CONSTRAINT IF EXISTS ai_cost_ledger_role_check;

ALTER TABLE public.ai_cost_ledger
  ADD CONSTRAINT ai_cost_ledger_role_check CHECK (
    role IS NULL OR role = ANY (ARRAY[
      'analyst',
      'challenger',
      'chat',
      'memory',
      'embedding',
      'orchestrator',
      'sop_generator',
      'diagnosis_generator',
      'evidence_mapper',
      'dialogue_extractor',
      'bridge_engine',
      'walkthrough_pii_redactor',
      'walkthrough_step_extractor',
      'walkthrough_subtopic_mapper',
      'light_pipeline_block',
      'v8_1_augmentation',
      'email_bulk_pre_filter',
      'email_bulk_pii_redact',
      'email_bulk_pattern_extraction',
      'email_bulk_synthesis',
      'email_bulk_critic',
      'module_output_synthesis',
      'module_output_critic'
    ]::text[])
  );

-- ─── 2d. rpc_enqueue_module_output (AC-169-3) ───────────────────────────────
-- Tier-gated Enqueue-Pfad fuer die Modul-Output-Synthese. Pattern aus
-- rpc_create_block_checkpoint (032) / rpc_enqueue_recondense_job (047, MIG-121):
--   SECURITY DEFINER, Auth via auth.uid(), Ownership-Pre-Check (tenant), Tier-Gate
--   gegen die Matrix-Single-Source (atomarer Rollback bei Verstoss), session_tier-
--   Stempel auf den ai_job (Worker-Defense), idempotenter Re-Enqueue-Schutz.
CREATE OR REPLACE FUNCTION public.rpc_enqueue_module_output(
  p_capture_session_id uuid,
  p_modul_key          text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id        uuid;
  v_tenant_id      uuid;
  v_tier           text;
  v_existing_job   uuid;
  v_job_id         uuid;
BEGIN
  -- 1. Auth: User aus JWT
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. modul_key-Pflichtwert (Daten-Integritaet — kein NULL-Job).
  IF p_modul_key IS NULL OR length(trim(p_modul_key)) = 0 THEN
    RAISE EXCEPTION 'modul_key erforderlich';
  END IF;

  -- 3. Session laden (tenant + tier) + Tenant-Zugehoerigkeit pruefen (Ownership).
  SELECT tenant_id, tier INTO v_tenant_id, v_tier
  FROM public.capture_session
  WHERE id = p_capture_session_id
    AND tenant_id = auth.user_tenant_id();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Session nicht gefunden oder kein Zugriff';
  END IF;

  -- 4. Tier-Gate (DEC-239, vor jeder Mutation; atomarer Rollback bei Verstoss).
  IF NOT public.fn_tier_allows(v_tier, 'module_output_synthesis') THEN
    RAISE EXCEPTION 'tier_gate_denied: module_output_synthesis requires min tier %, session tier is %',
      public.fn_min_tier_for_job('module_output_synthesis'), v_tier
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5. Idempotenter Re-Enqueue-Schutz: laeuft fuer (Session, Modul) bereits ein
  --    nicht-terminaler Synthese-Job, denselben zurueckgeben (kein Doppel-Enqueue).
  --    Abgeschlossene Jobs matchen NICHT -> Stufe-2-Re-Synthese bleibt moeglich.
  SELECT id INTO v_existing_job
  FROM public.ai_jobs
  WHERE job_type = 'module_output_synthesis'
    AND status IN ('pending', 'claimed', 'running')
    AND payload->>'capture_session_id' = p_capture_session_id::text
    AND payload->>'modul_key' = p_modul_key
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_job IS NOT NULL THEN
    RETURN jsonb_build_object('job_id', v_existing_job, 'deduplicated', true);
  END IF;

  -- 6. Synthese-Job enqueuen (status='pending' fuer die claim-Loop; session_tier-Stempel).
  INSERT INTO public.ai_jobs (tenant_id, job_type, status, payload, session_tier)
  VALUES (
    v_tenant_id,
    'module_output_synthesis',
    'pending',
    jsonb_build_object(
      'capture_session_id', p_capture_session_id,
      'modul_key', p_modul_key
    ),
    v_tier
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('job_id', v_job_id, 'deduplicated', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_enqueue_module_output(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_enqueue_module_output(uuid, text) TO service_role;

-- ─── 2e. PostgREST Schema-Cache-Reload (AC-169-5) ───────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
