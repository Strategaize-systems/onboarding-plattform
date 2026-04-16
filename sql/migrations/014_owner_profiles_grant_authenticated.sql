-- DEPRECATED by Migration 028_drop_owner_profiles.sql (2026-04-16, SLC-002d)
-- Der owner_profiles-GRANT-Teil dieser Migration ist obsolet, weil
-- die Tabelle selbst entfernt wurde. Der run_memory-GRANT-Teil bleibt
-- relevant (run_memory wird weiter genutzt). Diese Migration bleibt
-- als Historie — neue Deployments brauchen sie nicht mehr auszufuehren,
-- weil 028 die owner_profiles-Tabelle droppt und run_memory-GRANTs
-- bereits in anderen Migrationen mit abgedeckt sind.
--
-- Migration 014: GRANT für authenticated Rolle auf owner_profiles + run_memory
-- Datum: 2026-04-02
-- Grund: RLS-Policies existieren, aber ohne Table-Level GRANT kann authenticated
--        die Tabellen nicht lesen (identisches Problem wie ISSUE-001 bei service_role)

GRANT SELECT, INSERT, UPDATE ON owner_profiles TO authenticated;
GRANT SELECT ON run_memory TO authenticated;
