-- Migration 049: GRANT auf ai_jobs fuer authenticated + service_role
-- Fix: Migration 031 hat RLS-Policies erstellt, aber GRANT vergessen.
-- Ohne GRANT scheitert INSERT mit "permission denied for table ai_jobs".

GRANT ALL ON ai_jobs TO authenticated;
GRANT ALL ON ai_jobs TO service_role;
