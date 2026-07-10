// V20 SLC-193 MT-1 — Coolify-DB-Sidecar-Test: berater_assigned_tenant_ids COALESCE-Haertung
// (MIG-133, DEC-286 / ISSUE-129). Schliesst den Caller-Param-Trust-IDOR: im authenticated-
// Kontext gewinnt IMMER auth.uid() (Self), der service_role-Query-Layer (auth.uid()=NULL)
// faellt auf den explizit uebergebenen p_uid zurueck.
//
// withTestDb haelt eine Tx (Auto-ROLLBACK), MIG-133 wird pro Tx frisch angewendet.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";

const MIG133_PATH = resolve(
  __dirname,
  "../../../sql/migrations/133_v20_authz_hardening.sql",
);

async function applyMig133(client: Client): Promise<void> {
  const sql = readFileSync(MIG133_PATH, "utf-8")
    .replace(/^\s*BEGIN\s*;\s*$/m, "")
    .replace(/^\s*COMMIT\s*;\s*$/m, "");
  await client.query(sql);
}

interface TwoBerater {
  beraterA: string;
  beraterB: string;
  tenantA: string;
  tenantB: string;
  adminId: string;
}

/** Zwei Berater, je einer Kanzlei zugewiesen; ein Admin als assigned_by. */
async function seedTwoBerater(client: Client): Promise<TwoBerater> {
  // gen_random_uuid()-basierte Eindeutigkeit fuer die Test-User.
  async function beraterUser(): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
          'v20-berater-' || substr(gen_random_uuid()::text,1,8) || '@onboarding.test', '',
          '{}'::jsonb, jsonb_build_object('role','strategaize_berater'), now(), now())
       RETURNING id`,
    );
    return r.rows[0]!.id;
  }

  const tA = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind)
     VALUES ('V20-KanzleiA-' || substr(gen_random_uuid()::text,1,8), 'de', 'partner_organization') RETURNING id`,
  );
  const tenantA = tA.rows[0]!.id;
  const tB = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind)
     VALUES ('V20-KanzleiB-' || substr(gen_random_uuid()::text,1,8), 'de', 'partner_organization') RETURNING id`,
  );
  const tenantB = tB.rows[0]!.id;

  const beraterA = await beraterUser();
  const beraterB = await beraterUser();

  const admin = await client.query<{ id: string }>(
    `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
        'v20-admin-' || substr(gen_random_uuid()::text,1,8) || '@onboarding.test', '',
        '{}'::jsonb, jsonb_build_object('role','strategaize_admin'), now(), now())
     RETURNING id`,
  );
  const adminId = admin.rows[0]!.id;

  await client.query(
    `INSERT INTO public.berater_tenant_assignments (berater_user_id, tenant_id, assigned_by)
     VALUES ($1,$2,$4), ($3,$5,$4)`,
    [beraterA, tenantA, beraterB, adminId, tenantB],
  );

  return { beraterA, beraterB, tenantA, tenantB, adminId };
}

describe("MIG-133 berater_assigned_tenant_ids — COALESCE(auth.uid(), p_uid) (DEC-286)", () => {
  it("authenticated: auth.uid() gewinnt, fremder p_uid wird ignoriert (IDOR-Block)", async () => {
    await withTestDb(async (client) => {
      await applyMig133(client);
      const f = await seedTwoBerater(client);

      // Berater A ist eingeloggt, versucht Bs uid als p_uid unterzuschieben.
      await withJwtContext(client, f.beraterA, async () => {
        const res = await client.query<{ own: boolean; fremd: boolean }>(
          `SELECT $2 = ANY(public.berater_assigned_tenant_ids($1)) AS own,
                  $3 = ANY(public.berater_assigned_tenant_ids($1)) AS fremd`,
          [f.beraterB, f.tenantA, f.tenantB],
        );
        // trotz p_uid = beraterB liefert die Funktion As Tenants (auth.uid()=A).
        expect(res.rows[0]!.own).toBe(true);
        expect(res.rows[0]!.fremd).toBe(false);
      });
    });
  });

  it("service_role/Query-Layer (auth.uid()=NULL): p_uid greift (Backward-Compat)", async () => {
    await withTestDb(async (client) => {
      await applyMig133(client);
      const f = await seedTwoBerater(client);

      // Kein JWT-Context -> auth.uid()=NULL -> COALESCE faellt auf p_uid zurueck.
      const res = await client.query<{ b: boolean; a: boolean }>(
        `SELECT $2 = ANY(public.berater_assigned_tenant_ids($1)) AS b,
                $3 = ANY(public.berater_assigned_tenant_ids($1)) AS a`,
        [f.beraterB, f.tenantB, f.tenantA],
      );
      expect(res.rows[0]!.b).toBe(true);
      expect(res.rows[0]!.a).toBe(false);
    });
  });
});
