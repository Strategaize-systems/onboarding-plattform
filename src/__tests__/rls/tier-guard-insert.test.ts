// V20 SLC-193 MT-1 — Coolify-DB-Sidecar-Test: capture_session tier-Guard INSERT-Coerce
// + UPDATE-Deny + DEFAULT='free' (MIG-133, DEC-279 / ISSUE-125).
//
// Strategie identisch zu 121-v975-tier-gating.test.ts: withTestDb haelt eine Tx (Auto-
// ROLLBACK), MIG-133 wird PRO Tx frisch angewendet (outer BEGIN/COMMIT gestrippt), auch
// vor dem Live-Apply (/deploy). Der Trigger-Effekt wird via Rollen-Switch geprueft
// (service_role vs non-service_role); beide umgehen RLS, daher kein RLS-Setup noetig.
// Erwartete Trigger-Rejections via SAVEPOINT (coolify-test-setup.md §2).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";

const MIG133_PATH = resolve(
  __dirname,
  "../../../sql/migrations/133_v20_authz_hardening.sql",
);

function loadMigrationSql(path: string): string {
  return readFileSync(path, "utf-8")
    .replace(/^\s*BEGIN\s*;\s*$/m, "")
    .replace(/^\s*COMMIT\s*;\s*$/m, "");
}

async function applyMig133(client: Client): Promise<void> {
  await client.query(loadMigrationSql(MIG133_PATH));
}

interface Prereqs {
  tenantId: string;
  userId: string;
  templateId: string;
  templateVersion: string;
}

/** Seedet tenant + tenant_admin-User (handle_new_user legt profile an) + laedt ein Template. */
async function seedPrereqs(client: Client): Promise<Prereqs> {
  const t = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name) VALUES ('V20-tier-' || substr(gen_random_uuid()::text,1,8)) RETURNING id`,
  );
  const tenantId = t.rows[0]!.id;
  const u = await client.query<{ id: string }>(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'v20-tier-' || substr(gen_random_uuid()::text,1,8) || '@onboarding.test', '',
        '{}'::jsonb, jsonb_build_object('tenant_id',$1::text,'role','tenant_admin'), now(), now())
     RETURNING id`,
    [tenantId],
  );
  const userId = u.rows[0]!.id;
  const tpl = await client.query<{ id: string; version: string }>(
    `SELECT id, version FROM public.template LIMIT 1`,
  );
  return {
    tenantId,
    userId,
    templateId: tpl.rows[0]!.id,
    templateVersion: tpl.rows[0]!.version,
  };
}

const INSERT_COLS =
  "tenant_id, template_id, template_version, owner_user_id, status, answers, released_for_strategaize_review, metadata";

/** INSERT capture_session mit optionalem tier; gibt die gespeicherte tier zurueck. */
async function insertSession(
  client: Client,
  p: Prereqs,
  tier: string | null,
): Promise<string> {
  const base = `'open','{}'::jsonb,false,'{}'::jsonb`;
  const sql = tier
    ? `INSERT INTO public.capture_session (${INSERT_COLS}, tier)
       VALUES ($1,$2,$3,$4,${base},$5) RETURNING tier`
    : `INSERT INTO public.capture_session (${INSERT_COLS})
       VALUES ($1,$2,$3,$4,${base}) RETURNING tier`;
  const params = tier
    ? [p.tenantId, p.templateId, p.templateVersion, p.userId, tier]
    : [p.tenantId, p.templateId, p.templateVersion, p.userId];
  const r = await client.query<{ tier: string }>(sql, params);
  return r.rows[0]!.tier;
}

async function expectReject(
  client: Client,
  query: string,
  params: unknown[],
): Promise<string> {
  await client.query("SAVEPOINT try_op");
  let msg = "";
  try {
    await client.query(query, params);
  } catch (e) {
    msg = (e as Error).message;
  }
  await client.query("ROLLBACK TO SAVEPOINT try_op");
  return msg;
}

describe("MIG-133 capture_session tier-Guard — DEFAULT + INSERT-Coerce (DEC-279)", () => {
  it("Column-DEFAULT ist 'free' (least-privilege)", async () => {
    await withTestDb(async (client) => {
      await applyMig133(client);
      const col = await client.query<{ column_default: string | null }>(
        `SELECT column_default FROM information_schema.columns
          WHERE table_schema='public' AND table_name='capture_session' AND column_name='tier'`,
      );
      expect(col.rows[0]!.column_default ?? "").toContain("free");
    });
  });

  it("service_role-INSERT behaelt den explizit gesetzten tier ('handbook')", async () => {
    await withTestDb(async (client) => {
      await applyMig133(client);
      const p = await seedPrereqs(client);
      await client.query("SET LOCAL ROLE service_role");
      const tier = await insertSession(client, p, "handbook");
      await client.query("RESET ROLE");
      expect(tier).toBe("handbook");
    });
  });

  it("non-service_role-INSERT (postgres) wird auf 'free' coerced trotz tier='handbook'", async () => {
    await withTestDb(async (client) => {
      await applyMig133(client);
      const p = await seedPrereqs(client);
      // current_user = postgres (kein SET ROLE) -> non-service_role -> Coerce.
      // authenticated verhaelt sich identisch (gleicher <> 'service_role'-Zweig).
      const tier = await insertSession(client, p, "handbook");
      expect(tier).toBe("free");
    });
  });

  it("INSERT ohne tier landet auf DEFAULT 'free' (service_role)", async () => {
    await withTestDb(async (client) => {
      await applyMig133(client);
      const p = await seedPrereqs(client);
      await client.query("SET LOCAL ROLE service_role");
      const tier = await insertSession(client, p, null);
      await client.query("RESET ROLE");
      expect(tier).toBe("free");
    });
  });
});

describe("MIG-133 capture_session tier-Guard — UPDATE-Deny (unveraendert seit 121)", () => {
  it("UPDATE tier durch non-service_role (postgres) -> insufficient_privilege", async () => {
    await withTestDb(async (client) => {
      await applyMig133(client);
      const p = await seedPrereqs(client);
      await client.query("SET LOCAL ROLE service_role");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session (${INSERT_COLS}, tier)
         VALUES ($1,$2,$3,$4,'open','{}'::jsonb,false,'{}'::jsonb,'blueprint') RETURNING id`,
        [p.tenantId, p.templateId, p.templateVersion, p.userId],
      );
      await client.query("RESET ROLE");
      const sessionId = inserted.rows[0]!.id;

      const err = await expectReject(
        client,
        `UPDATE public.capture_session SET tier='handbook' WHERE id=$1`,
        [sessionId],
      );
      expect(err).toMatch(/service_role required|insufficient/i);
    });
  });

  it("UPDATE tier durch service_role ist erlaubt", async () => {
    await withTestDb(async (client) => {
      await applyMig133(client);
      const p = await seedPrereqs(client);
      await client.query("SET LOCAL ROLE service_role");
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.capture_session (${INSERT_COLS}, tier)
         VALUES ($1,$2,$3,$4,'open','{}'::jsonb,false,'{}'::jsonb,'blueprint') RETURNING id`,
        [p.tenantId, p.templateId, p.templateVersion, p.userId],
      );
      const sessionId = inserted.rows[0]!.id;
      await client.query(`UPDATE public.capture_session SET tier='handbook' WHERE id=$1`, [
        sessionId,
      ]);
      await client.query("RESET ROLE");
      const r = await client.query<{ tier: string }>(
        `SELECT tier FROM public.capture_session WHERE id=$1`,
        [sessionId],
      );
      expect(r.rows[0]!.tier).toBe("handbook");
    });
  });
});
