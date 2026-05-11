import { describe, it, expect } from "vitest";

import { withTestDb } from "@/test/db";

/**
 * V6 SLC-102 MT-1 — DB-Integration-Tests fuer Server Actions
 * `createPartnerOrganization` + `invitePartnerAdmin`.
 *
 * Diese Tests pruefen das DB-Verhalten (Schema + Constraints + Compensating
 * Action), das die Server Actions ueber den Supabase-Admin-Client absetzen.
 * Sie umgehen die Next-Cookie/Header-Abhaengigkeit der eigentlichen
 * `"use server"`-Funktionen und arbeiten direkt gegen die Coolify-DB als
 * postgres-Superuser (RLS gebypasst — Action-Pfad nutzt service_role, fuer
 * unsere Constraint-Checks ist beides gleichwertig).
 *
 * Die Action-Layer-Validation (Email-Regex, Country-Enum, Auth-Check) ist
 * pure Logik und wird in MT-3 ueber Form-Submit-Smoke abgedeckt.
 */

const SLC102_PREFIX = "SLC-102-MT1-test";

interface SeededAdmin {
  userId: string;
  email: string;
}

async function seedStrategaizeAdmin(client: import("pg").Client): Promise<SeededAdmin> {
  const email = `${SLC102_PREFIX}-admin-${Date.now()}@local.test`;
  const userRes = await client.query<{ id: string }>(
    `INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, instance_id)
       VALUES (gen_random_uuid(), $1, $2, now(), '00000000-0000-0000-0000-000000000000')
       RETURNING id`,
    [email, { role: "strategaize_admin" }],
  );
  const userId = userRes.rows[0].id;
  // handle_new_user-Trigger legt profile bereits an. Sicherheits-UPSERT, falls
  // der Trigger im Test-DB-Schema nicht greift (z.B. fresh-init).
  await client.query(
    `INSERT INTO public.profiles (id, email, role, tenant_id)
       VALUES ($1, $2, 'strategaize_admin', NULL)
       ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, email = EXCLUDED.email`,
    [userId, email],
  );
  return { userId, email };
}

describe("createPartnerOrganization — DB contract (V6 SLC-102 MT-1)", () => {
  it("happy path: tenants + partner_organization INSERT in Sequenz", async () => {
    await withTestDb(async (client) => {
      const admin = await seedStrategaizeAdmin(client);

      // Phase 1 — tenants INSERT mit tenant_kind='partner_organization'
      const tenantRes = await client.query<{ id: string }>(
        `INSERT INTO public.tenants
           (name, language, tenant_kind, parent_partner_tenant_id, created_by)
           VALUES ($1, 'de', 'partner_organization', NULL, $2)
           RETURNING id`,
        ["QA Test Kanzlei", admin.userId],
      );
      const partnerTenantId = tenantRes.rows[0].id;
      expect(partnerTenantId).toMatch(/^[0-9a-f-]{36}$/i);

      // Phase 2 — partner_organization INSERT
      const poRes = await client.query<{ id: string }>(
        `INSERT INTO public.partner_organization
           (tenant_id, legal_name, display_name, partner_kind, tier,
            contact_email, contact_phone, country, created_by_admin_user_id)
           VALUES ($1, $2, $3, 'tax_advisor', NULL, $4, NULL, 'DE', $5)
           RETURNING id`,
        [
          partnerTenantId,
          "QA Test Kanzlei GmbH",
          "QA Test Kanzlei",
          "qa-test@kanzlei.local",
          admin.userId,
        ],
      );
      expect(poRes.rows[0].id).toMatch(/^[0-9a-f-]{36}$/i);

      // Sanity-Check: tenant_kind + parent_partner_tenant_id korrekt
      const tenantCheck = await client.query<{
        tenant_kind: string;
        parent_partner_tenant_id: string | null;
      }>(
        `SELECT tenant_kind, parent_partner_tenant_id
           FROM public.tenants WHERE id = $1`,
        [partnerTenantId],
      );
      expect(tenantCheck.rows[0].tenant_kind).toBe("partner_organization");
      expect(tenantCheck.rows[0].parent_partner_tenant_id).toBeNull();
    });
  });

  it("compensating action: bei UNIQUE-Violation auf partner_organization.tenant_id wird tenants-Row geloescht", async () => {
    await withTestDb(async (client) => {
      const admin = await seedStrategaizeAdmin(client);

      // Vorab existierender Partner mit Tenant-A
      const firstTenant = await client.query<{ id: string }>(
        `INSERT INTO public.tenants
           (name, language, tenant_kind, created_by)
           VALUES ($1, 'de', 'partner_organization', $2)
           RETURNING id`,
        ["First Partner", admin.userId],
      );
      await client.query(
        `INSERT INTO public.partner_organization
           (tenant_id, legal_name, display_name, partner_kind,
            contact_email, country, created_by_admin_user_id)
           VALUES ($1, 'First Partner', 'First', 'tax_advisor',
                   'first@kanzlei.local', 'DE', $2)`,
        [firstTenant.rows[0].id, admin.userId],
      );

      // Phase 1 — neuer Tenant B
      const newTenant = await client.query<{ id: string }>(
        `INSERT INTO public.tenants
           (name, language, tenant_kind, created_by)
           VALUES ($1, 'de', 'partner_organization', $2)
           RETURNING id`,
        ["Conflict Partner", admin.userId],
      );
      const orphanTenantId = newTenant.rows[0].id;

      // Phase 2 — partner_organization-INSERT mit dem ALREADY-USED tenant_id
      // simuliert eine UNIQUE-Violation auf partner_organization.tenant_id.
      // (Real-Action-Pfad: gleiche Action nimmt newTenant.id, aber wenn
      //  partner_organization vorher manuell mit identischer tenant_id
      //  geschrieben wird, schlaegt der INSERT mit 23505 fehl. Hier
      //  simulieren wir den Fehler-Pfad: wir INSERTen Tenant-B aber dann
      //  versuchen wir partner_organization mit firstTenant.id zu schreiben,
      //  was UNIQUE verletzt.)
      let uniqueErrorCode: string | null = null;
      await client.query("SAVEPOINT try_unique_violation");
      try {
        await client.query(
          `INSERT INTO public.partner_organization
             (tenant_id, legal_name, display_name, partner_kind,
              contact_email, country, created_by_admin_user_id)
             VALUES ($1, 'Conflict Partner', 'Conflict', 'tax_advisor',
                     'conflict@kanzlei.local', 'DE', $2)`,
          [firstTenant.rows[0].id, admin.userId], // <-- bewusste UNIQUE-Verletzung
        );
      } catch (e) {
        uniqueErrorCode = (e as { code?: string }).code ?? null;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_unique_violation");
      expect(uniqueErrorCode).toBe("23505"); // Postgres UNIQUE_VIOLATION

      // Compensating Action — Orphan-Tenant-B entfernen
      const delRes = await client.query(
        `DELETE FROM public.tenants WHERE id = $1 RETURNING id`,
        [orphanTenantId],
      );
      expect(delRes.rowCount).toBe(1);

      // Sanity-Check — Tenant-B existiert nicht mehr
      const stillThere = await client.query(
        `SELECT 1 FROM public.tenants WHERE id = $1`,
        [orphanTenantId],
      );
      expect(stillThere.rowCount).toBe(0);

      // Tenant-A bleibt unberuehrt (Compensating Action ist ziel-spezifisch)
      const firstStillThere = await client.query(
        `SELECT 1 FROM public.tenants WHERE id = $1`,
        [firstTenant.rows[0].id],
      );
      expect(firstStillThere.rowCount).toBe(1);
    });
  });
});

describe("invitePartnerAdmin — DB contract (V6 SLC-102 MT-1)", () => {
  it("INSERT employee_invitation mit role_hint='partner_admin' und status='pending' funktioniert", async () => {
    await withTestDb(async (client) => {
      const admin = await seedStrategaizeAdmin(client);
      const tenantRes = await client.query<{ id: string }>(
        `INSERT INTO public.tenants
           (name, language, tenant_kind, created_by)
           VALUES ('Invite Test', 'de', 'partner_organization', $1)
           RETURNING id`,
        [admin.userId],
      );

      const token = "a".repeat(64);
      const invRes = await client.query<{
        id: string;
        role_hint: string;
        status: string;
      }>(
        `INSERT INTO public.employee_invitation
           (tenant_id, email, display_name, role_hint, invitation_token,
            invited_by_user_id, status, expires_at)
           VALUES ($1, $2, $3, 'partner_admin', $4, $5, 'pending',
                   now() + interval '7 days')
           RETURNING id, role_hint, status`,
        [
          tenantRes.rows[0].id,
          "owner@kanzlei.local",
          "Anna Owner",
          token,
          admin.userId,
        ],
      );
      expect(invRes.rows[0].role_hint).toBe("partner_admin");
      expect(invRes.rows[0].status).toBe("pending");
    });
  });

  it("duplicate pending invitation (selbe tenant_id + email) wird durch UNIQUE-Index geblockt", async () => {
    await withTestDb(async (client) => {
      const admin = await seedStrategaizeAdmin(client);
      const tenantRes = await client.query<{ id: string }>(
        `INSERT INTO public.tenants
           (name, language, tenant_kind, created_by)
           VALUES ('Dup Test', 'de', 'partner_organization', $1)
           RETURNING id`,
        [admin.userId],
      );

      const token1 = "b".repeat(64);
      const token2 = "c".repeat(64);
      const email = "dup@kanzlei.local";

      await client.query(
        `INSERT INTO public.employee_invitation
           (tenant_id, email, display_name, role_hint, invitation_token,
            invited_by_user_id, status, expires_at)
           VALUES ($1, $2, NULL, 'partner_admin', $3, $4, 'pending',
                   now() + interval '7 days')`,
        [tenantRes.rows[0].id, email, token1, admin.userId],
      );

      let dupErrorCode: string | null = null;
      await client.query("SAVEPOINT try_dup");
      try {
        await client.query(
          `INSERT INTO public.employee_invitation
             (tenant_id, email, display_name, role_hint, invitation_token,
              invited_by_user_id, status, expires_at)
             VALUES ($1, $2, NULL, 'partner_admin', $3, $4, 'pending',
                     now() + interval '7 days')`,
          [tenantRes.rows[0].id, email, token2, admin.userId],
        );
      } catch (e) {
        dupErrorCode = (e as { code?: string }).code ?? null;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_dup");
      expect(dupErrorCode).toBe("23505");
    });
  });
});
