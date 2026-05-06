import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

// SLC-071 MT-9 — Partial 4-Rollen-RLS-Matrix fuer walkthrough_session.
// Vollstaendige 16-Faelle-Matrix folgt in SLC-074. Hier: 4 SELECT-Faelle.
//
// Policy walkthrough_session_select (MIG-031/083):
//   strategaize_admin                           → alle
//   tenant_admin AND tenant_id = own            → eigener Tenant
//   sonst recorded_by_user_id = auth.uid()      → nur eigene Aufnahmen
//
// Setup: Tenant A bekommt 1 walkthrough_session vom tenant_admin und
// 1 vom employee. Tenant B bekommt 1 walkthrough_session vom tenant_admin.
// Vier Rollen werden anschliessend nacheinander angemeldet und SELECT geprueft.

describe("RLS Partial Matrix — walkthrough_session SELECT", () => {
  it("strategaize_admin sieht ALLE walkthrough_sessions tenant-uebergreifend", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      // strategaize_admin ohne tenant_id
      const strategaizeAdminInsert = await client.query<{ id: string }>(
        `INSERT INTO auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at
         )
         VALUES (
           '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
           'authenticated', 'authenticated',
           'sa-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
           '{}'::jsonb, jsonb_build_object('role', 'strategaize_admin'),
           now(), now()
         )
         RETURNING id`
      );
      const strategaizeAdmin = strategaizeAdminInsert.rows[0].id;
      await client.query(
        `UPDATE public.profiles SET role='strategaize_admin', tenant_id=NULL WHERE id=$1`,
        [strategaizeAdmin]
      );

      const captureA = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );
      const captureB = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantB, templateId, templateVersion, userB]
      );

      const walks = await client.query<{ id: string; tenant_id: string }>(
        `INSERT INTO public.walkthrough_session
           (tenant_id, capture_session_id, recorded_by_user_id, status)
         VALUES
           ($1, $2, $3, 'recording'),
           ($4, $5, $6, 'recording')
         RETURNING id, tenant_id`,
        [tenantA, captureA.rows[0].id, userA, tenantB, captureB.rows[0].id, userB]
      );
      expect(walks.rowCount).toBe(2);

      await withJwtContext(client, strategaizeAdmin, async () => {
        const visible = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.walkthrough_session
            WHERE tenant_id IN ($1, $2)`,
          [tenantA, tenantB]
        );
        expect(visible.rowCount).toBe(2);
        const tenantsSeen = new Set(visible.rows.map((r) => r.tenant_id));
        expect(tenantsSeen.has(tenantA)).toBe(true);
        expect(tenantsSeen.has(tenantB)).toBe(true);
      });
    });
  });

  it("tenant_admin sieht nur walkthrough_sessions des eigenen Tenants", async () => {
    await withTestDb(async (client) => {
      const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      const captureA = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );
      const captureB = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantB, templateId, templateVersion, userB]
      );

      await client.query(
        `INSERT INTO public.walkthrough_session
           (tenant_id, capture_session_id, recorded_by_user_id, status)
         VALUES
           ($1, $2, $3, 'recording'),
           ($4, $5, $6, 'recording')`,
        [tenantA, captureA.rows[0].id, userA, tenantB, captureB.rows[0].id, userB]
      );

      // userA ist tenant_admin von Tenant A — sieht nur eigene Tenant-Walkthroughs
      await withJwtContext(client, userA, async () => {
        const visible = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.walkthrough_session
            WHERE tenant_id IN ($1, $2)`,
          [tenantA, tenantB]
        );
        expect(visible.rowCount).toBe(1);
        expect(visible.rows[0].tenant_id).toBe(tenantA);
      });
    });
  });

  it("tenant_member sieht nur eigene walkthrough_sessions, keine fremden im selben Tenant", async () => {
    await withTestDb(async (client) => {
      const { tenantA, userA, templateId, templateVersion } =
        await seedTestTenants(client);

      // Zweiter User in Tenant A mit Rolle tenant_member
      const memberInsert = await client.query<{ id: string }>(
        `INSERT INTO auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at
         )
         VALUES (
           '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
           'authenticated', 'authenticated',
           'tm-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
           '{}'::jsonb,
           jsonb_build_object('tenant_id', $1::text, 'role', 'tenant_member'),
           now(), now()
         )
         RETURNING id`,
        [tenantA]
      );
      const memberA = memberInsert.rows[0].id;

      const captureA = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );

      // Eine Aufnahme vom tenant_admin (userA), eine Aufnahme vom tenant_member (memberA)
      const walks = await client.query<{ id: string; recorded_by_user_id: string }>(
        `INSERT INTO public.walkthrough_session
           (tenant_id, capture_session_id, recorded_by_user_id, status)
         VALUES
           ($1, $2, $3, 'recording'),
           ($1, $2, $4, 'recording')
         RETURNING id, recorded_by_user_id`,
        [tenantA, captureA.rows[0].id, userA, memberA]
      );
      expect(walks.rowCount).toBe(2);

      // tenant_member sieht NUR die eigene Aufnahme — nicht die des tenant_admin
      await withJwtContext(client, memberA, async () => {
        const visible = await client.query<{ recorded_by_user_id: string }>(
          `SELECT recorded_by_user_id FROM public.walkthrough_session
            WHERE tenant_id = $1`,
          [tenantA]
        );
        expect(visible.rowCount).toBe(1);
        expect(visible.rows[0].recorded_by_user_id).toBe(memberA);
      });
    });
  });

  it("employee sieht nur eigene walkthrough_sessions, keine fremden", async () => {
    await withTestDb(async (client) => {
      const { tenantA, userA, templateId, templateVersion } =
        await seedTestTenants(client);

      // employee in Tenant A
      const employeeInsert = await client.query<{ id: string }>(
        `INSERT INTO auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at
         )
         VALUES (
           '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
           'authenticated', 'authenticated',
           'emp-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
           '{}'::jsonb,
           jsonb_build_object('tenant_id', $1::text, 'role', 'employee'),
           now(), now()
         )
         RETURNING id`,
        [tenantA]
      );
      const employeeA = employeeInsert.rows[0].id;

      const captureA = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session
           (tenant_id, template_id, template_version, owner_user_id, status)
         VALUES ($1, $2, $3, $4, 'open') RETURNING id`,
        [tenantA, templateId, templateVersion, userA]
      );

      // Aufnahme vom tenant_admin + Aufnahme vom employee
      await client.query(
        `INSERT INTO public.walkthrough_session
           (tenant_id, capture_session_id, recorded_by_user_id, status)
         VALUES
           ($1, $2, $3, 'recording'),
           ($1, $2, $4, 'recording')`,
        [tenantA, captureA.rows[0].id, userA, employeeA]
      );

      // employee sieht NUR die eigene Aufnahme
      await withJwtContext(client, employeeA, async () => {
        const visible = await client.query<{ recorded_by_user_id: string }>(
          `SELECT recorded_by_user_id FROM public.walkthrough_session
            WHERE tenant_id = $1`,
          [tenantA]
        );
        expect(visible.rowCount).toBe(1);
        expect(visible.rows[0].recorded_by_user_id).toBe(employeeA);
      });
    });
  });
});
