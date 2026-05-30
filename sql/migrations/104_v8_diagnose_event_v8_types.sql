-- Migration 104 — V8 SLC-152 MT-2 — Erweitert diagnose_event-CHECK-Constraint
-- um 3 V8-spezifische Event-Types.
--
-- Hintergrund: Migration 100 (V7.2 SLC-139) hat diagnose_event mit einem
-- hardcoded CHECK-Constraint angelegt, der 9 V7.2-Event-Types erlaubt
-- (question_*, helper_text_open, session_*). SLC-152 MT-2 fuehrt drei neue
-- V8-spezifische Event-Types ein, die Server-Action-driven sind (NICHT vom
-- Browser-Tracker abgesetzt):
--
--   v8_report_generated   — finalizeMandantenReport SUI-Snapshot persistiert
--   v8_email_sent          — sendDiagnoseReportByEmail V8-Branch SMTP-Success
--   v8_pdf_render_failed   — renderMandantenReportV2Pdf wirft Error
--
-- Ohne diese Erweiterung wuerden INSERTs aus den V8-Track-Functions mit
-- "diagnose_event_event_type_check"-Constraint-Violation fehlschlagen.
--
-- Idempotent: DROP + ADD CONSTRAINT-Pattern. Bestehende V7.2-Rows bleiben
-- valide (alle V7.2-Werte sind in der neuen Liste enthalten).
--
-- Apply-Verifikation:
--   SELECT pg_get_constraintdef(conid) FROM pg_constraint
--   WHERE conname = 'diagnose_event_event_type_check';

BEGIN;

ALTER TABLE public.diagnose_event
  DROP CONSTRAINT IF EXISTS diagnose_event_event_type_check;

ALTER TABLE public.diagnose_event
  ADD CONSTRAINT diagnose_event_event_type_check
  CHECK (event_type IN (
    -- V7.2 (Migration 100)
    'question_start',
    'question_answer',
    'question_skip',
    'helper_text_open',
    'session_paused',
    'session_resumed',
    'session_abandoned',
    'session_completed',
    'session_heartbeat',
    -- V8 (Migration 104, SLC-152 MT-2)
    'v8_report_generated',
    'v8_email_sent',
    'v8_pdf_render_failed'
  ));

COMMIT;
