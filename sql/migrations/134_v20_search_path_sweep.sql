-- Migration 134: Onboarding-Plattform V20 — SECURITY DEFINER search_path-Sweep
-- Datum: 2026-07-09
-- Slice: SLC-193 (MT-4) · DEC-283 · ARCHITECTURE.md "## X. V20 Architecture" §X.4
-- Grundlage: /security-audit RPT-633 (SEC-001) — SECURITY-DEFINER-Funktionen ohne
--            explizites search_path sind anfaellig fuer search_path-Hijacking (eine
--            angreifer-kontrollierte gleichnamige Funktion/Tabelle in einem frueher
--            aufgeloesten Schema kann die Definer-Ausfuehrung kapern).
--
-- Ansatz (Plan-QA RPT-637, empfohlen): dynamischer DO-Block statt statischer ALTER-Liste.
-- Loopt ueber ALLE public-DEFINER-Funktionen OHNE search_path und setzt
-- `SET search_path = public, pg_catalog` — robust gegen Drift zwischen MT-0-Sweep-
-- Zeitpunkt und Apply-Zeitpunkt (faengt jede zwischenzeitlich hinzugekommene Funktion).
-- Extension-owned Funktionen (pg_depend deptype='e') werden ausgelassen. SECURITY-INVOKER-
-- Trigger-Guards (capture_session_/profiles_..._guard) sind prosecdef=false -> nicht betroffen.
--
-- MT-0-Erwartungswert (live 2026-07-09, 12 Funktionen; = Rest-Count-0-Gate-Referenz):
--   rpc_answer_gap_question, rpc_confirm_evidence_mapping, rpc_create_dialogue_session,
--   rpc_create_evidence_chunks, rpc_create_gap_questions, rpc_enqueue_recondense_job,
--   rpc_reject_evidence_mapping, rpc_save_dialogue_extraction, rpc_save_dialogue_transcript,
--   rpc_update_dialogue_consent, rpc_update_dialogue_status, rpc_update_evidence_file_status.
--
-- Body der Funktionen UNBERUEHRT (ALTER FUNCTION ... SET search_path re-parst den Body
-- nicht). Idempotent: nach dem 1. Lauf matcht keine Funktion mehr -> Loop leer.
--
-- Rollback (bewusst kein Auto-Rollback — search_path zu entfernen re-oeffnet die Luecke):
--   -- pro Funktion: ALTER FUNCTION public.<name>(<args>) RESET search_path;

BEGIN;

DO $sweep$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
        WHERE c LIKE 'search_path=%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_catalog', r.sig);
    v_count := v_count + 1;
    RAISE NOTICE 'MIG-134 search_path set: %', r.sig;
  END LOOP;
  RAISE NOTICE 'MIG-134 total functions hardened: %', v_count;
END
$sweep$;

COMMIT;
