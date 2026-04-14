-- 008_delete_tenant_function.sql
-- Function to delete a tenant with all cascade data,
-- bypassing append-only triggers temporarily.
-- SECURITY DEFINER runs as postgres (superuser).
-- session_replication_role = 'replica' disables all triggers.

CREATE OR REPLACE FUNCTION delete_tenant_cascade(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET session_replication_role = 'replica'
AS $$
BEGIN
  DELETE FROM tenants WHERE id = p_tenant_id;
END;
$$;

-- Grant execute to service_role (used by adminClient)
GRANT EXECUTE ON FUNCTION delete_tenant_cascade(uuid) TO service_role;
