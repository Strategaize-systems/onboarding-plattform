-- Migration 059: dialogue_session table + RLS + Indexes + GRANTs
-- SLC-028 MT-1 — Dialogue Session Backend (FEAT-019, DEC-025..029)
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)

DO $$ BEGIN

-- =============================================
-- 1. dialogue_session — Meeting-Session-Verwaltung
-- =============================================
CREATE TABLE IF NOT EXISTS public.dialogue_session (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES public.tenants ON DELETE CASCADE,
  capture_session_id      uuid        NOT NULL REFERENCES public.capture_session ON DELETE CASCADE,
  meeting_guide_id        uuid        REFERENCES public.meeting_guide ON DELETE SET NULL,
  jitsi_room_name         text        NOT NULL UNIQUE,
  status                  text        NOT NULL DEFAULT 'planned'
                                      CHECK (status IN (
                                        'planned',       -- Meeting erstellt, noch nicht gestartet
                                        'in_progress',   -- Meeting laeuft
                                        'recording',     -- Recording aktiv
                                        'completed',     -- Meeting beendet, Recording vorhanden
                                        'transcribing',  -- Whisper laeuft
                                        'processing',    -- KI-Extraktion laeuft
                                        'processed',     -- Fertig verarbeitet
                                        'failed'         -- Fehler in Pipeline
                                      )),
  participant_a_user_id   uuid        NOT NULL REFERENCES auth.users,
  participant_b_user_id   uuid        NOT NULL REFERENCES auth.users,
  recording_storage_path  text,       -- Pfad in Supabase Storage (recordings bucket)
  recording_duration_s    integer,    -- Dauer in Sekunden
  transcript              text,       -- Vollstaendiges Transkript (persistent, DEC-029)
  transcript_model        text,       -- z.B. 'whisper-medium'
  summary                 jsonb,      -- Strukturierte Meeting-Summary
  gaps                    jsonb,      -- Nicht besprochene Themen
  extraction_model        text,       -- z.B. 'claude-sonnet-4-20250514'
  extraction_cost_usd     numeric(10,6),
  consent_a               boolean     DEFAULT false,  -- DSGVO: Aufnahme-Einwilligung Teilnehmer A
  consent_b               boolean     DEFAULT false,  -- DSGVO: Aufnahme-Einwilligung Teilnehmer B
  started_at              timestamptz,
  ended_at                timestamptz,
  created_by              uuid        NOT NULL REFERENCES auth.users,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

RAISE NOTICE 'dialogue_session table created';

-- =============================================
-- 2. RLS
-- =============================================
ALTER TABLE public.dialogue_session ENABLE ROW LEVEL SECURITY;

-- strategaize_admin: full cross-tenant access
CREATE POLICY dialogue_session_admin_full ON public.dialogue_session
  FOR ALL
  USING (auth.user_role() = 'strategaize_admin')
  WITH CHECK (auth.user_role() = 'strategaize_admin');

-- tenant_admin + tenant_member: read own tenant (Teilnehmer muessen Summary sehen)
CREATE POLICY dialogue_session_tenant_read ON public.dialogue_session
  FOR SELECT
  USING (
    auth.user_role() IN ('tenant_admin', 'tenant_member')
    AND tenant_id = auth.user_tenant_id()
  );

-- tenant_admin: insert + update own tenant
CREATE POLICY dialogue_session_tenant_write ON public.dialogue_session
  FOR INSERT
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

CREATE POLICY dialogue_session_tenant_update ON public.dialogue_session
  FOR UPDATE
  USING (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  )
  WITH CHECK (
    auth.user_role() = 'tenant_admin'
    AND tenant_id = auth.user_tenant_id()
  );

RAISE NOTICE 'dialogue_session RLS policies created';

-- =============================================
-- 3. Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_dialogue_session_capture
  ON public.dialogue_session(capture_session_id);

CREATE INDEX IF NOT EXISTS idx_dialogue_session_tenant
  ON public.dialogue_session(tenant_id);

CREATE INDEX IF NOT EXISTS idx_dialogue_session_status
  ON public.dialogue_session(status) WHERE status NOT IN ('processed', 'failed');

RAISE NOTICE 'dialogue_session indexes created';

-- =============================================
-- 4. GRANTs
-- =============================================
GRANT ALL ON public.dialogue_session TO authenticated;
GRANT ALL ON public.dialogue_session TO service_role;

RAISE NOTICE 'dialogue_session grants applied';

-- =============================================
-- 5. updated_at trigger (reuse existing function from 021)
-- =============================================
DROP TRIGGER IF EXISTS trg_dialogue_session_set_updated_at ON public.dialogue_session;
CREATE TRIGGER trg_dialogue_session_set_updated_at
  BEFORE UPDATE ON public.dialogue_session
  FOR EACH ROW
  EXECUTE FUNCTION public._set_updated_at();

RAISE NOTICE 'dialogue_session updated_at trigger created';

END $$;
