import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

// V10 SLC-169 MT-2 (AC-169-3 / AC-169-4) — rpc_enqueue_module_output + Tier-Mapping
// + CHECK-Erweiterung fuer Mig 124. Self-apply in der gerollbackten Test-Transaktion
// (BEGIN/COMMIT entfernt). Beweist: tier-gated Enqueue (blueprint), Ownership-Pre-
// Check, idempotenter Re-Enqueue-Schutz, fn_min_tier_for_job-Mapping, CHECK akzeptiert
// die neuen job_type-/role-Werte.
//
// node:20-Sidecar gegen Coolify-DB (TEST_DATABASE_URL). withJwtContext setzt JWT-
// Claims, sodass auth.uid()/auth.user_tenant_id() im SECURITY-DEFINER-RPC greifen.

async function applyMig124(client: Client): Promise<void> {
  const sql = readFileSync(
    path.join(process.cwd(), "sql/migrations/124_v10_stb_modul_domain.sql"),
    "utf8",
  )
    .replace(/^\s*BEGIN;\s*$/gm, "")
    .replace(/^\s*COMMIT;\s*$/gm, "");
  await client.query(sql);
}

interface RpcFixture {
  tenantA: string;
  tenantB: string;
  userA: string; // tenant_admin A
  sessionABlueprint: string; // A, tier=blueprint
  sessionAFree: string; // A, tier=free
  sessionB: string; // B, tier=blueprint (Fremd-Tenant)
}

async function seedRpcFixture(client: Client): Promise<RpcFixture> {
  const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
    await seedTestTenants(client);

  const sessions = await client.query<{ id: string; tier: string; tenant_id: string }>(
    `INSERT INTO public.capture_session
       (tenant_id, template_id, template_version, owner_user_id, status, tier)
     VALUES ($1, $3, $4, $5, 'open', 'blueprint'),
            ($1, $3, $4, $5, 'open', 'free'),
            ($2, $3, $4, $6, 'open', 'blueprint')
     RETURNING id, tier, tenant_id`,
    [tenantA, tenantB, templateId, templateVersion, userA, userB],
  );
  const sessionABlueprint = sessions.rows.find(
    (r) => r.tier === "blueprint" && r.tenant_id === tenantA,
  )!.id;
  const sessionAFree = sessions.rows.find((r) => r.tier === "free")!.id;
  const sessionB = sessions.rows.find(
    (r) => r.tier === "blueprint" && r.tenant_id === tenantB,
  )!.id;

  return { tenantA, tenantB, userA, sessionABlueprint, sessionAFree, sessionB };
}

describe("MIG-124: fn_min_tier_for_job + CHECK extension (V10 SLC-169 AC-169-4)", () => {
  it("maps module_output_synthesis -> 'blueprint'", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const r = await client.query<{ tier: string }>(
        `SELECT public.fn_min_tier_for_job('module_output_synthesis') AS tier`,
      );
      expect(r.rows[0].tier).toBe("blueprint");
    });
  });

  it("ai_jobs.job_type CHECK accepts 'module_output_synthesis'", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const def = await client.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conname = 'ai_jobs_job_type_check'`,
      );
      expect(def.rows[0].def).toContain("module_output_synthesis");
    });
  });

  it("ai_cost_ledger.role CHECK accepts the two worker roles", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const def = await client.query<{ def: string }>(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conname = 'ai_cost_ledger_role_check'`,
      );
      expect(def.rows[0].def).toContain("module_output_synthesis");
      expect(def.rows[0].def).toContain("module_output_critic");
    });
  });
});

describe("MIG-124: rpc_enqueue_module_output (V10 SLC-169 AC-169-3)", () => {
  it("enqueues a module_output_synthesis job for an own blueprint session", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const f = await seedRpcFixture(client);
      await withJwtContext(client, f.userA, async () => {
        const r = await client.query<{ result: { job_id: string; deduplicated: boolean } }>(
          `SELECT public.rpc_enqueue_module_output($1, 'm04') AS result`,
          [f.sessionABlueprint],
        );
        expect(r.rows[0].result.deduplicated).toBe(false);
        expect(r.rows[0].result.job_id).toBeTruthy();
      });
      // Job-Row prüfen (Superuser-Kontext, RLS umgangen).
      const job = await client.query<{
        job_type: string;
        status: string;
        session_tier: string;
        payload: { capture_session_id: string; modul_key: string };
      }>(
        `SELECT job_type, status, session_tier, payload
         FROM public.ai_jobs
         WHERE job_type = 'module_output_synthesis'
           AND payload->>'capture_session_id' = $1`,
        [f.sessionABlueprint],
      );
      expect(job.rowCount).toBe(1);
      expect(job.rows[0].status).toBe("pending");
      expect(job.rows[0].session_tier).toBe("blueprint");
      expect(job.rows[0].payload.modul_key).toBe("m04");
    });
  });

  it("is idempotent: a second enqueue returns the same in-flight job", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const f = await seedRpcFixture(client);
      await withJwtContext(client, f.userA, async () => {
        const first = await client.query<{ result: { job_id: string; deduplicated: boolean } }>(
          `SELECT public.rpc_enqueue_module_output($1, 'm04') AS result`,
          [f.sessionABlueprint],
        );
        const second = await client.query<{ result: { job_id: string; deduplicated: boolean } }>(
          `SELECT public.rpc_enqueue_module_output($1, 'm04') AS result`,
          [f.sessionABlueprint],
        );
        expect(second.rows[0].result.deduplicated).toBe(true);
        expect(second.rows[0].result.job_id).toBe(first.rows[0].result.job_id);
      });
      const count = await client.query<{ n: string }>(
        `SELECT count(*) AS n FROM public.ai_jobs
         WHERE job_type = 'module_output_synthesis'
           AND payload->>'capture_session_id' = $1`,
        [f.sessionABlueprint],
      );
      expect(count.rows[0].n).toBe("1");
    });
  });

  it("denies enqueue for a free-tier session (tier_gate_denied)", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const f = await seedRpcFixture(client);
      await withJwtContext(client, f.userA, async () => {
        let errorMessage: string | null = null;
        await client.query("SAVEPOINT try_low_tier");
        try {
          await client.query(
            `SELECT public.rpc_enqueue_module_output($1, 'm04')`,
            [f.sessionAFree],
          );
        } catch (e) {
          errorMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT try_low_tier");
        expect(errorMessage).toMatch(/tier_gate_denied/);
      });
    });
  });

  it("denies enqueue for another tenant's session (ownership pre-check)", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const f = await seedRpcFixture(client);
      await withJwtContext(client, f.userA, async () => {
        let errorMessage: string | null = null;
        await client.query("SAVEPOINT try_foreign");
        try {
          await client.query(
            `SELECT public.rpc_enqueue_module_output($1, 'm04')`,
            [f.sessionB],
          );
        } catch (e) {
          errorMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT try_foreign");
        expect(errorMessage).toMatch(/nicht gefunden|kein Zugriff/);
      });
    });
  });
});
