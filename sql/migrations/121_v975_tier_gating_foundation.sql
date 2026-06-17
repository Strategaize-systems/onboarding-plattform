-- Migration 121: Onboarding-Plattform V9.75 — Tier-Gating Foundation
-- Datum: 2026-06-17
-- Slice: SLC-V9.75-A (FEAT-085 / BL-506)
-- Dependencies: 021 (capture_session), 031 (ai_jobs), 032/047/074 (Dispatch-RPCs), 035 (claim-RPC)
-- DEC-219/220/221 · ARCHITECTURE.md "## V9.75 Architecture Addendum" §3/§4/§5
--
-- Fuehrt das server-side erzwungene Stufen-Flag pro capture_session ein:
--   free=0 < blueprint=1 < handbook=2. Steuert, welche Worker-Jobs (= Capture-
--   Verarbeitung + Outputs) eine Session ausloesen darf. Schliesst ISSUE-097
--   (Entitlement-Loch: Diagnose-Mandant = Voll-Kunde-Rolle).
--
-- Diese Migration enthaelt die DB-Layer-Foundation (MT-1):
--   1. capture_session.tier (Entitlement-Flag) + ai_jobs.session_tier (Worker-Stempel)
--   2. Matrix-Single-Source: fn_tier_rank / fn_min_tier_for_job / fn_tier_allows /
--      fn_session_tier_allows
--   3. capture_session_tier_change_guard (BEFORE-UPDATE, service_role-aware) —
--      Reuse BS V8.14 SLC-912 profiles.role-Pattern (strategaize-pattern-reuse.md).
-- Die Dispatch-RPC-Guards (MT-2) + Claim-RPC-Erweiterung (MT-4) werden in dieser
-- Datei in den Folge-Micro-Tasks ergaenzt (CREATE OR REPLACE der 4 RPCs).
--
-- Schreibpfad-Hinweis (DEC-219-Refinement, MT-3): tier wird ausschliesslich via
--   service_role (createAdminClient) + strategaize_admin-TS-Guard gesetzt — analog
--   BS changeRole. KEINE SECURITY-DEFINER-RPC, weil eine DEFINER-Funktion als
--   Owner (postgres) laeuft und der service_role-aware Trigger postgres BLOCKT.
--
-- Rollback:
--   -- Dispatch-RPC-Guards (MT-2): die un-gated Bodies durch Re-Apply der Quell-
--   -- Migrationen wiederherstellen (CREATE OR REPLACE hat kein Auto-Drop):
--   --   \i sql/migrations/032_rpc_create_block_checkpoint.sql
--   --   \i sql/migrations/047_rpc_orchestrator_and_gaps.sql
--   --   \i sql/migrations/074_rpc_handbook.sql
--   DROP TRIGGER IF EXISTS capture_session_tier_change_guard ON capture_session;
--   DROP FUNCTION IF EXISTS capture_session_tier_change_guard();
--   DROP FUNCTION IF EXISTS fn_session_tier_allows(uuid, text);
--   DROP FUNCTION IF EXISTS fn_tier_allows(text, text);
--   DROP FUNCTION IF EXISTS fn_min_tier_for_job(text);
--   DROP FUNCTION IF EXISTS fn_tier_rank(text);
--   ALTER TABLE ai_jobs DROP COLUMN IF EXISTS session_tier;
--   ALTER TABLE capture_session DROP COLUMN IF EXISTS tier;

BEGIN;

-- ============================================================
-- 1. Schema: tier-Spalte + Worker-Stempel-Spalte
-- ============================================================

-- tier: NOT NULL DEFAULT 'handbook' backfillt Bestands-Sessions in EINEM ALTER
-- (Backward-Compat / Internal-Test-Mode bleibt voll funktional — DEC-219, R-A-4).
ALTER TABLE public.capture_session
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'handbook'
  CHECK (tier IN ('free', 'blueprint', 'handbook'));

COMMENT ON COLUMN public.capture_session.tier IS
  'V9.75 Entitlement-Stufe (free/blueprint/handbook). Schreibpfad nur service_role + strategaize_admin (Trigger-geschuetzt). DEC-219.';

-- session_tier: denormalisierter Stempel pro Job, damit der Worker ohne
-- capture_session-Join pruefen kann (Claim-RPC liefert keinen Session-Kontext).
-- Wird vom Dispatch (MT-2/MT-3) gesetzt; Folge-Pipeline-Jobs erben den Wert.
ALTER TABLE public.ai_jobs
  ADD COLUMN IF NOT EXISTS session_tier text NULL;

COMMENT ON COLUMN public.ai_jobs.session_tier IS
  'V9.75 Worker-Defense-Stempel: Tier der Session, die diesen Job ausloeste. NULL bei ungated/legacy. DEC-221.';

-- ============================================================
-- 2. Matrix-Single-Source (DEC-220, Operatives Stufen-Mapping §3)
-- ============================================================

-- Tier-Ordnung. Unbekannt/NULL -> -1 (fail-closed in Vergleichen).
CREATE OR REPLACE FUNCTION public.fn_tier_rank(p_tier text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_tier
           WHEN 'free'     THEN 0
           WHEN 'blueprint' THEN 1
           WHEN 'handbook' THEN 2
           ELSE -1
         END;
$$;

-- Minimum-Stufe pro job_type. NULL = ungated (immer erlaubt, z.B. lead_push_retry).
-- Single Source of Truth fuer das gesamte Gating (PL/pgSQL-RPCs, Worker, TS-Guard).
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

-- Reine Erlaubnispruefung gegen einen bekannten session_tier-Wert (Worker nutzt den Stempel).
CREATE OR REPLACE FUNCTION public.fn_tier_allows(p_session_tier text, p_job_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN public.fn_min_tier_for_job(p_job_type) IS NULL THEN true  -- ungated
           ELSE public.fn_tier_rank(p_session_tier)
                  >= public.fn_tier_rank(public.fn_min_tier_for_job(p_job_type))
         END;
$$;

-- Dispatch-Erlaubnispruefung: loest den Tier aus der Session auf (RPC-Guards + TS-Guard).
-- SECURITY DEFINER, damit die Pruefung den tier unabhaengig vom Caller-RLS-Kontext liest.
CREATE OR REPLACE FUNCTION public.fn_session_tier_allows(p_session_id uuid, p_job_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text;
BEGIN
  SELECT tier INTO v_tier FROM public.capture_session WHERE id = p_session_id;
  -- Session nicht gefunden -> v_tier NULL -> fn_tier_allows liefert false fuer gated jobs.
  RETURN public.fn_tier_allows(v_tier, p_job_type);
END;
$$;

-- Grants: pure Funktionen + Lookup fuer authenticated (TS-Guard) und service_role (Worker/RPC).
GRANT EXECUTE ON FUNCTION public.fn_tier_rank(text)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_min_tier_for_job(text)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_tier_allows(text, text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_session_tier_allows(uuid, text) TO authenticated, service_role;

-- ============================================================
-- 3. Column-Level-Schutz auf capture_session.tier (ISSUE-097-Kern)
-- ============================================================
-- RLS schuetzt NICHT column-level: die bestehende Policy
-- `capture_session_tenant_admin_write` (Migration 022) erlaubt tenant_admin, die
-- EIGENE Session-Row zu updaten — inkl. tier. Ein PATCH /rest/v1/capture_session
-- {tier:'handbook'} waere Self-Promotion zu Voll-Kunde. Fix = BEFORE-UPDATE-Trigger,
-- der jede tier-Aenderung blockt AUSSER der Aufrufer ist service_role.
-- Reuse BS V8.14 SLC-912 profiles.role-Pattern (current_user <> 'service_role').
--   - PostgREST authenticated/tenant_admin -> current_user='authenticated' -> BLOCK
--   - createAdminClient() service_role      -> current_user='service_role'  -> ALLOW
--   - direkter postgres-Superuser           -> current_user='postgres'      -> BLOCK
--     (Wartung via SET ROLE service_role oder Trigger temporaer disablen.)

CREATE OR REPLACE FUNCTION public.capture_session_tier_change_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tier IS DISTINCT FROM OLD.tier
     AND current_user <> 'service_role' THEN
    RAISE EXCEPTION
      'capture_session.tier change denied for role "%" (service_role required)', current_user
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_session_tier_change_guard ON public.capture_session;

CREATE TRIGGER capture_session_tier_change_guard
  BEFORE UPDATE ON public.capture_session
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_session_tier_change_guard();

-- ============================================================
-- 4. Dispatch-RPC-Guards (MT-2): Tier-Gate + session_tier-Stempel
-- ============================================================
-- Jede der drei Dispatch-RPCs, die einen gated ai_job enqueued, wird hier per
-- CREATE OR REPLACE neu definiert (volle Body-Kopie der Quell-Migration + Gate +
-- Stempel). Der Gate prueft VOR jeder Mutation via fn_tier_allows(<session.tier>,
-- job_type) gegen die Matrix-Single-Source; bei Verstoss RAISE EXCEPTION
-- 'tier_gate_denied' mit ERRCODE insufficient_privilege. Weil die RPCs SECURITY
-- DEFINER + atomar sind, rollt der Fehler eine eventuell schon geschriebene
-- Checkpoint-/Snapshot-Row mit zurueck — kein Halb-Zustand bleibt liegen.
-- session_tier wird denormalisiert auf den ai_job gestempelt (Worker-Defense MT-4,
-- DEC-221). Der Tier-Wert wird aus der ohnehin geladenen Session/Checkpoint-Row
-- gezogen (kein zusaetzlicher fn_session_tier_allows-Lookup noetig).
--
--   rpc_create_block_checkpoint   (032) -> knowledge_unit_condensation  [blueprint]
--   rpc_enqueue_recondense_job    (047) -> recondense_with_gaps         [blueprint]
--   rpc_trigger_handbook_snapshot (074) -> handbook_snapshot_generation [handbook]
--
-- Die Claim-RPC-Erweiterung (035, session_tier im Return) folgt in MT-4.

-- ---- (032) rpc_create_block_checkpoint --------------------------------------
-- Quelle: sql/migrations/032_rpc_create_block_checkpoint.sql
CREATE OR REPLACE FUNCTION rpc_create_block_checkpoint(
  p_session_id    uuid,
  p_block_key     text,
  p_checkpoint_type text,
  p_content       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid;
  v_tenant_id     uuid;
  v_tier          text;
  v_content_canon text;
  v_content_hash  text;
  v_existing_id   uuid;
  v_checkpoint_id uuid;
  v_job_id        uuid;
BEGIN
  -- 1. Auth: User aus JWT
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  -- 2. Session laden (tenant + tier) + Tenant-Zugehoerigkeit pruefen
  SELECT tenant_id, tier INTO v_tenant_id, v_tier
  FROM capture_session
  WHERE id = p_session_id
    AND tenant_id = auth.user_tenant_id();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Session nicht gefunden oder kein Zugriff';
  END IF;

  -- 2b. V9.75 Tier-Gate (vor jeder Mutation; atomarer Rollback bei Verstoss).
  IF NOT fn_tier_allows(v_tier, 'knowledge_unit_condensation') THEN
    RAISE EXCEPTION 'tier_gate_denied: knowledge_unit_condensation requires min tier %, session tier is %',
      fn_min_tier_for_job('knowledge_unit_condensation'), v_tier
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Checkpoint-Type validieren
  IF p_checkpoint_type NOT IN ('questionnaire_submit', 'meeting_final') THEN
    RAISE EXCEPTION 'Ungueltiger Checkpoint-Typ: %', p_checkpoint_type;
  END IF;

  -- 4. Kanonischer Hash: jsonb_strip_nulls normalisiert, ::text ist deterministisch
  v_content_canon := jsonb_strip_nulls(p_content)::text;
  v_content_hash  := encode(digest(v_content_canon, 'sha256'), 'hex');

  -- 5. Idempotenz-Check: gleicher Block + gleicher Hash innerhalb 2s
  SELECT id INTO v_existing_id
  FROM block_checkpoint
  WHERE capture_session_id = p_session_id
    AND block_key = p_block_key
    AND content_hash = v_content_hash
    AND created_at > now() - interval '2 seconds';

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'checkpoint_id', v_existing_id,
      'job_id', NULL,
      'deduplicated', true
    );
  END IF;

  -- 6. Checkpoint schreiben
  INSERT INTO block_checkpoint (
    tenant_id, capture_session_id, block_key,
    checkpoint_type, content, content_hash, created_by
  )
  VALUES (
    v_tenant_id, p_session_id, p_block_key,
    p_checkpoint_type, p_content, v_content_hash, v_user_id
  )
  RETURNING id INTO v_checkpoint_id;

  -- 7. Verdichtungs-Job enqueuen (mit session_tier-Stempel)
  INSERT INTO ai_jobs (tenant_id, job_type, payload, session_tier)
  VALUES (
    v_tenant_id,
    'knowledge_unit_condensation',
    jsonb_build_object('block_checkpoint_id', v_checkpoint_id),
    v_tier
  )
  RETURNING id INTO v_job_id;

  -- 8. Ergebnis
  RETURN jsonb_build_object(
    'checkpoint_id', v_checkpoint_id,
    'job_id', v_job_id,
    'deduplicated', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_create_block_checkpoint(uuid, text, text, jsonb)
  TO authenticated;

-- ---- (047) rpc_enqueue_recondense_job ---------------------------------------
-- Quelle: sql/migrations/047_rpc_orchestrator_and_gaps.sql (nur diese RPC)
CREATE OR REPLACE FUNCTION rpc_enqueue_recondense_job(
  p_checkpoint_id uuid,
  p_gap_question_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_checkpoint RECORD;
  v_tier       text;
  v_job_id     uuid;
BEGIN
  SELECT id, tenant_id, capture_session_id
  INTO v_checkpoint
  FROM public.block_checkpoint
  WHERE id = p_checkpoint_id;

  IF v_checkpoint IS NULL THEN
    RAISE EXCEPTION 'Checkpoint % not found', p_checkpoint_id;
  END IF;

  -- V9.75 Tier-Gate (Stufe blueprint). Session-Tier ueber den Checkpoint aufloesen.
  SELECT tier INTO v_tier
  FROM public.capture_session
  WHERE id = v_checkpoint.capture_session_id;

  IF NOT public.fn_tier_allows(v_tier, 'recondense_with_gaps') THEN
    RAISE EXCEPTION 'tier_gate_denied: recondense_with_gaps requires min tier %, session tier is %',
      public.fn_min_tier_for_job('recondense_with_gaps'), v_tier
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ai_jobs (
    tenant_id, job_type, status, payload, session_tier
  ) VALUES (
    v_checkpoint.tenant_id,
    'recondense_with_gaps',
    'pending',
    jsonb_build_object(
      'block_checkpoint_id', p_checkpoint_id,
      'capture_session_id', v_checkpoint.capture_session_id,
      'gap_question_ids', to_jsonb(p_gap_question_ids)
    ),
    v_tier
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('job_id', v_job_id);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_enqueue_recondense_job(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION rpc_enqueue_recondense_job(uuid, uuid[]) TO authenticated;

-- ---- (074) rpc_trigger_handbook_snapshot ------------------------------------
-- Quelle: sql/migrations/074_rpc_handbook.sql (nur diese RPC)
CREATE OR REPLACE FUNCTION public.rpc_trigger_handbook_snapshot(
  p_capture_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role        text;
  v_caller_tenant      uuid;
  v_caller_id          uuid;
  v_session            public.capture_session%ROWTYPE;
  v_template_version   text;
  v_snapshot_id        uuid;
BEGIN
  v_caller_id     := auth.uid();
  v_caller_role   := auth.user_role();
  v_caller_tenant := auth.user_tenant_id();

  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  IF v_caller_role NOT IN ('tenant_admin', 'strategaize_admin') THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  IF p_capture_session_id IS NULL THEN
    RETURN jsonb_build_object('error', 'capture_session_id_required');
  END IF;

  SELECT * INTO v_session
    FROM public.capture_session
   WHERE id = p_capture_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'capture_session_not_found');
  END IF;

  -- Cross-Tenant-Schutz fuer tenant_admin
  IF v_caller_role = 'tenant_admin' AND v_session.tenant_id <> v_caller_tenant THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- V9.75 Tier-Gate (Stufe handbook). Verstoss = harter Fehler -> atomarer
  -- Rollback, weder handbook_snapshot- noch ai_jobs-Row bleibt liegen.
  IF NOT public.fn_tier_allows(v_session.tier, 'handbook_snapshot_generation') THEN
    RAISE EXCEPTION 'tier_gate_denied: handbook_snapshot_generation requires min tier %, session tier is %',
      public.fn_min_tier_for_job('handbook_snapshot_generation'), v_session.tier
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_template_version := COALESCE(v_session.template_version, 'unknown');

  -- INSERT handbook_snapshot
  INSERT INTO public.handbook_snapshot (
    tenant_id,
    capture_session_id,
    template_id,
    template_version,
    status,
    generated_by_user_id
  ) VALUES (
    v_session.tenant_id,
    p_capture_session_id,
    v_session.template_id,
    v_template_version,
    'generating',
    v_caller_id
  )
  RETURNING id INTO v_snapshot_id;

  -- INSERT ai_jobs (Worker pickt via claim-loop) mit session_tier-Stempel
  INSERT INTO public.ai_jobs (
    tenant_id,
    job_type,
    payload,
    status,
    session_tier
  ) VALUES (
    v_session.tenant_id,
    'handbook_snapshot_generation',
    jsonb_build_object('handbook_snapshot_id', v_snapshot_id),
    'pending',
    v_session.tier
  );

  RETURN jsonb_build_object('handbook_snapshot_id', v_snapshot_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_trigger_handbook_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_trigger_handbook_snapshot(uuid) TO service_role;

-- ============================================================
-- 5. MT-4 (Folge-Micro-Task, in dieser Datei ergaenzt):
--    - CREATE OR REPLACE rpc_claim_next_ai_job_for_type (+ session_tier im Return)
-- ============================================================

-- Schema-Cache-Reload (neue Spalten/Funktionen fuer PostgREST sichtbar machen).
NOTIFY pgrst, 'reload schema';

COMMIT;
