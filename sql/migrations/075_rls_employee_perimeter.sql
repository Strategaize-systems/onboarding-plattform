-- Migration 075: RLS-Perimeter fuer employee-Rolle
-- SLC-033 MT-8 — V4 Schema-Fundament (FEAT-022, R16, DEC-036)
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)
--
-- ZIEL
-- ====
-- Der employee darf AUSSCHLIESSLICH Rows sehen, die er selbst besitzt
-- (owner_user_id = auth.uid()) oder die zu seinen eigenen capture_sessions
-- gehoeren (via JOIN). KEIN SELECT auf block_diagnosis, sop, handbook_snapshot,
-- bridge_run, bridge_proposal, employee_invitation — implizit durch fehlende
-- employee-Policy auf diesen Tabellen (RLS default-deny).
--
-- WARUM DEFENSIV EXPLIZIT
-- =======================
-- Ein vergessener default-permissiver Fallback ist ein Datenleck (R16). Daher:
--   * Pro relevanter Tabelle EINE dedizierte employee_own-Policy (FOR SELECT).
--   * block_checkpoint zusaetzlich FOR INSERT (employee submittet eigene Bloecke).
--   * Jede Policy pruefed EXPLIZIT die Rolle ('employee') UND die Ownership.
--   * KEIN USING-Statement, das eine Rolle implizit vererbt.
--
-- VERIFIKATIONS-BEISPIELE (als Dokumentation, die RLS-Test-Matrix in MT-9 deckt ab)
-- =================================================================================
-- employee auf fremde capture_session:
--   SELECT COUNT(*) FROM capture_session WHERE id = '<andere-session>';
--   → erwartet: 0 rows (keine Policy trifft)
-- employee auf block_diagnosis (irgend-ein Row):
--   SELECT COUNT(*) FROM block_diagnosis;
--   → erwartet: 0 rows (keine employee-Policy auf block_diagnosis)
-- employee auf eigene capture_session:
--   SELECT COUNT(*) FROM capture_session WHERE owner_user_id = auth.uid();
--   → erwartet: >= 1 (employee_capture_session_own trifft)
-- employee INSERT block_checkpoint fuer eigene session:
--   INSERT INTO block_checkpoint (capture_session_id, ...) mit eigener session
--   → erwartet: OK (employee_block_checkpoint_own_insert trifft)
-- employee INSERT block_checkpoint fuer FREMDE session:
--   → erwartet: Permission-Error (Ownership-Check scheitert)

BEGIN;

-- =============================================
-- 1. capture_session: employee sieht nur eigene Sessions
-- =============================================
DROP POLICY IF EXISTS capture_session_employee_own ON public.capture_session;
CREATE POLICY capture_session_employee_own ON public.capture_session
  FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'employee'
    AND owner_user_id = auth.uid()
  );

-- UPDATE: employee darf eigene Session updaten (Autosave-Flow SLC-037).
-- Kein INSERT — capture_sessions werden durch tenant_admin (via rpc_approve_bridge_proposal)
-- oder strategaize_admin erstellt, nie direkt durch employee.
DROP POLICY IF EXISTS capture_session_employee_own_update ON public.capture_session;
CREATE POLICY capture_session_employee_own_update ON public.capture_session
  FOR UPDATE
  TO authenticated
  USING (
    auth.user_role() = 'employee'
    AND owner_user_id = auth.uid()
  )
  WITH CHECK (
    auth.user_role() = 'employee'
    AND owner_user_id = auth.uid()
  );

-- =============================================
-- 2. block_checkpoint: employee sieht + inserted nur Checkpoints der eigenen Sessions
-- =============================================
DROP POLICY IF EXISTS block_checkpoint_employee_own ON public.block_checkpoint;
CREATE POLICY block_checkpoint_employee_own ON public.block_checkpoint
  FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'employee'
    AND EXISTS (
      SELECT 1 FROM public.capture_session cs
       WHERE cs.id = block_checkpoint.capture_session_id
         AND cs.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS block_checkpoint_employee_own_insert ON public.block_checkpoint;
CREATE POLICY block_checkpoint_employee_own_insert ON public.block_checkpoint
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.user_role() = 'employee'
    AND EXISTS (
      SELECT 1 FROM public.capture_session cs
       WHERE cs.id = block_checkpoint.capture_session_id
         AND cs.owner_user_id = auth.uid()
    )
  );

-- =============================================
-- 3. knowledge_unit: employee sieht nur KUs zu eigenen Sessions
--    (Kein INSERT/UPDATE — KUs werden durch Worker via service_role geschrieben.)
-- =============================================
DROP POLICY IF EXISTS knowledge_unit_employee_own ON public.knowledge_unit;
CREATE POLICY knowledge_unit_employee_own ON public.knowledge_unit
  FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'employee'
    AND EXISTS (
      SELECT 1 FROM public.capture_session cs
       WHERE cs.id = knowledge_unit.capture_session_id
         AND cs.owner_user_id = auth.uid()
    )
  );

-- =============================================
-- 4. validation_layer: employee sieht nur eigene Audit-Rows (ueber knowledge_unit-Kette)
-- =============================================
DROP POLICY IF EXISTS validation_layer_employee_own ON public.validation_layer;
CREATE POLICY validation_layer_employee_own ON public.validation_layer
  FOR SELECT
  TO authenticated
  USING (
    auth.user_role() = 'employee'
    AND EXISTS (
      SELECT 1
        FROM public.knowledge_unit ku
        JOIN public.capture_session cs ON cs.id = ku.capture_session_id
       WHERE ku.id = validation_layer.knowledge_unit_id
         AND cs.owner_user_id = auth.uid()
    )
  );

COMMIT;
