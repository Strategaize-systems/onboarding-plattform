-- Migration 028: Drop owner_profiles-Tabelle (Blueprint-Legacy)
-- Datum: 2026-04-16
-- Slice: SLC-002d Blueprint-Legacy-UI-Cleanup
-- Dependencies: Blueprint-Profile-Flow (UI + API + Lookups) komplett entfernt in SLC-002d
--
-- Kontext:
--   owner_profiles stammt aus dem Blueprint-Repo (Migration 012 + 014, "Frage Null"
--   fuer V2.2 LLM-Personalisierung). In der Onboarding-Plattform wird die
--   Owner-Profil-Erhebung in V2+ template-spezifisch neu gestaltet — die
--   Blueprint-Variante passt zum M&A-Exit-Readiness-Use-Case, nicht zum
--   allgemeinen Onboarding-Use-Case.
--
--   SLC-002d hat den /profile-UI-Flow, die entsprechende API-Route und alle
--   Lookups in llm.ts + runs-APIs entfernt. Diese Migration entfernt jetzt
--   die Tabelle selbst, damit keine Leichen in der DB stehen bleiben.
--
-- Idempotenz:
--   DROP TABLE IF EXISTS ... CASCADE — entfernt Tabelle + RLS-Policies +
--   abhaengige Constraints. Wenn die Tabelle bereits weg ist, ist das ein No-Op.
--
-- Ersetzt:
--   Migration 012 (CREATE owner_profiles) und
--   Migration 014 (GRANT authenticated auf owner_profiles)
--   — beide bleiben im Repo als Historie, bekommen DEPRECATED-Header.

BEGIN;

DROP TABLE IF EXISTS owner_profiles CASCADE;

COMMIT;
