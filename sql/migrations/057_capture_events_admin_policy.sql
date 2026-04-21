-- Migration 057: Add admin cross-tenant access policy for capture_events
-- Root cause: strategaize_admin has no tenant_id, so tenant_select_own policy
-- returns no rows. All other tenant-scoped tables have an admin_full policy.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'capture_events' AND policyname = 'admin_full_capture_events'
  ) THEN
    CREATE POLICY admin_full_capture_events ON capture_events
      FOR ALL TO authenticated
      USING (auth.user_role() = 'strategaize_admin')
      WITH CHECK (auth.user_role() = 'strategaize_admin');
  END IF;
END $$;
