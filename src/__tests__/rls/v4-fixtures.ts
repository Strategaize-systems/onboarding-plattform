import type { Client } from "pg";

export interface V4Fixtures {
  tenantA: string;
  tenantB: string;
  templateId: string;
  templateVersion: string;
  // Per-Tenant: je ein User pro Rolle (strategaize_admin ist tenant-unabhaengig).
  strategaizeAdminUserId: string;
  tenantAdminAUserId: string;
  tenantMemberAUserId: string;
  employeeAUserId: string;
  tenantAdminBUserId: string;
  tenantMemberBUserId: string;
  employeeBUserId: string;
  // Eigene capture_session pro employee + je eine tenant_admin-Session pro Tenant.
  sessionAdminA: string;
  sessionAdminB: string;
  sessionEmployeeA: string;
  sessionEmployeeB: string;
}

/**
 * V4 Test-Fixtures fuer die RLS-Perimeter-Matrix.
 *
 * Erzeugt:
 *   - 2 Tenants (A, B)
 *   - 1 Template
 *   - 7 User (1 strategaize_admin + 3 pro Tenant: admin, member, employee)
 *   - 4 capture_sessions (1 admin-owned + 1 employee-owned pro Tenant)
 *
 * Muss innerhalb einer Transaktion laufen (siehe `withTestDb`). Nach ROLLBACK
 * sind alle Rows weg.
 */
export async function seedV4Fixtures(client: Client): Promise<V4Fixtures> {
  // Tenants
  const tenantInsert = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language)
     VALUES ($1, 'de'), ($2, 'de')
     RETURNING id`,
    ["V4 Test Tenant A", "V4 Test Tenant B"]
  );
  const [tenantA, tenantB] = tenantInsert.rows.map((r) => r.id);

  // Template (minimal)
  const templateInsert = await client.query<{ id: string; version: string }>(
    `INSERT INTO public.template (slug, name, version, blocks)
     VALUES ('v4-test-template-' || substr(gen_random_uuid()::text, 1, 8),
             'V4 Test Template', '1.0.0', '[]'::jsonb)
     RETURNING id, version`
  );
  const templateId = templateInsert.rows[0].id;
  const templateVersion = templateInsert.rows[0].version;

  // User anlegen. handle_new_user()-Trigger erzeugt die Profile.
  // strategaize_admin: tenant_id leer.
  const mkUser = async (
    label: string,
    role: "strategaize_admin" | "tenant_admin" | "tenant_member" | "employee",
    tenantId: string | null
  ): Promise<string> => {
    const metadata =
      role === "strategaize_admin"
        ? { role }
        : { role, tenant_id: tenantId };
    const res = await client.query<{ id: string }>(
      `INSERT INTO auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at
       )
       VALUES (
         '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
         'authenticated', 'authenticated',
         $1 || '-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
         '{}'::jsonb, $2::jsonb,
         now(), now()
       )
       RETURNING id`,
      [label, JSON.stringify(metadata)]
    );
    return res.rows[0].id;
  };

  const strategaizeAdminUserId = await mkUser("v4-sa", "strategaize_admin", null);
  // Profile fuer strategaize_admin zur Sicherheit explizit auf tenant_id=NULL setzen
  await client.query(
    `UPDATE public.profiles SET role = 'strategaize_admin', tenant_id = NULL WHERE id = $1`,
    [strategaizeAdminUserId]
  );

  const tenantAdminAUserId = await mkUser("v4-ta-a", "tenant_admin", tenantA);
  const tenantMemberAUserId = await mkUser("v4-tm-a", "tenant_member", tenantA);
  const employeeAUserId = await mkUser("v4-emp-a", "employee", tenantA);

  const tenantAdminBUserId = await mkUser("v4-ta-b", "tenant_admin", tenantB);
  const tenantMemberBUserId = await mkUser("v4-tm-b", "tenant_member", tenantB);
  const employeeBUserId = await mkUser("v4-emp-b", "employee", tenantB);

  // capture_sessions
  const mkSession = async (tenantId: string, ownerUserId: string): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.capture_session
         (tenant_id, template_id, template_version, owner_user_id, status)
       VALUES ($1, $2, $3, $4, 'open')
       RETURNING id`,
      [tenantId, templateId, templateVersion, ownerUserId]
    );
    return res.rows[0].id;
  };

  const sessionAdminA = await mkSession(tenantA, tenantAdminAUserId);
  const sessionAdminB = await mkSession(tenantB, tenantAdminBUserId);
  const sessionEmployeeA = await mkSession(tenantA, employeeAUserId);
  const sessionEmployeeB = await mkSession(tenantB, employeeBUserId);

  return {
    tenantA,
    tenantB,
    templateId,
    templateVersion,
    strategaizeAdminUserId,
    tenantAdminAUserId,
    tenantMemberAUserId,
    employeeAUserId,
    tenantAdminBUserId,
    tenantMemberBUserId,
    employeeBUserId,
    sessionAdminA,
    sessionAdminB,
    sessionEmployeeA,
    sessionEmployeeB,
  };
}
