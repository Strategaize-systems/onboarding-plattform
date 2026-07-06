-- MIG-131 — V10.3 Rollen-Cleanup (DEC-263/264)
-- Datum: 2026-07-06
-- MIG-Doc-ID: MIG-131
-- DECs: DEC-263 (Rollen-Modell-Konsolidierung: tenant_owner + tenant_member entfallen,
--       verbleibend strategaize_admin/tenant_admin/employee/partner_admin);
--       DEC-264 (Rebuild vom LIVE-Stand, NIE aus alten Migration-Files).
--
-- QUELLE DER WAHRHEIT: Live-pg_policies-Dump vom 2026-07-06 (18 Policies).
-- Einzige Aenderung an jeder Policy: 'tenant_owner'::text und 'tenant_member'::text
-- aus den ARRAY-Literalen entfernt. Wird ein ARRAY dadurch einelementig, in einen
-- einfachen '='-Vergleich umgeschrieben (auth.user_role() = 'tenant_admin').
--
-- Was diese Migration tut (in Reihenfolge):
--   1. Defensiv: profiles.role='tenant_member' -> 'employee' (live 0 Rows, Sicherheitsnetz).
--   2. profiles_role_check neu ohne tenant_member (4 Werte).
--   3. handle_new_user() neu ohne tenant_member in beiden Rollen-Listen.
--   4. 18 RLS-Policies bereinigt (DROP + CREATE je Policy).
--
-- Idempotent: UPDATE ist wiederholbar; DROP CONSTRAINT/POLICY IF EXISTS + ADD/CREATE;
--   CREATE OR REPLACE FUNCTION.
--
-- Apply-Procedure (per .claude/rules/sql-migration-hetzner.md, im /deploy, VOR Redeploy):
--   1. base64 -w 0 sql/migrations/131_v103_role_cleanup.sql
--   2. ssh root@<server> "echo 'BASE64' | base64 -d > /tmp/m131.sql"
--   3. ssh root@<server> "docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m131.sql"
--
-- Rollback: aus dem alten Live-Dump (mit tenant_owner/tenant_member) re-applyen.

-- ============================================================
-- Schritt 1 — Defensiver Daten-Fix (VOR neuem CHECK)
-- ============================================================
UPDATE public.profiles SET role = 'employee' WHERE role = 'tenant_member';

-- ============================================================
-- Schritt 2 — profiles_role_check ohne tenant_member (4 Werte)
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['strategaize_admin'::text, 'tenant_admin'::text, 'employee'::text, 'partner_admin'::text]));

-- ============================================================
-- Schritt 3 — handle_new_user() neu (Rollen-Listen ohne tenant_member)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_tenant_id uuid;
  v_role      text;
BEGIN
  v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid;
  v_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'tenant_admin');

  IF v_role NOT IN ('strategaize_admin', 'tenant_admin', 'employee', 'partner_admin') THEN
    RAISE EXCEPTION 'handle_new_user: invalid role: %', v_role
      USING ERRCODE = 'P0400';
  END IF;

  IF v_role IN ('tenant_admin', 'employee', 'partner_admin') THEN
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'handle_new_user: tenant_id required for role %', v_role
        USING ERRCODE = 'P0422';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id) THEN
      RAISE EXCEPTION 'handle_new_user: tenant % does not exist', v_tenant_id
        USING ERRCODE = 'P0404';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, tenant_id, email, role)
  VALUES (NEW.id, v_tenant_id, NEW.email, v_role);

  RETURN NEW;
END;
$$;

-- ============================================================
-- Schritt 4 — RLS-Policies bereinigt (18 Policies, DROP + CREATE je Policy)
-- ============================================================

-- 1/18 ai_cost_ledger.ai_cost_ledger_tenant_read (SELECT) — 3->1 Rolle, ANY->=
DROP POLICY IF EXISTS ai_cost_ledger_tenant_read ON public.ai_cost_ledger;
CREATE POLICY ai_cost_ledger_tenant_read ON public.ai_cost_ledger
  FOR SELECT TO authenticated
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 2/18 ai_jobs.ai_jobs_tenant_admin_insert (INSERT) — nur WITH CHECK, 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS ai_jobs_tenant_admin_insert ON public.ai_jobs;
CREATE POLICY ai_jobs_tenant_admin_insert ON public.ai_jobs
  FOR INSERT TO authenticated
  WITH CHECK ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 3/18 ai_jobs.ai_jobs_tenant_read (SELECT) — 3->1 Rolle, ANY->=
DROP POLICY IF EXISTS ai_jobs_tenant_read ON public.ai_jobs;
CREATE POLICY ai_jobs_tenant_read ON public.ai_jobs
  FOR SELECT TO authenticated
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 4/18 block_checkpoint.block_checkpoint_tenant_read (SELECT) — 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS block_checkpoint_tenant_read ON public.block_checkpoint;
CREATE POLICY block_checkpoint_tenant_read ON public.block_checkpoint
  FOR SELECT TO authenticated
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 5/18 capture_session.capture_session_tenant_read (SELECT) — 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS capture_session_tenant_read ON public.capture_session;
CREATE POLICY capture_session_tenant_read ON public.capture_session
  FOR SELECT TO authenticated
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 6/18 dialogue_session.dialogue_session_tenant_read (SELECT) — 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS dialogue_session_tenant_read ON public.dialogue_session;
CREATE POLICY dialogue_session_tenant_read ON public.dialogue_session
  FOR SELECT TO public
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 7/18 evidence_chunk.evidence_chunk_tenant_read (SELECT) — 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS evidence_chunk_tenant_read ON public.evidence_chunk;
CREATE POLICY evidence_chunk_tenant_read ON public.evidence_chunk
  FOR SELECT TO public
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 8/18 evidence_chunk.evidence_chunk_tenant_update (UPDATE) — USING + WITH CHECK, 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS evidence_chunk_tenant_update ON public.evidence_chunk;
CREATE POLICY evidence_chunk_tenant_update ON public.evidence_chunk
  FOR UPDATE TO public
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()))
  WITH CHECK ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 9/18 evidence_file.evidence_file_tenant_insert (INSERT) — nur WITH CHECK, 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS evidence_file_tenant_insert ON public.evidence_file;
CREATE POLICY evidence_file_tenant_insert ON public.evidence_file
  FOR INSERT TO public
  WITH CHECK ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 10/18 evidence_file.evidence_file_tenant_read (SELECT) — 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS evidence_file_tenant_read ON public.evidence_file;
CREATE POLICY evidence_file_tenant_read ON public.evidence_file
  FOR SELECT TO public
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 11/18 gap_question.gap_question_tenant_read (SELECT) — 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS gap_question_tenant_read ON public.gap_question;
CREATE POLICY gap_question_tenant_read ON public.gap_question
  FOR SELECT TO authenticated
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 12/18 gap_question.gap_question_tenant_write (UPDATE) — USING + WITH CHECK, 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS gap_question_tenant_write ON public.gap_question;
CREATE POLICY gap_question_tenant_write ON public.gap_question
  FOR UPDATE TO authenticated
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()))
  WITH CHECK ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 13/18 knowledge_chunks.knowledge_chunks_tenant_read (SELECT) — 3->1 Rolle, ANY->=
DROP POLICY IF EXISTS knowledge_chunks_tenant_read ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_tenant_read ON public.knowledge_chunks
  FOR SELECT TO authenticated
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 14/18 knowledge_unit.knowledge_unit_tenant_read (SELECT) — 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS knowledge_unit_tenant_read ON public.knowledge_unit;
CREATE POLICY knowledge_unit_tenant_read ON public.knowledge_unit
  FOR SELECT TO authenticated
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 15/18 modul_output.modul_output_tenant_admin_update (UPDATE) — USING + WITH CHECK, 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS modul_output_tenant_admin_update ON public.modul_output;
CREATE POLICY modul_output_tenant_admin_update ON public.modul_output
  FOR UPDATE TO authenticated
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()))
  WITH CHECK ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 16/18 modul_output.modul_output_tenant_read (SELECT) — 3->1 Rolle, ANY->=
DROP POLICY IF EXISTS modul_output_tenant_read ON public.modul_output;
CREATE POLICY modul_output_tenant_read ON public.modul_output
  FOR SELECT TO authenticated
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

-- 17/18 partner_client_mapping.pcm_select_own_mandant (SELECT) — 3->2 Rollen, bleibt ANY
DROP POLICY IF EXISTS pcm_select_own_mandant ON public.partner_client_mapping;
CREATE POLICY pcm_select_own_mandant ON public.partner_client_mapping
  FOR SELECT TO authenticated
  USING ((auth.user_role() = ANY (ARRAY['tenant_admin'::text, 'employee'::text])) AND (client_tenant_id = auth.user_tenant_id()));

-- 18/18 validation_layer.validation_layer_tenant_read (SELECT) — 2->1 Rolle, ANY->=
DROP POLICY IF EXISTS validation_layer_tenant_read ON public.validation_layer;
CREATE POLICY validation_layer_tenant_read ON public.validation_layer
  FOR SELECT TO authenticated
  USING ((auth.user_role() = 'tenant_admin') AND (tenant_id = auth.user_tenant_id()));

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verifikation (auskommentiert)
-- ============================================================
-- CHECK-Def (soll 4 Werte ohne tenant_member/tenant_owner):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'profiles_role_check';
--
-- Policies mit tenant_member/tenant_owner (soll 0):
--   SELECT count(*) FROM pg_policies
--   WHERE (COALESCE(qual,'') || COALESCE(with_check,'')) LIKE '%tenant_member%'
--      OR (COALESCE(qual,'') || COALESCE(with_check,'')) LIKE '%tenant_owner%';
--
-- profiles mit role='tenant_member' (soll 0):
--   SELECT count(*) FROM public.profiles WHERE role = 'tenant_member';
