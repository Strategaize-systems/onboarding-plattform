-- Migration 130 — V10.1 SLC-181 SOP-Bruecke Provenance (FEAT-098 / BL-523)
-- Datum: 2026-07-04
-- MIG-Doc-ID: MIG-130
-- DECs: DEC-256 (SOP-Bruecke-Kontrakt: standard+implementierungsschritt -> sop,
--       duenne Provenance-Spalte statt reine Reuse; Founder 2026-07-04).
-- Dependencies: 042 (sop-Tabelle), 124 (modul_output-Tabelle).
--
-- Was diese Migration tut (additiv, 0 Aenderung an bestehenden sop-Rows/Funktionen):
--   1 nullable Provenance-Spalte `source_modul_output_id` auf `sop` (FK -> modul_output,
--   ON DELETE SET NULL: eine bridge-erzeugte SOP-Sektion ueberlebt das Loeschen/Re-
--   Synthetisieren ihrer Quell-Row, verliert nur die Herkunft) + eine (nicht-partielle)
--   UNIQUE-Index darauf. NULLs sind in Postgres per Default DISTINCT -> beliebig viele
--   Legacy-SOP-Rows (source NULL, vom sop_generation-Worker) bleiben erlaubt UND unberuehrt;
--   nur bridge-Rows (source != NULL) sind je Quell-Output eindeutig -> idempotenter
--   Bridge-Re-Run via INSERT ... ON CONFLICT (source_modul_output_id) DO NOTHING.
--   Non-partiell, damit ON CONFLICT (col) den Index sicher inferieren kann.
--
-- Legacy src/workers/sop/* + sop_generation-Job bleiben unberuehrt (DEC-253/D).
--
-- service_role hat bereits GRANT ALL auf sop (MIG-042) — neue Spalte erbt Table-Grants.
--
-- Apply-Procedure (per .claude/rules/sql-migration-hetzner.md, im /deploy, VOR Redeploy):
--   1. base64 -w 0 sql/migrations/130_v101_sop_bridge_provenance.sql
--   2. ssh root@159.69.207.29 "echo 'BASE64' | base64 -d > /tmp/m130.sql"
--   3. ssh root@<server> "docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres < /tmp/m130.sql"
--   4. Verify:
--        \d sop        -- source_modul_output_id vorhanden
--        SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_sop_source_modul_output';
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
--   2. Apply = 0 Drift.
--
-- Rollback:
--   DROP INDEX IF EXISTS public.uq_sop_source_modul_output;
--   ALTER TABLE public.sop DROP COLUMN IF EXISTS source_modul_output_id;

BEGIN;

ALTER TABLE public.sop
  ADD COLUMN IF NOT EXISTS source_modul_output_id uuid
    REFERENCES public.modul_output(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sop.source_modul_output_id IS
  'SLC-181 SOP-Bruecke: Herkunfts-modul_output einer bridge-erzeugten SOP-Sektion. NULL = Legacy-SOP (sop_generation-Worker). UNIQUE (NULLs DISTINCT) = idempotenter Bridge-Re-Run.';

-- Non-partiell: NULLs sind per Default DISTINCT (Legacy-Rows unbeschraenkt),
-- non-NULL je Quell-Output eindeutig; ON CONFLICT (col) inferierbar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sop_source_modul_output
  ON public.sop (source_modul_output_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
