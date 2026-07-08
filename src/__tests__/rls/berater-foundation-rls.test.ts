// V10.4 SLC-188 (FEAT-105) MT-3 — DB-Sidecar-Tests fuer die strategaize_berater-Foundation.
//
// Prueft gegen die Live-Coolify-DB (TEST_DATABASE_URL, node:22-Sidecar) das MIG-132-Verhalten:
//   - berater_tenant_assignments RLS (admin ALL, berater SELECT own, berater kein INSERT)
//   - berater_assigned_tenant_ids(uid) = zugewiesene ∪ Cascade-Mandanten (partner_client_mapping accepted)
//   - can_see_tenant(tenant) = admin OR zugewiesen; nicht-zugewiesen false
//   - handle_new_user: strategaize_berater OHNE tenant_id angelegt; tenant_admin OHNE tenant_id -> P0422
//   - Regression: bestehende Rollen unveraendert (partner_admin-Pfad, tenant-Pflicht)
//
// PENDING-LIVE: laeuft im /deploy NACH MIG-132-Live-Apply (Pre-Apply-Live-Audit -> apply ->
// Server-DB-Suite), analog V10.3 SLC-187/MIG-131. Vor Apply existieren Tabelle/Functions nicht.
// SAVEPOINT-Pattern fuer expected Rejections (coolify-test-setup.md / IMP-044).

import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import type { Client } from "pg";

interface BeraterFixtures {
  kanzleiTenant: string; // partner_organization, zugewiesen
  mandantTenant: string; // partner_client der Kanzlei (Cascade via mapping)
  fremdTenant: string; // direct_client, NICHT zugewiesen
  beraterUserId: string;
  adminUserId: string;
}

/** Legt Kanzlei + Mandant (+ accepted mapping) + Fremd-Tenant + Berater + Admin + Zuweisung an. */
async function seedBeraterFixtures(client: Client): Promise<BeraterFixtures> {
  // tenants_parent_partner_consistency (live CHECK): partner_client MUSS parent_partner_tenant_id
  // beim INSERT gesetzt haben, alle anderen tenant_kind MUESSEN NULL sein -> Kanzlei zuerst.
  const kanzlei = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind)
     VALUES ('SLC188 Kanzlei', 'de', 'partner_organization') RETURNING id`,
  );
  const kanzleiTenant = kanzlei.rows[0].id;
  const fremd = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind)
     VALUES ('SLC188 Fremd', 'de', 'direct_client') RETURNING id`,
  );
  const fremdTenant = fremd.rows[0].id;
  const mandant = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
     VALUES ('SLC188 Mandant', 'de', 'partner_client', $1) RETURNING id`,
    [kanzleiTenant],
  );
  const mandantTenant = mandant.rows[0].id;

  // aktive Sichtbarkeits-Ebene (mapping accepted); invitation_source live-whitelist: partner_invite|self_signup.
  await client.query(
    `INSERT INTO public.partner_client_mapping
       (partner_tenant_id, client_tenant_id, invitation_status, invited_at, accepted_at, invitation_source)
     VALUES ($1, $2, 'accepted', now(), now(), 'partner_invite')`,
    [kanzleiTenant, mandantTenant],
  );

  // Berater-User: role=strategaize_berater OHNE tenant_id (Trigger legt Profile cross-tenant an).
  const berater = await client.query<{ id: string }>(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                             raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
             'slc188-berater-' || substr(gen_random_uuid()::text,1,8) || '@onboarding.test', '',
             '{}'::jsonb, jsonb_build_object('role','strategaize_berater'), now(), now())
     RETURNING id`,
  );
  const beraterUserId = berater.rows[0].id;

  const admin = await client.query<{ id: string }>(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                             raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
             'slc188-admin-' || substr(gen_random_uuid()::text,1,8) || '@onboarding.test', '',
             '{}'::jsonb, jsonb_build_object('role','strategaize_admin'), now(), now())
     RETURNING id`,
  );
  const adminUserId = admin.rows[0].id;

  // Zuweisung Berater -> Kanzlei (Mandant folgt per Cascade, NICHT direkt zugewiesen).
  await client.query(
    `INSERT INTO public.berater_tenant_assignments (berater_user_id, tenant_id, assigned_by)
     VALUES ($1, $2, $3)`,
    [beraterUserId, kanzleiTenant, adminUserId],
  );

  return { kanzleiTenant, mandantTenant, fremdTenant, beraterUserId, adminUserId };
}

async function expectRlsReject(client: Client, query: string, params: unknown[]): Promise<string> {
  await client.query("SAVEPOINT try_op");
  let errorMsg = "";
  try {
    await client.query(query, params);
  } catch (e) {
    errorMsg = (e as Error).message;
  }
  await client.query("ROLLBACK TO SAVEPOINT try_op");
  return errorMsg;
}

describe("SLC-188 berater_assigned_tenant_ids — Cascade (DEC-268)", () => {
  it("enthaelt zugewiesene Kanzlei UND deren Mandant (Cascade via accepted mapping)", async () => {
    await withTestDb(async (client) => {
      const f = await seedBeraterFixtures(client);
      const res = await client.query<{ kanzlei: boolean; mandant: boolean; fremd: boolean }>(
        `SELECT $2 = ANY(public.berater_assigned_tenant_ids($1)) AS kanzlei,
                $3 = ANY(public.berater_assigned_tenant_ids($1)) AS mandant,
                $4 = ANY(public.berater_assigned_tenant_ids($1)) AS fremd`,
        [f.beraterUserId, f.kanzleiTenant, f.mandantTenant, f.fremdTenant],
      );
      expect(res.rows[0].kanzlei).toBe(true);
      expect(res.rows[0].mandant).toBe(true);
      expect(res.rows[0].fremd).toBe(false);
    });
  });

  it("liefert leeres Array fuer nicht-zugewiesenen Berater", async () => {
    await withTestDb(async (client) => {
      const f = await seedBeraterFixtures(client);
      // frischer Berater ohne Zuweisung
      const other = await client.query<{ id: string }>(
        `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                                 raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
                 'slc188-berater2-' || substr(gen_random_uuid()::text,1,8) || '@onboarding.test', '',
                 '{}'::jsonb, jsonb_build_object('role','strategaize_berater'), now(), now())
         RETURNING id`,
      );
      const res = await client.query<{ n: string }>(
        `SELECT cardinality(public.berater_assigned_tenant_ids($1))::text AS n`,
        [other.rows[0].id],
      );
      expect(res.rows[0].n).toBe("0");
      void f;
    });
  });
});

describe("SLC-188 can_see_tenant (DEC-269)", () => {
  it("Berater: true fuer zugewiesen+Cascade, false fuer fremd", async () => {
    await withTestDb(async (client) => {
      const f = await seedBeraterFixtures(client);
      await withJwtContext(client, f.beraterUserId, async () => {
        const res = await client.query<{ kanzlei: boolean; mandant: boolean; fremd: boolean }>(
          `SELECT public.can_see_tenant($1) AS kanzlei,
                  public.can_see_tenant($2) AS mandant,
                  public.can_see_tenant($3) AS fremd`,
          [f.kanzleiTenant, f.mandantTenant, f.fremdTenant],
        );
        expect(res.rows[0].kanzlei).toBe(true);
        expect(res.rows[0].mandant).toBe(true);
        expect(res.rows[0].fremd).toBe(false);
      });
    });
  });

  it("Admin: true fuer jeden Tenant (cross-tenant)", async () => {
    await withTestDb(async (client) => {
      const f = await seedBeraterFixtures(client);
      await withJwtContext(client, f.adminUserId, async () => {
        const res = await client.query<{ fremd: boolean }>(
          `SELECT public.can_see_tenant($1) AS fremd`,
          [f.fremdTenant],
        );
        expect(res.rows[0].fremd).toBe(true);
      });
    });
  });
});

describe("SLC-188 berater_tenant_assignments RLS", () => {
  it("Berater sieht nur eigene Zuweisungs-Zeile", async () => {
    await withTestDb(async (client) => {
      const f = await seedBeraterFixtures(client);
      await withJwtContext(client, f.beraterUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.berater_tenant_assignments`,
        );
        expect(res.rows[0].c).toBe("1");
      });
    });
  });

  it("Berater kann KEINE Zuweisung INSERTen (nur Admin verwaltet)", async () => {
    await withTestDb(async (client) => {
      const f = await seedBeraterFixtures(client);
      await withJwtContext(client, f.beraterUserId, async () => {
        const msg = await expectRlsReject(
          client,
          `INSERT INTO public.berater_tenant_assignments (berater_user_id, tenant_id)
           VALUES ($1, $2)`,
          [f.beraterUserId, f.fremdTenant],
        );
        expect(msg).toMatch(/row-level security|permission/i);
      });
    });
  });

  it("Admin sieht die Zuweisung (verwaltet alle)", async () => {
    await withTestDb(async (client) => {
      const f = await seedBeraterFixtures(client);
      await withJwtContext(client, f.adminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.berater_tenant_assignments WHERE berater_user_id = $1`,
          [f.beraterUserId],
        );
        expect(res.rows[0].c).toBe("1");
      });
    });
  });
});

describe("SLC-188 handle_new_user (MIG-132)", () => {
  it("legt strategaize_berater OHNE tenant_id an", async () => {
    await withTestDb(async (client) => {
      const f = await seedBeraterFixtures(client);
      const res = await client.query<{ tenant_id: string | null; role: string }>(
        `SELECT tenant_id, role FROM public.profiles WHERE id = $1`,
        [f.beraterUserId],
      );
      expect(res.rows[0].role).toBe("strategaize_berater");
      expect(res.rows[0].tenant_id).toBeNull();
    });
  });

  it("Regression: tenant_admin OHNE tenant_id -> P0422", async () => {
    await withTestDb(async (client) => {
      const msg = await expectRlsReject(
        client,
        `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                                 raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
                 'slc188-badadmin-' || substr(gen_random_uuid()::text,1,8) || '@onboarding.test', '',
                 '{}'::jsonb, jsonb_build_object('role','tenant_admin'), now(), now())`,
        [],
      );
      expect(msg).toMatch(/tenant_id required/i);
    });
  });
});
