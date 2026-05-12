import { describe, it, expect } from "vitest";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";

/**
 * V6 SLC-102 MT-5 — DB-Integration-Tests fuer Server Action
 * `updatePartnerStammdaten`.
 *
 * Pattern-Reuse aus partners-actions-db.test.ts (MT-1) + v6-partner-rls.test.ts
 * (SLC-101). Wir pruefen das RLS-Verhalten an `partner_organization`-UPDATE
 * pro Rolle/Tenant — der Server-Action-Pfad nutzt zwar service_role
 * (createAdminClient), bypasst also RLS, aber filtert mit
 * `WHERE tenant_id = profile.tenant_id`. Der Defense-in-Depth-RLS-Layer ist
 * trotzdem die kritische Schicht und wird hier verifiziert.
 *
 * 3 Slice-Spec-Faelle:
 *   1. Happy — partner_admin updated eigene Row (rowCount=1, Werte korrekt).
 *   2. Auth-Reject — tenant_member ohne partner_admin-Rolle wird durch RLS
 *      USING-Clause geblockt (rowCount=0, kein Permission-Denial dank
 *      table-level-GRANT).
 *   3. Cross-Tenant-Reject — partner_admin-A versucht UPDATE auf Partner-B-Row,
 *      RLS USING-Clause blockt (rowCount=0).
 */

interface StammdatenFixture {
  partnerATenant: string;
  partnerAOrgId: string;
  partnerAOrgInitialDisplayName: string;
  partnerAAdminUser: string;
  partnerBTenant: string;
  partnerBOrgId: string;
  partnerBAdminUser: string;
  unrelatedTenantAdminUser: string;
  unrelatedTenantId: string;
}

async function seedStammdatenFixture(client: Client): Promise<StammdatenFixture> {
  // Strategaize-Admin als Owner aller Inserts (created_by + created_by_admin_user_id).
  const saRes = await client.query<{ id: string }>(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     )
     VALUES (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated',
       'mt5-sa-' || substr(gen_random_uuid()::text, 1, 8) || '@v6.test', '',
       '{}'::jsonb, $1::jsonb,
       now(), now()
     )
     RETURNING id`,
    [JSON.stringify({ role: "strategaize_admin" })],
  );
  const sa = saRes.rows[0].id;
  await client.query(
    `UPDATE public.profiles SET role='strategaize_admin', tenant_id=NULL WHERE id=$1`,
    [sa],
  );

  // Partner-A Tenant + Org
  const pATenantRes = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, created_by)
     VALUES ('MT5 PartnerA', 'de', 'partner_organization', $1)
     RETURNING id`,
    [sa],
  );
  const partnerATenant = pATenantRes.rows[0].id;
  const partnerAOrgInitialDisplayName = "MT5 PartnerA Display";
  const pAOrgRes = await client.query<{ id: string }>(
    `INSERT INTO public.partner_organization
       (tenant_id, legal_name, display_name, partner_kind, contact_email,
        country, created_by_admin_user_id)
       VALUES ($1, 'MT5 PartnerA Legal', $2, 'tax_advisor',
               'mt5-a@kanzlei.local', 'DE', $3)
       RETURNING id`,
    [partnerATenant, partnerAOrgInitialDisplayName, sa],
  );
  const partnerAOrgId = pAOrgRes.rows[0].id;

  // Partner-B Tenant + Org
  const pBTenantRes = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, created_by)
     VALUES ('MT5 PartnerB', 'de', 'partner_organization', $1)
     RETURNING id`,
    [sa],
  );
  const partnerBTenant = pBTenantRes.rows[0].id;
  const pBOrgRes = await client.query<{ id: string }>(
    `INSERT INTO public.partner_organization
       (tenant_id, legal_name, display_name, partner_kind, contact_email,
        country, created_by_admin_user_id)
       VALUES ($1, 'MT5 PartnerB Legal', 'MT5 PartnerB Display', 'tax_advisor',
               'mt5-b@kanzlei.local', 'NL', $2)
       RETURNING id`,
    [partnerBTenant, sa],
  );
  const partnerBOrgId = pBOrgRes.rows[0].id;

  // partner_admin-User fuer A und B.
  async function mkPartnerAdmin(label: string, tenantId: string): Promise<string> {
    const res = await client.query<{ id: string }>(
      `INSERT INTO auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       )
       VALUES (
         '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
         'authenticated', 'authenticated',
         $1 || '-' || substr(gen_random_uuid()::text, 1, 8) || '@v6.test', '',
         '{}'::jsonb, $2::jsonb,
         now(), now()
       )
       RETURNING id`,
      [label, JSON.stringify({ role: "partner_admin", tenant_id: tenantId })],
    );
    const id = res.rows[0].id;
    // handle_new_user-Trigger sollte profile angelegt haben — sicherheits-UPSERT.
    await client.query(
      `INSERT INTO public.profiles (id, email, role, tenant_id)
         VALUES ($1, (SELECT email FROM auth.users WHERE id=$1),
                 'partner_admin', $2)
         ON CONFLICT (id) DO UPDATE
           SET role='partner_admin', tenant_id=$2`,
      [id, tenantId],
    );
    return id;
  }
  const partnerAAdminUser = await mkPartnerAdmin("mt5-pa-a", partnerATenant);
  const partnerBAdminUser = await mkPartnerAdmin("mt5-pa-b", partnerBTenant);

  // Unrelated tenant_admin (Direct-Client-Tenant) fuer Auth-Reject-Test.
  const dtRes = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, created_by)
     VALUES ('MT5 DirectTenant', 'de', $1)
     RETURNING id`,
    [sa],
  );
  const unrelatedTenantId = dtRes.rows[0].id;
  const dtAdminRes = await client.query<{ id: string }>(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     )
     VALUES (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated',
       'mt5-ta-' || substr(gen_random_uuid()::text, 1, 8) || '@v6.test', '',
       '{}'::jsonb, $1::jsonb,
       now(), now()
     )
     RETURNING id`,
    [JSON.stringify({ role: "tenant_admin", tenant_id: unrelatedTenantId })],
  );
  const unrelatedTenantAdminUser = dtAdminRes.rows[0].id;
  await client.query(
    `INSERT INTO public.profiles (id, email, role, tenant_id)
       VALUES ($1, (SELECT email FROM auth.users WHERE id=$1),
               'tenant_admin', $2)
       ON CONFLICT (id) DO UPDATE
         SET role='tenant_admin', tenant_id=$2`,
    [unrelatedTenantAdminUser, unrelatedTenantId],
  );

  return {
    partnerATenant,
    partnerAOrgId,
    partnerAOrgInitialDisplayName,
    partnerAAdminUser,
    partnerBTenant,
    partnerBOrgId,
    partnerBAdminUser,
    unrelatedTenantAdminUser,
    unrelatedTenantId,
  };
}

describe("updatePartnerStammdaten — RLS contract (V6 SLC-102 MT-5)", () => {
  it("happy path: partner_admin updated eigene partner_organization-Row", async () => {
    await withTestDb(async (client) => {
      const fx = await seedStammdatenFixture(client);

      let updatedRowCount: number | null = null;
      let newDisplay: string | null = null;
      let newEmail: string | null = null;
      let newPhone: string | null | undefined = undefined;

      await withJwtContext(client, fx.partnerAAdminUser, async () => {
        const res = await client.query<{
          tenant_id: string;
          display_name: string;
          contact_email: string;
          contact_phone: string | null;
        }>(
          `UPDATE public.partner_organization
              SET display_name = $1,
                  contact_email = $2,
                  contact_phone = $3,
                  updated_at = now()
            WHERE tenant_id = $4
            RETURNING tenant_id, display_name, contact_email, contact_phone`,
          [
            "MT5 PartnerA Updated",
            "neu@kanzlei.local",
            "+49 30 555 1111",
            fx.partnerATenant,
          ],
        );
        updatedRowCount = res.rowCount;
        newDisplay = res.rows[0]?.display_name ?? null;
        newEmail = res.rows[0]?.contact_email ?? null;
        newPhone = res.rows[0]?.contact_phone ?? null;
      });

      expect(updatedRowCount).toBe(1);
      expect(newDisplay).toBe("MT5 PartnerA Updated");
      expect(newEmail).toBe("neu@kanzlei.local");
      expect(newPhone).toBe("+49 30 555 1111");

      // Sanity-Check: Partner-B-Row ist unberuehrt.
      const pBCheck = await client.query<{ display_name: string }>(
        `SELECT display_name FROM public.partner_organization WHERE id=$1`,
        [fx.partnerBOrgId],
      );
      expect(pBCheck.rows[0].display_name).toBe("MT5 PartnerB Display");
    });
  });

  it("auth-reject: tenant_admin (anderer Tenant) wird durch RLS USING-Clause geblockt (rowCount=0)", async () => {
    await withTestDb(async (client) => {
      const fx = await seedStammdatenFixture(client);

      let updatedRowCount: number | null = null;
      let permissionDenied: boolean = false;

      await withJwtContext(client, fx.unrelatedTenantAdminUser, async () => {
        await client.query("SAVEPOINT try_update_as_unrelated");
        try {
          const res = await client.query(
            `UPDATE public.partner_organization
                SET display_name = $1,
                    contact_email = $2,
                    updated_at = now()
              WHERE tenant_id = $3`,
            [
              "Hostile Update",
              "evil@kanzlei.local",
              fx.partnerATenant,
            ],
          );
          updatedRowCount = res.rowCount;
        } catch (e) {
          permissionDenied = /permission denied|row-level security/i.test(
            (e as Error).message,
          );
        }
        await client.query("ROLLBACK TO SAVEPOINT try_update_as_unrelated");
      });

      // RLS-Verhalten: USING-Clause filtert die Row aus → rowCount=0 ohne
      // Permission-Denial. Falls in Zukunft GRANT-Stripping greift: dann
      // permissionDenied=true. Beide Verhalten gelten als Auth-Reject.
      expect(
        updatedRowCount === 0 || permissionDenied,
        `Expected rowCount=0 OR permission_denied, got rowCount=${updatedRowCount} permissionDenied=${permissionDenied}`,
      ).toBe(true);

      // Sanity-Check: Partner-A-Row ist unberuehrt (Original-DisplayName).
      const pACheck = await client.query<{ display_name: string }>(
        `SELECT display_name FROM public.partner_organization WHERE tenant_id=$1`,
        [fx.partnerATenant],
      );
      expect(pACheck.rows[0].display_name).toBe(
        fx.partnerAOrgInitialDisplayName,
      );
    });
  });

  it("cross-tenant-reject: partner_admin-A kann Partner-B-Row nicht updaten (rowCount=0)", async () => {
    await withTestDb(async (client) => {
      const fx = await seedStammdatenFixture(client);

      let updatedRowCount: number | null = null;
      let permissionDenied: boolean = false;

      await withJwtContext(client, fx.partnerAAdminUser, async () => {
        await client.query("SAVEPOINT try_cross_tenant_update");
        try {
          const res = await client.query(
            `UPDATE public.partner_organization
                SET display_name = $1,
                    contact_email = $2,
                    updated_at = now()
              WHERE tenant_id = $3`,
            [
              "Cross-Tenant Hostile",
              "evil@kanzlei.local",
              fx.partnerBTenant,
            ],
          );
          updatedRowCount = res.rowCount;
        } catch (e) {
          permissionDenied = /permission denied|row-level security/i.test(
            (e as Error).message,
          );
        }
        await client.query("ROLLBACK TO SAVEPOINT try_cross_tenant_update");
      });

      expect(
        updatedRowCount === 0 || permissionDenied,
        `Expected rowCount=0 OR permission_denied, got rowCount=${updatedRowCount} permissionDenied=${permissionDenied}`,
      ).toBe(true);

      // Sanity-Check: Partner-B-Row ist unberuehrt.
      const pBCheck = await client.query<{ display_name: string }>(
        `SELECT display_name FROM public.partner_organization WHERE tenant_id=$1`,
        [fx.partnerBTenant],
      );
      expect(pBCheck.rows[0].display_name).toBe("MT5 PartnerB Display");
    });
  });
});
