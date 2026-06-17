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
-- 4. MT-2/MT-4 (Folge-Micro-Tasks, in dieser Datei ergaenzt):
--    - CREATE OR REPLACE rpc_create_block_checkpoint (+ Tier-Gate + session_tier-Stempel)
--    - CREATE OR REPLACE rpc_enqueue_recondense_job  (+ Tier-Gate + session_tier-Stempel)
--    - CREATE OR REPLACE rpc_trigger_handbook_snapshot (+ Tier-Gate + session_tier-Stempel)
--    - CREATE OR REPLACE rpc_claim_next_ai_job_for_type (+ session_tier im Return)
-- ============================================================

-- Schema-Cache-Reload (neue Spalten/Funktionen fuer PostgREST sichtbar machen).
NOTIFY pgrst, 'reload schema';

COMMIT;
