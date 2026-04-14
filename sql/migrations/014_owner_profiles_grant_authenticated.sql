-- Migration 014: GRANT für authenticated Rolle auf owner_profiles + run_memory
-- Datum: 2026-04-02
-- Grund: RLS-Policies existieren, aber ohne Table-Level GRANT kann authenticated
--        die Tabellen nicht lesen (identisches Problem wie ISSUE-001 bei service_role)

GRANT SELECT, INSERT, UPDATE ON owner_profiles TO authenticated;
GRANT SELECT ON run_memory TO authenticated;
