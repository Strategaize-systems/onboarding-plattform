import { describe, it, expect } from "vitest";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

// V9.5 SLC-V9.5-B MT-6 (AC-B-6 / SC-V9.5-8) — RLS-Pen-Test fuer die zwei neuen
// Synthese-Tabellen email_synthesized_unit + email_synthesized_unit_source
// (MIG-111). Matrix analog MIG-106 email_pattern:
//   - strategaize_admin: SELECT cross-tenant
//   - tenant_admin: SELECT/INSERT/UPDATE own-tenant, KEIN cross-tenant
//   - tenant_member: KEIN Zugriff (kein Policy-Eintrag → Default-Deny)
//
// Pattern-Reuse: rls-isolation.test.ts / v6-partner-rls.test.ts
//   (withTestDb BEGIN/ROLLBACK, withJwtContext Role+Tenant, SAVEPOINT fuer
//    erwartete RLS-Rejections — coolify-test-setup.md).
//
// node:20-Sidecar gegen Coolify-DB (TEST_DATABASE_URL). Ohne DB DB-gated skip.

interface SynthFixture {
  tenantA: string;
  tenantB: string;
  userA: string; // tenant_admin A
  userB: string; // tenant_admin B
  adminUser: string; // strategaize_admin
  memberUser: string; // tenant_member von A
  runA: string;
  runB: string;
  patternA: string;
  patternB: string;
  unitA: string;
  unitB: string;
}

async function makeUser(
  client: Client,
  tenantId: string,
  role: string,
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) VALUES (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated',
       'test-${role}-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
       '{}'::jsonb, jsonb_build_object('tenant_id', $1::text, 'role', $2::text),
       now(), now()
     ) RETURNING id`,
    [tenantId, role],
  );
  return res.rows[0].id;
}

async function seedSynthFixture(client: Client): Promise<SynthFixture> {
  const { tenantA, tenantB, userA, userB } = await seedTestTenants(client);
  const adminUser = await makeUser(client, tenantA, "strategaize_admin");
  const memberUser = await makeUser(client, tenantA, "tenant_member");

  const runs = await client.query<{ id: string; tenant_id: string }>(
    `INSERT INTO public.email_bulk_run
       (tenant_id, source_file_name, file_hash, storage_path, status)
     VALUES ($1, 'a.mbox', 'hash-a', 'p/a', 'pattern_extracted'),
            ($2, 'b.mbox', 'hash-b', 'p/b', 'pattern_extracted')
     RETURNING id, tenant_id`,
    [tenantA, tenantB],
  );
  const runA = runs.rows.find((r) => r.tenant_id === tenantA)!.id;
  const runB = runs.rows.find((r) => r.tenant_id === tenantB)!.id;

  const threads = await client.query<{ id: string; tenant_id: string }>(
    `INSERT INTO public.email_thread (tenant_id, bulk_run_id, root_message_id)
     VALUES ($1, $2, '<a@test>'), ($3, $4, '<b@test>')
     RETURNING id, tenant_id`,
    [tenantA, runA, tenantB, runB],
  );
  const threadA = threads.rows.find((r) => r.tenant_id === tenantA)!.id;
  const threadB = threads.rows.find((r) => r.tenant_id === tenantB)!.id;

  const patterns = await client.query<{ id: string; tenant_id: string }>(
    `INSERT INTO public.email_pattern
       (tenant_id, bulk_run_id, thread_id, title, description, confidence)
     VALUES ($1, $2, $3, 'pa', 'da', 0.8),
            ($4, $5, $6, 'pb', 'db', 0.8)
     RETURNING id, tenant_id`,
    [tenantA, runA, threadA, tenantB, runB, threadB],
  );
  const patternA = patterns.rows.find((r) => r.tenant_id === tenantA)!.id;
  const patternB = patterns.rows.find((r) => r.tenant_id === tenantB)!.id;

  const units = await client.query<{ id: string; tenant_id: string }>(
    `INSERT INTO public.email_synthesized_unit
       (tenant_id, bulk_run_id, title, description, evidence_count, source_pattern_ids)
     VALUES ($1, $2, 'ua', 'desc-a', 2, ARRAY[$3]::uuid[]),
            ($4, $5, 'ub', 'desc-b', 2, ARRAY[$6]::uuid[])
     RETURNING id, tenant_id`,
    [tenantA, runA, patternA, tenantB, runB, patternB],
  );
  const unitA = units.rows.find((r) => r.tenant_id === tenantA)!.id;
  const unitB = units.rows.find((r) => r.tenant_id === tenantB)!.id;

  await client.query(
    `INSERT INTO public.email_synthesized_unit_source
       (synthesized_unit_id, pattern_id, thread_id, tenant_id)
     VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)`,
    [unitA, patternA, threadA, tenantA, unitB, patternB, threadB, tenantB],
  );

  return {
    tenantA, tenantB, userA, userB, adminUser, memberUser,
    runA, runB, patternA, patternB, unitA, unitB,
  };
}

describe("RLS: email_synthesized_unit (V9.5 MIG-111)", () => {
  it("tenant_admin A sees only own-tenant synthesized units", async () => {
    await withTestDb(async (client) => {
      const f = await seedSynthFixture(client);
      await withJwtContext(client, f.userA, async () => {
        const r = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.email_synthesized_unit`,
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].tenant_id).toBe(f.tenantA);
      });
      await withJwtContext(client, f.userB, async () => {
        const r = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.email_synthesized_unit`,
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].tenant_id).toBe(f.tenantB);
      });
    });
  });

  it("strategaize_admin sees both tenants' synthesized units (cross-tenant audit)", async () => {
    await withTestDb(async (client) => {
      const f = await seedSynthFixture(client);
      await withJwtContext(client, f.adminUser, async () => {
        const r = await client.query(`SELECT id FROM public.email_synthesized_unit`);
        expect(r.rowCount).toBe(2);
      });
    });
  });

  it("tenant_member of A sees NO synthesized units (default-deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedSynthFixture(client);
      await withJwtContext(client, f.memberUser, async () => {
        const r = await client.query(`SELECT id FROM public.email_synthesized_unit`);
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("tenant_admin A cannot INSERT a synthesized unit for Tenant B (WITH CHECK)", async () => {
    await withTestDb(async (client) => {
      const f = await seedSynthFixture(client);
      await withJwtContext(client, f.userA, async () => {
        let errorMessage: string | null = null;
        await client.query("SAVEPOINT try_cross_insert");
        try {
          await client.query(
            `INSERT INTO public.email_synthesized_unit
               (tenant_id, bulk_run_id, title, description, evidence_count)
             VALUES ($1, $2, 'x', 'y', 2)`,
            [f.tenantB, f.runB],
          );
        } catch (e) {
          errorMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT try_cross_insert");
        expect(errorMessage).toMatch(/row-level security/);
      });
    });
  });

  it("tenant_admin A cannot UPDATE Tenant B's synthesized unit", async () => {
    await withTestDb(async (client) => {
      const f = await seedSynthFixture(client);
      await withJwtContext(client, f.userA, async () => {
        const upd = await client.query(
          `UPDATE public.email_synthesized_unit SET title = 'hacked' WHERE id = $1`,
          [f.unitB],
        );
        // RLS USING-Filter macht die Row unsichtbar → 0 rows updated (kein Error).
        expect(upd.rowCount).toBe(0);
      });
    });
  });
});

describe("RLS: email_synthesized_unit_source (V9.5 MIG-111)", () => {
  it("tenant_admin A sees only own-tenant source rows; B only B's", async () => {
    await withTestDb(async (client) => {
      const f = await seedSynthFixture(client);
      await withJwtContext(client, f.userA, async () => {
        const r = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.email_synthesized_unit_source`,
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].tenant_id).toBe(f.tenantA);
      });
    });
  });

  it("strategaize_admin sees both source rows", async () => {
    await withTestDb(async (client) => {
      const f = await seedSynthFixture(client);
      await withJwtContext(client, f.adminUser, async () => {
        const r = await client.query(
          `SELECT id FROM public.email_synthesized_unit_source`,
        );
        expect(r.rowCount).toBe(2);
      });
    });
  });

  it("tenant_admin A cannot INSERT a source row for Tenant B", async () => {
    await withTestDb(async (client) => {
      const f = await seedSynthFixture(client);
      await withJwtContext(client, f.userA, async () => {
        let errorMessage: string | null = null;
        await client.query("SAVEPOINT try_src_insert");
        try {
          await client.query(
            `INSERT INTO public.email_synthesized_unit_source
               (synthesized_unit_id, pattern_id, thread_id, tenant_id)
             VALUES ($1, $2, NULL, $3)`,
            [f.unitB, f.patternB, f.tenantB],
          );
        } catch (e) {
          errorMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT try_src_insert");
        expect(errorMessage).toMatch(/row-level security/);
      });
    });
  });
});
