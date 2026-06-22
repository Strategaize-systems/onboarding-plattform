import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { seedTestTenants } from "@/test/fixtures/tenants";

// V10 SLC-174 MT-3 (AC-174-7) — DB-Sidecar: der Worker-INSERT-Shape gegen die
// echte modul_output-Tabelle (MIG-124). Als Superuser (postgres) eingefuegt =
// modelliert den service_role-Write (BYPASSRLS). node:20-Sidecar gegen Coolify-DB.
//
// Pattern-Reuse: migration-124-modul-output.test.ts (self-apply Mig 124 in der
// gerollbackten Test-Transaktion; BEGIN/COMMIT entfernt).

async function applyMig124(client: Client): Promise<void> {
  const sql = readFileSync(
    path.join(process.cwd(), "sql/migrations/124_v10_stb_modul_domain.sql"),
    "utf8",
  )
    .replace(/^\s*BEGIN;\s*$/gm, "")
    .replace(/^\s*COMMIT;\s*$/gm, "");
  await client.query(sql);
}

async function seedSession(client: Client): Promise<{ tenantId: string; sessionId: string }> {
  const { tenantA, userA, templateId, templateVersion } = await seedTestTenants(client);
  const res = await client.query<{ id: string }>(
    `INSERT INTO public.capture_session
       (tenant_id, template_id, template_version, owner_user_id, status, tier)
     VALUES ($1, $2, $3, $4, 'open', 'blueprint')
     RETURNING id`,
    [tenantA, templateId, templateVersion, userA],
  );
  return { tenantId: tenantA, sessionId: res.rows[0].id };
}

describe("SLC-174: modul_output worker write-shape (AC-174-7)", () => {
  it("persists the triple + ki_hebel rows in the exact worker shape", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const { tenantId, sessionId } = await seedSession(client);
      const jobId = (await client.query<{ id: string }>("SELECT gen_random_uuid() AS id")).rows[0].id;

      // Triple (3 kinds) + 1 ki_hebel (reifegrad 2) — der Worker-INSERT-Shape.
      const ins = await client.query(
        `INSERT INTO public.modul_output
           (tenant_id, capture_session_id, modul_key, output_kind, title, body,
            reifegrad, evidence_refs, source, status, ai_job_id)
         VALUES
           ($1,$2,'m04','entscheidung','E','Body-E', NULL, $3::jsonb, 'ai_draft','proposed',$4),
           ($1,$2,'m04','standard','S','Body-S', NULL, '[]'::jsonb, 'ai_draft','proposed',$4),
           ($1,$2,'m04','implementierungsschritt','I','Body-I', NULL, '[]'::jsonb, 'ai_draft','proposed',$4),
           ($1,$2,'m04','ki_hebel','Autokommentar','Hebel-Body', 2, '[]'::jsonb, 'ai_draft','proposed',$4)`,
        [tenantId, sessionId, JSON.stringify(["F-M04-001", "F-M04-009"]), jobId],
      );
      expect(ins.rowCount).toBe(4);

      const evid = await client.query<{ evidence_refs: unknown }>(
        `SELECT evidence_refs FROM public.modul_output
         WHERE ai_job_id = $1 AND output_kind = 'entscheidung'`,
        [jobId],
      );
      expect(evid.rows[0].evidence_refs).toEqual(["F-M04-001", "F-M04-009"]);

      const hebel = await client.query<{ reifegrad: number }>(
        `SELECT reifegrad FROM public.modul_output WHERE ai_job_id = $1 AND output_kind = 'ki_hebel'`,
        [jobId],
      );
      expect(hebel.rows[0].reifegrad).toBe(2);

      // Cleanup-Pfad des Workers: DELETE WHERE ai_job_id entfernt genau diesen Lauf.
      const del = await client.query(`DELETE FROM public.modul_output WHERE ai_job_id = $1`, [jobId]);
      expect(del.rowCount).toBe(4);
    });
  });

  it("rejects reifegrad out of [1,4] and an invalid output_kind (CHECK)", async () => {
    await withTestDb(async (client) => {
      await applyMig124(client);
      const { tenantId, sessionId } = await seedSession(client);

      await client.query("SAVEPOINT s1");
      let reifegradErr: string | null = null;
      try {
        await client.query(
          `INSERT INTO public.modul_output (tenant_id, capture_session_id, modul_key, output_kind, body, reifegrad)
           VALUES ($1,$2,'m04','ki_hebel','x', 5)`,
          [tenantId, sessionId],
        );
      } catch (e) {
        reifegradErr = (e as Error).message;
      }
      await client.query("ROLLBACK TO SAVEPOINT s1");
      expect(reifegradErr).toMatch(/reifegrad|check/i);

      await client.query("SAVEPOINT s2");
      let kindErr: string | null = null;
      try {
        await client.query(
          `INSERT INTO public.modul_output (tenant_id, capture_session_id, modul_key, output_kind, body)
           VALUES ($1,$2,'m04','sonstiges','x')`,
          [tenantId, sessionId],
        );
      } catch (e) {
        kindErr = (e as Error).message;
      }
      await client.query("ROLLBACK TO SAVEPOINT s2");
      expect(kindErr).toMatch(/output_kind|check/i);
    });
  });
});
