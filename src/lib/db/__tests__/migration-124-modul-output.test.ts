import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

// V10 SLC-169 MT-1 (AC-169-1 / AC-169-2) — Schema-/Index-/RLS-Test fuer Mig 124
// (modul_output-Tabelle). Die Migration ist erst /deploy LIVE (R-169-2) — deshalb
// wird sie hier IN der gerollbackten Test-Transaktion self-applied (BEGIN/COMMIT
// entfernt, weil withTestDb bereits eine Transaktion haelt). Idempotent.
//
// RLS-Matrix (Zwei-Teil-USING tenant_id + Rolle):
//   - strategaize_admin: SELECT/ALL cross-tenant
//   - tenant_admin: SELECT own-tenant
//   - tenant_admin: UPDATE own-tenant (Edit/Status)
//   - INSERT (ai_draft): kein authenticated-GRANT/Policy -> service_role-only
//
// Pattern-Reuse: migration-123-knowledge-unit-themes.test.ts (self-apply),
//   email-synthesized-unit-rls.test.ts (withJwtContext + SAVEPOINT-Rejection,
//   coolify-test-setup.md). node:20-Sidecar gegen Coolify-DB (TEST_DATABASE_URL).

/**
 * Mig 124 self-apply innerhalb der Test-Transaktion. BEGIN/COMMIT der Migration
 * werden entfernt (sonst wuerde COMMIT die aeussere withTestDb-Transaktion
 * vorzeitig beenden). Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS /
 * CREATE OR REPLACE / DROP CONSTRAINT IF EXISTS) — mehrfaches Anwenden ist safe.
 */
async function applyMig124(client: Client): Promise<void> {
  const sql = readFileSync(
    path.join(process.cwd(), "sql/migrations/124_v10_stb_modul_domain.sql"),
    "utf8",
  )
    .replace(/^\s*BEGIN;\s*$/gm, "")
    .replace(/^\s*COMMIT;\s*$/gm, "");
  await client.query(sql);
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

interface ModulFixture {
  tenantA: string;
  tenantB: string;
  userA: string; // tenant_admin A
  userB: string; // tenant_admin B
  adminUser: string; // strategaize_admin
  memberUser: string; // zweiter tenant_admin von A
  outputA: string;
  outputB: string;
}

async function seedModulFixture(client: Client): Promise<ModulFixture> {
  const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
    await seedTestTenants(client);
  const adminUser = await makeUser(client, tenantA, "strategaize_admin");
  const memberUser = await makeUser(client, tenantA, "tenant_admin");

  const sessions = await client.query<{ id: string; tenant_id: string }>(
    `INSERT INTO public.capture_session
       (tenant_id, template_id, template_version, owner_user_id, status, tier)
     VALUES ($1, $3, $4, $5, 'open', 'blueprint'),
            ($2, $3, $4, $6, 'open', 'blueprint')
     RETURNING id, tenant_id`,
    [tenantA, tenantB, templateId, templateVersion, userA, userB],
  );
  const sessionA = sessions.rows.find((r) => r.tenant_id === tenantA)!.id;
  const sessionB = sessions.rows.find((r) => r.tenant_id === tenantB)!.id;

  // Seed als Superuser (postgres) -> umgeht RLS, modelliert den service_role-Write.
  const outputs = await client.query<{ id: string; tenant_id: string }>(
    `INSERT INTO public.modul_output
       (tenant_id, capture_session_id, modul_key, output_kind, title, body, source, status)
     VALUES ($1, $3, 'm04', 'entscheidung', 'Entscheidung A', 'Body A', 'ai_draft', 'proposed'),
            ($2, $4, 'm04', 'entscheidung', 'Entscheidung B', 'Body B', 'ai_draft', 'proposed')
     RETURNING id, tenant_id`,
    [tenantA, tenantB, sessionA, sessionB],
  );
  const outputA = outputs.rows.find((r) => r.tenant_id === tenantA)!.id;
  const outputB = outputs.rows.find((r) => r.tenant_id === tenantB)!.id;

  return { tenantA, tenantB, userA, userB, adminUser, memberUser, outputA, outputB };
}

describe("MIG-124: modul_output schema + indexes (V10 SLC-169 AC-169-1)", () => {
  it("creates modul_output with expected columns, CHECKs — idempotent", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      // 2. Apply darf nicht werfen (IF NOT EXISTS / DROP POLICY IF EXISTS) — 0 Drift.
      await applyMig124(client);

      const cols = await client.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'modul_output'`,
      );
      const byName = new Map(cols.rows.map((c) => [c.column_name, c]));
      // Kern-Spalten vorhanden + Nullability nach §4.
      expect(byName.get("tenant_id")?.is_nullable).toBe("NO");
      expect(byName.get("capture_session_id")?.is_nullable).toBe("NO");
      expect(byName.get("block_checkpoint_id")?.is_nullable).toBe("YES");
      expect(byName.get("modul_key")?.is_nullable).toBe("NO");
      expect(byName.get("output_kind")?.is_nullable).toBe("NO");
      expect(byName.get("body")?.is_nullable).toBe("NO");
      expect(byName.get("reifegrad")?.data_type).toBe("smallint");
      expect(byName.get("evidence_refs")?.data_type).toBe("jsonb");
      expect(byName.get("source")?.column_default ?? "").toContain("ai_draft");
      expect(byName.get("status")?.column_default ?? "").toContain("proposed");

      // CHECK-Constraints (output_kind / status / source / reifegrad) vorhanden.
      const checks = await client.query<{ def: string }>(
        `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = 'modul_output' AND c.contype = 'c'`,
      );
      const allChecks = checks.rows.map((r) => r.def).join(" | ");
      expect(allChecks).toContain("entscheidung");
      expect(allChecks).toContain("ki_hebel");
      expect(allChecks).toContain("proposed");
      expect(allChecks).toContain("ai_draft");
      expect(allChecks).toMatch(/reifegrad/);
    });
  });

  it("creates the three lookup indexes (AC-169-1)", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const idx = await client.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
         WHERE tablename = 'modul_output' AND schemaname = 'public'`,
      );
      const names = idx.rows.map((r) => r.indexname);
      expect(names).toContain("idx_modul_output_tenant");
      expect(names).toContain("idx_modul_output_capture_session");
      expect(names).toContain("idx_modul_output_modul_key");
    });
  });

  it("has RLS enabled on modul_output", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const r = await client.query<{ relrowsecurity: boolean }>(
        `SELECT relrowsecurity FROM pg_class WHERE relname = 'modul_output'`,
      );
      expect(r.rows[0].relrowsecurity).toBe(true);
    });
  });
});

describe("MIG-124: modul_output RLS isolation (V10 SLC-169 AC-169-2)", () => {
  it("tenant_admin A sees only own-tenant rows; B only B's", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const f = await seedModulFixture(client);
      await withJwtContext(client, f.userA, async () => {
        const r = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.modul_output`,
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].tenant_id).toBe(f.tenantA);
      });
      await withJwtContext(client, f.userB, async () => {
        const r = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.modul_output`,
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].tenant_id).toBe(f.tenantB);
      });
    });
  });

  it("strategaize_admin sees both tenants' rows (cross-tenant audit)", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const f = await seedModulFixture(client);
      await withJwtContext(client, f.adminUser, async () => {
        const r = await client.query(`SELECT id FROM public.modul_output`);
        expect(r.rowCount).toBe(2);
      });
    });
  });

  it("second tenant_admin of A sees own-tenant rows (tenant-scoped read policy)", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const f = await seedModulFixture(client);
      await withJwtContext(client, f.memberUser, async () => {
        const r = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.modul_output`,
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].tenant_id).toBe(f.tenantA);
      });
    });
  });

  it("tenant_admin A can UPDATE own-tenant row (Edit/Status)", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const f = await seedModulFixture(client);
      await withJwtContext(client, f.userA, async () => {
        const upd = await client.query(
          `UPDATE public.modul_output SET status = 'accepted', source = 'edited'
           WHERE id = $1`,
          [f.outputA],
        );
        expect(upd.rowCount).toBe(1);
      });
    });
  });

  it("tenant_admin A cannot UPDATE Tenant B's row (USING filter -> 0 rows)", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const f = await seedModulFixture(client);
      await withJwtContext(client, f.userA, async () => {
        const upd = await client.query(
          `UPDATE public.modul_output SET status = 'rejected' WHERE id = $1`,
          [f.outputB],
        );
        // RLS USING-Filter macht die Fremd-Row unsichtbar -> 0 rows (kein Error).
        expect(upd.rowCount).toBe(0);
      });
    });
  });

  it("tenant_admin A cannot INSERT an ai_draft row (service_role-only)", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const f = await seedModulFixture(client);
      // Eine eigene Session fuer A, damit der FK haelt.
      const sess = await client.query<{ id: string }>(
        `SELECT capture_session_id AS id FROM public.modul_output WHERE id = $1`,
        [f.outputA],
      );
      await withJwtContext(client, f.userA, async () => {
        let errorMessage: string | null = null;
        await client.query("SAVEPOINT try_insert");
        try {
          await client.query(
            `INSERT INTO public.modul_output
               (tenant_id, capture_session_id, modul_key, output_kind, body)
             VALUES ($1, $2, 'm04', 'entscheidung', 'x')`,
            [f.tenantA, sess.rows[0].id],
          );
        } catch (e) {
          errorMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT try_insert");
        // Kein authenticated-INSERT-GRANT/Policy -> permission denied bzw. RLS-Deny.
        expect(errorMessage).toMatch(/permission denied|row-level security/);
      });
    });
  });
});
