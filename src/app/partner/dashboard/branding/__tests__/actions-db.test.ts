import { describe, it, expect } from "vitest";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";

/**
 * V6 SLC-104 MT-8 — DB-Integration-Tests fuer Server Actions
 * uploadLogo + updateBranding (siehe ../actions.ts).
 *
 * Pattern-Reuse aus partner-stammdaten-actions-db.test.ts (MT-5):
 *   - withTestDb (BEGIN/ROLLBACK pro Test)
 *   - withJwtContext (SET LOCAL "request.jwt.claims" + ROLE authenticated)
 *   - SAVEPOINT um expected RLS-Rejects + CHECK-Violations
 *
 * Die Server Actions selbst nutzen createAdminClient (service_role,
 * BYPASSRLS) — die hier gepruefte RLS-Schicht ist Defense-in-Depth aus
 * Migration 091 (pbc_update_own_partner_admin / pbc_insert_own_partner_admin
 * + partner_branding_assets_insert auf storage.objects).
 *
 * Slice-Spec G fordert 5 Faelle: Happy / Size-Reject / Mime-Reject /
 * Hex-Reject / Auth-Reject. Size + Mime sind reine Server-Action-Validation
 * (FormData.get('logo') instanceof File + .size + .type) und werden
 * NICHT von der DB durchgesetzt — sie werden ueber Lint/Type-Check und
 * Live-Smoke MT-13 verifiziert. Hex + Auth pruefen wir hier auf DB-Layer
 * (CHECK-Constraint + RLS), und ergaenzen einen Storage-RLS-Test fuer den
 * uploadLogo-Pfad (partner_admin darf NICHT in fremden Tenant-Folder schreiben).
 *
 * Faelle:
 *   1. Happy — partner_admin updated eigene Branding-Row (rowCount=1, Werte korrekt).
 *   2. Hex-Reject — CHECK-Constraint blockt invalid hex (DB-Layer, nicht RLS).
 *   3. Auth-Reject — tenant_admin (anderer Tenant) wird durch RLS USING-Clause geblockt.
 *   4. Cross-Tenant-Reject — partner_admin-A kann Partner-B-Row nicht updaten.
 *   5. Storage-RLS — partner_admin-A kann NICHT in Partner-B-Folder uploaden.
 */

interface BrandingFixture {
  partnerATenant: string;
  partnerAAdminUser: string;
  partnerBTenant: string;
  partnerBAdminUser: string;
  unrelatedTenantId: string;
  unrelatedTenantAdminUser: string;
}

async function seedBrandingFixture(client: Client): Promise<BrandingFixture> {
  // Strategaize-Admin als Owner aller Inserts.
  const saRes = await client.query<{ id: string }>(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     )
     VALUES (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated',
       'mt8-sa-' || substr(gen_random_uuid()::text, 1, 8) || '@v6.test', '',
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

  // Partner-A Tenant + Org + Branding-Row (Backfill-Imitat).
  const pATenantRes = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, created_by)
     VALUES ('MT8 PartnerA', 'de', 'partner_organization', $1)
     RETURNING id`,
    [sa],
  );
  const partnerATenant = pATenantRes.rows[0].id;
  await client.query(
    `INSERT INTO public.partner_organization
       (tenant_id, legal_name, display_name, partner_kind, contact_email,
        country, created_by_admin_user_id)
       VALUES ($1, 'MT8 PartnerA Legal', 'MT8 PartnerA Display',
               'tax_advisor', 'mt8-a@kanzlei.local', 'DE', $2)`,
    [partnerATenant, sa],
  );
  await client.query(
    `INSERT INTO public.partner_branding_config (partner_tenant_id, primary_color, display_name)
       VALUES ($1, '#4454b8', 'MT8 PartnerA Display')
       ON CONFLICT (partner_tenant_id) DO NOTHING`,
    [partnerATenant],
  );

  // Partner-B Tenant + Org + Branding-Row.
  const pBTenantRes = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, created_by)
     VALUES ('MT8 PartnerB', 'de', 'partner_organization', $1)
     RETURNING id`,
    [sa],
  );
  const partnerBTenant = pBTenantRes.rows[0].id;
  await client.query(
    `INSERT INTO public.partner_organization
       (tenant_id, legal_name, display_name, partner_kind, contact_email,
        country, created_by_admin_user_id)
       VALUES ($1, 'MT8 PartnerB Legal', 'MT8 PartnerB Display',
               'tax_advisor', 'mt8-b@kanzlei.local', 'NL', $2)`,
    [partnerBTenant, sa],
  );
  await client.query(
    `INSERT INTO public.partner_branding_config (partner_tenant_id, primary_color, display_name)
       VALUES ($1, '#4454b8', 'MT8 PartnerB Display')
       ON CONFLICT (partner_tenant_id) DO NOTHING`,
    [partnerBTenant],
  );

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
  const partnerAAdminUser = await mkPartnerAdmin("mt8-pa-a", partnerATenant);
  const partnerBAdminUser = await mkPartnerAdmin("mt8-pa-b", partnerBTenant);

  // Unrelated tenant_admin (Direct-Client-Tenant) fuer Auth-Reject-Test.
  const dtRes = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, created_by)
     VALUES ('MT8 DirectTenant', 'de', $1)
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
       'mt8-ta-' || substr(gen_random_uuid()::text, 1, 8) || '@v6.test', '',
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
    partnerAAdminUser,
    partnerBTenant,
    partnerBAdminUser,
    unrelatedTenantId,
    unrelatedTenantAdminUser,
  };
}

describe("partner branding actions — DB contract (V6 SLC-104 MT-8)", () => {
  it("happy: partner_admin updated eigene partner_branding_config-Row", async () => {
    await withTestDb(async (client) => {
      const fx = await seedBrandingFixture(client);

      let updatedRowCount: number | null = null;
      let newPrimary: string | null = null;
      let newSecondary: string | null = null;
      let newDisplay: string | null = null;

      await withJwtContext(client, fx.partnerAAdminUser, async () => {
        const res = await client.query<{
          partner_tenant_id: string;
          primary_color: string;
          secondary_color: string | null;
          display_name: string | null;
        }>(
          `UPDATE public.partner_branding_config
              SET primary_color = $1,
                  secondary_color = $2,
                  display_name = $3,
                  updated_at = now()
            WHERE partner_tenant_id = $4
            RETURNING partner_tenant_id, primary_color, secondary_color, display_name`,
          [
            "#aabbcc",
            "#112233",
            "MT8 PartnerA Updated",
            fx.partnerATenant,
          ],
        );
        updatedRowCount = res.rowCount;
        newPrimary = res.rows[0]?.primary_color ?? null;
        newSecondary = res.rows[0]?.secondary_color ?? null;
        newDisplay = res.rows[0]?.display_name ?? null;
      });

      expect(updatedRowCount).toBe(1);
      expect(newPrimary).toBe("#aabbcc");
      expect(newSecondary).toBe("#112233");
      expect(newDisplay).toBe("MT8 PartnerA Updated");

      // Sanity-Check: Partner-B-Row ist unberuehrt.
      const pBCheck = await client.query<{
        primary_color: string;
        display_name: string | null;
      }>(
        `SELECT primary_color, display_name FROM public.partner_branding_config WHERE partner_tenant_id=$1`,
        [fx.partnerBTenant],
      );
      expect(pBCheck.rows[0].primary_color).toBe("#4454b8");
      expect(pBCheck.rows[0].display_name).toBe("MT8 PartnerB Display");
    });
  });

  it("hex-reject: CHECK-Constraint blockt invalid primary_color (DB-Layer)", async () => {
    await withTestDb(async (client) => {
      const fx = await seedBrandingFixture(client);

      let checkViolation: boolean = false;

      await withJwtContext(client, fx.partnerAAdminUser, async () => {
        await client.query("SAVEPOINT try_invalid_hex");
        try {
          await client.query(
            `UPDATE public.partner_branding_config
                SET primary_color = $1,
                    updated_at = now()
              WHERE partner_tenant_id = $2`,
            ["not-a-hex", fx.partnerATenant],
          );
        } catch (e) {
          checkViolation = /violates check constraint|partner_branding_config_primary_color_check/i.test(
            (e as Error).message,
          );
        }
        await client.query("ROLLBACK TO SAVEPOINT try_invalid_hex");
      });

      expect(checkViolation, "Expected CHECK-Constraint violation on invalid hex").toBe(true);

      // Sanity-Check: Partner-A-Row ist unveraendert.
      const pACheck = await client.query<{ primary_color: string }>(
        `SELECT primary_color FROM public.partner_branding_config WHERE partner_tenant_id=$1`,
        [fx.partnerATenant],
      );
      expect(pACheck.rows[0].primary_color).toBe("#4454b8");
    });
  });

  it("auth-reject: tenant_admin (anderer Tenant) wird durch RLS USING-Clause geblockt (rowCount=0)", async () => {
    await withTestDb(async (client) => {
      const fx = await seedBrandingFixture(client);

      let updatedRowCount: number | null = null;
      let permissionDenied: boolean = false;

      await withJwtContext(client, fx.unrelatedTenantAdminUser, async () => {
        await client.query("SAVEPOINT try_update_as_unrelated");
        try {
          const res = await client.query(
            `UPDATE public.partner_branding_config
                SET primary_color = $1,
                    updated_at = now()
              WHERE partner_tenant_id = $2`,
            ["#ff0000", fx.partnerATenant],
          );
          updatedRowCount = res.rowCount;
        } catch (e) {
          permissionDenied = /permission denied|row-level security/i.test(
            (e as Error).message,
          );
        }
        await client.query("ROLLBACK TO SAVEPOINT try_update_as_unrelated");
      });

      expect(
        updatedRowCount === 0 || permissionDenied,
        `Expected rowCount=0 OR permission_denied, got rowCount=${updatedRowCount} permissionDenied=${permissionDenied}`,
      ).toBe(true);

      // Sanity-Check: Partner-A-Row ist unberuehrt.
      const pACheck = await client.query<{ primary_color: string }>(
        `SELECT primary_color FROM public.partner_branding_config WHERE partner_tenant_id=$1`,
        [fx.partnerATenant],
      );
      expect(pACheck.rows[0].primary_color).toBe("#4454b8");
    });
  });

  it("cross-tenant-reject: partner_admin-A kann Partner-B-Branding nicht updaten (rowCount=0)", async () => {
    await withTestDb(async (client) => {
      const fx = await seedBrandingFixture(client);

      let updatedRowCount: number | null = null;
      let permissionDenied: boolean = false;

      await withJwtContext(client, fx.partnerAAdminUser, async () => {
        await client.query("SAVEPOINT try_cross_tenant_branding");
        try {
          const res = await client.query(
            `UPDATE public.partner_branding_config
                SET primary_color = $1,
                    updated_at = now()
              WHERE partner_tenant_id = $2`,
            ["#000000", fx.partnerBTenant],
          );
          updatedRowCount = res.rowCount;
        } catch (e) {
          permissionDenied = /permission denied|row-level security/i.test(
            (e as Error).message,
          );
        }
        await client.query("ROLLBACK TO SAVEPOINT try_cross_tenant_branding");
      });

      expect(
        updatedRowCount === 0 || permissionDenied,
        `Expected rowCount=0 OR permission_denied, got rowCount=${updatedRowCount} permissionDenied=${permissionDenied}`,
      ).toBe(true);

      // Sanity-Check: Partner-B-Row ist unberuehrt.
      const pBCheck = await client.query<{ primary_color: string }>(
        `SELECT primary_color FROM public.partner_branding_config WHERE partner_tenant_id=$1`,
        [fx.partnerBTenant],
      );
      expect(pBCheck.rows[0].primary_color).toBe("#4454b8");
    });
  });

  it("storage-rls: partner_admin-A kann NICHT in Partner-B Tenant-Folder schreiben", async () => {
    await withTestDb(async (client) => {
      const fx = await seedBrandingFixture(client);

      let permissionDenied: boolean = false;
      let insertedRow: number | null = null;

      await withJwtContext(client, fx.partnerAAdminUser, async () => {
        await client.query("SAVEPOINT try_cross_tenant_upload");
        try {
          const res = await client.query(
            `INSERT INTO storage.objects (bucket_id, name, owner, metadata)
               VALUES ('partner-branding-assets', $1, $2, '{}'::jsonb)`,
            [`${fx.partnerBTenant}/logo.png`, fx.partnerAAdminUser],
          );
          insertedRow = res.rowCount;
        } catch (e) {
          permissionDenied = /permission denied|row-level security|new row violates row-level security/i.test(
            (e as Error).message,
          );
        }
        await client.query("ROLLBACK TO SAVEPOINT try_cross_tenant_upload");
      });

      expect(
        permissionDenied || insertedRow === 0,
        `Expected permission_denied or rowCount=0 for cross-tenant storage insert, got permissionDenied=${permissionDenied} insertedRow=${insertedRow}`,
      ).toBe(true);

      // Sanity-Check: kein Object im Partner-B-Folder.
      const objCheck = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM storage.objects
          WHERE bucket_id = 'partner-branding-assets'
            AND name LIKE $1`,
        [`${fx.partnerBTenant}/%`],
      );
      expect(objCheck.rows[0].count).toBe("0");
    });
  });
});
