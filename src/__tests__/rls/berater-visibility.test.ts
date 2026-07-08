// V10.4 SLC-190 (FEAT-107) MT-4 — DB-Sidecar-Test der Berater-Loader-Scoping-Invariante.
//
// Prueft gegen die Live-Coolify-DB (TEST_DATABASE_URL, node:22-Sidecar) das exakte
// Filter-Muster, das die Query-Layer-Loader (tenant-scope.ts: `.in("tenant_id", ids)`)
// zur Laufzeit anwenden — hier als SQL `WHERE tenant_id = ANY(berater_assigned_tenant_ids(uid))`:
//   - Ergebnis = zugewiesene Kanzlei ∪ Cascade-Mandant; nicht-zugewiesener Tenant = 0 (SC-V10.4-2/3).
//   - Admin-Pfad (kein Filter) sieht weiterhin alle Tenants (SC-V10.4-3 Admin / SC-V10.4-5).
//
// Ergaenzt SLC-188 berater-foundation-rls.test.ts (dort: Function-Output + RLS + Trigger);
// hier: die Filter-ANWENDUNG auf reale tenant-tragende Daten, wie die Loader sie fahren.
//
// PENDING-LIVE: laeuft im /deploy NACH MIG-132-Live-Apply (Pre-Apply-Live-Audit -> apply ->
// Server-DB-Suite). Vor Apply existieren Tabelle/Functions nicht.

import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import type { Client } from "pg";

interface Fixtures {
  kanzleiTenant: string; // partner_organization, zugewiesen
  mandantTenant: string; // partner_client der Kanzlei (Cascade via accepted mapping)
  fremdTenant: string; // direct_client, NICHT zugewiesen
  beraterUserId: string;
  adminUserId: string;
}

/** Kanzlei + Mandant (accepted mapping) + Fremd-Tenant + Berater + Admin + Zuweisung. */
async function seed(client: Client): Promise<Fixtures> {
  const kanzlei = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind)
     VALUES ('SLC190 Kanzlei', 'de', 'partner_organization') RETURNING id`,
  );
  const kanzleiTenant = kanzlei.rows[0].id;
  const fremd = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind)
     VALUES ('SLC190 Fremd', 'de', 'direct_client') RETURNING id`,
  );
  const fremdTenant = fremd.rows[0].id;
  const mandant = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
     VALUES ('SLC190 Mandant', 'de', 'partner_client', $1) RETURNING id`,
    [kanzleiTenant],
  );
  const mandantTenant = mandant.rows[0].id;

  await client.query(
    `INSERT INTO public.partner_client_mapping
       (partner_tenant_id, client_tenant_id, invitation_status, invited_at, accepted_at, invitation_source)
     VALUES ($1, $2, 'accepted', now(), now(), 'partner_invite')`,
    [kanzleiTenant, mandantTenant],
  );

  const berater = await client.query<{ id: string }>(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                             raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
             'slc190-berater-' || substr(gen_random_uuid()::text,1,8) || '@onboarding.test', '',
             '{}'::jsonb, jsonb_build_object('role','strategaize_berater'), now(), now())
     RETURNING id`,
  );
  const beraterUserId = berater.rows[0].id;

  const admin = await client.query<{ id: string }>(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                             raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
             'slc190-admin-' || substr(gen_random_uuid()::text,1,8) || '@onboarding.test', '',
             '{}'::jsonb, jsonb_build_object('role','strategaize_admin'), now(), now())
     RETURNING id`,
  );
  const adminUserId = admin.rows[0].id;

  await client.query(
    `INSERT INTO public.berater_tenant_assignments (berater_user_id, tenant_id, assigned_by)
     VALUES ($1, $2, $3)`,
    [beraterUserId, kanzleiTenant, adminUserId],
  );

  return { kanzleiTenant, mandantTenant, fremdTenant, beraterUserId, adminUserId };
}

describe("SLC-190 Loader-Scoping-Invariante (Berater-Filter auf tenants)", () => {
  it("Filter liefert Kanzlei ∪ Cascade-Mandant, nicht den Fremd-Tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seed(client);
      const res = await client.query<{ id: string }>(
        `SELECT id FROM public.tenants
         WHERE id = ANY(public.berater_assigned_tenant_ids($1))
         ORDER BY name`,
        [f.beraterUserId],
      );
      const ids = res.rows.map((r) => r.id);
      expect(ids).toContain(f.kanzleiTenant);
      expect(ids).toContain(f.mandantTenant);
      expect(ids).not.toContain(f.fremdTenant);
    });
  });

  it("nicht-zugewiesener Berater sieht 0 Tenants (fail-closed)", async () => {
    await withTestDb(async (client) => {
      await seed(client);
      const other = await client.query<{ id: string }>(
        `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                                 raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
                 'slc190-berater2-' || substr(gen_random_uuid()::text,1,8) || '@onboarding.test', '',
                 '{}'::jsonb, jsonb_build_object('role','strategaize_berater'), now(), now())
         RETURNING id`,
      );
      const res = await client.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM public.tenants
         WHERE id = ANY(public.berater_assigned_tenant_ids($1))`,
        [other.rows[0].id],
      );
      expect(res.rows[0].c).toBe("0");
    });
  });

  it("Admin-Pfad (kein Filter) sieht alle Tenants inkl. Fremd", async () => {
    await withTestDb(async (client) => {
      const f = await seed(client);
      const res = await client.query<{ present: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM public.tenants WHERE id = $1) AS present`,
        [f.fremdTenant],
      );
      expect(res.rows[0].present).toBe(true);
    });
  });
});
