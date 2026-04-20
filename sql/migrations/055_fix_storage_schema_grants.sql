-- Migration 055: Fix storage schema GRANTS for service_role
-- Root cause: Supabase Storage API does SET ROLE service_role inside transactions.
-- Without USAGE on the storage schema, the service_role cannot resolve unqualified
-- table names like "buckets" even when search_path includes "storage".
-- This caused all evidence uploads to fail with "relation buckets does not exist".

BEGIN;

-- service_role needs USAGE to resolve table names via search_path
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role;

-- Also grant to authenticated for storage policies (INSERT/SELECT/DELETE on objects)
GRANT USAGE ON SCHEMA storage TO authenticated;

-- Ensure future tables in storage schema are also accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT SELECT ON TABLES TO authenticated;

COMMIT;
