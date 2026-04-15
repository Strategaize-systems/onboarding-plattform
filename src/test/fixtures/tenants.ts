import type { Client } from "pg";

export interface SeededTenants {
  tenantA: string;
  tenantB: string;
  /** auth.users.id fuer den tenant_admin von Tenant A. */
  userA: string;
  /** auth.users.id fuer den tenant_admin von Tenant B. */
  userB: string;
  /** Default-Template, an das capture_sessions gebunden werden. */
  templateId: string;
  templateVersion: string;
}

/**
 * Legt ein Default-Template + zwei Tenants + je einen tenant_admin-User an.
 * Nutzt den `handle_new_user`-Trigger auf `auth.users`, damit `profiles`
 * automatisch mit passender `tenant_id` und `role` erzeugt wird.
 *
 * Muss innerhalb einer Transaktion laufen (siehe `withTestDb`) — bei
 * ROLLBACK werden alle Rows verworfen, sodass die DB nach jedem Test
 * clean bleibt.
 */
export async function seedTestTenants(client: Client): Promise<SeededTenants> {
  const tenantInsert = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language)
     VALUES ($1, 'de'), ($2, 'de')
     RETURNING id`,
    ["Test Tenant A", "Test Tenant B"]
  );
  const [tenantA, tenantB] = tenantInsert.rows.map((r) => r.id);

  const templateInsert = await client.query<{ id: string; version: string }>(
    `INSERT INTO public.template (slug, name, version, blocks)
     VALUES ('test-template-' || substr(gen_random_uuid()::text, 1, 8),
             'Test Template', '1.0.0', '[]'::jsonb)
     RETURNING id, version`
  );
  const templateId = templateInsert.rows[0].id;
  const templateVersion = templateInsert.rows[0].version;

  // auth.users-INSERT mit minimalen Feldern. Trigger `on_auth_user_created`
  // liest raw_user_meta_data.tenant_id + role und legt das public.profiles an.
  const userInsert = await client.query<{ id: string }>(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at
     )
     VALUES
       ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
        'authenticated', 'authenticated',
        'test-admin-a-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
        '{}'::jsonb, jsonb_build_object('tenant_id', $1::text, 'role', 'tenant_admin'),
        now(), now()),
       ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
        'authenticated', 'authenticated',
        'test-admin-b-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
        '{}'::jsonb, jsonb_build_object('tenant_id', $2::text, 'role', 'tenant_admin'),
        now(), now())
     RETURNING id`,
    [tenantA, tenantB]
  );
  const [userA, userB] = userInsert.rows.map((r) => r.id);

  return { tenantA, tenantB, userA, userB, templateId, templateVersion };
}
