import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { seedTestTenants } from "@/test/fixtures/tenants";

// V9.8 SLC-V9.8-A MT-1 (AC-A-1 / AC-A-4) — Schema-/Index-/Containment-Test fuer
// Mig 123 (knowledge_unit.themes + GIN). Die Migration ist erst /deploy LIVE
// (R-A-1) — deshalb wird sie hier IN der gerollbackten Test-Transaktion
// self-applied (BEGIN/COMMIT entfernt, weil withTestDb bereits eine Transaktion
// haelt). Beweist: Spalte (text[] NOT NULL DEFAULT '{}') + GIN-Index +
// Containment-Query (@>) + Idempotenz.
//
// node:20-Sidecar gegen Coolify-DB (TEST_DATABASE_URL). Ohne DB DB-gated skip.

/**
 * Mig 123 self-apply innerhalb der Test-Transaktion. BEGIN/COMMIT der Migration
 * werden entfernt (sonst wuerde COMMIT die aeussere withTestDb-Transaktion
 * vorzeitig beenden). Idempotent (IF NOT EXISTS) — mehrfaches Anwenden ist safe.
 */
async function applyThemesMigration(client: Client): Promise<void> {
  const sql = readFileSync(
    path.join(
      process.cwd(),
      "sql/migrations/123_v98_knowledge_unit_themes.sql",
    ),
    "utf8",
  )
    .replace(/^\s*BEGIN;\s*$/gm, "")
    .replace(/^\s*COMMIT;\s*$/gm, "");
  await client.query(sql);
}

async function seedKnowledgeUnit(
  client: Client,
  themes: string[] | null,
): Promise<string> {
  const { tenantA, userA, templateId, templateVersion } =
    await seedTestTenants(client);

  const session = await client.query<{ id: string }>(
    `INSERT INTO public.capture_session
       (tenant_id, template_id, template_version, owner_user_id, status)
     VALUES ($1, $2, $3, $4, 'open')
     RETURNING id`,
    [tenantA, templateId, templateVersion, userA],
  );
  const sessionId = session.rows[0].id;

  const cp = await client.query<{ id: string }>(
    `INSERT INTO public.block_checkpoint
       (tenant_id, capture_session_id, block_key, checkpoint_type,
        content, content_hash, created_by)
     VALUES ($1, $2, 'email_bulk', 'email_bulk_import',
             '{}'::jsonb, 'mig123-cp-hash', $3)
     RETURNING id`,
    [tenantA, sessionId, userA],
  );
  const checkpointId = cp.rows[0].id;

  // themes bewusst weggelassen wenn null → DEFAULT '{}' greift (AC-A-1).
  const ku =
    themes === null
      ? await client.query<{ id: string }>(
          `INSERT INTO public.knowledge_unit
             (tenant_id, capture_session_id, block_checkpoint_id, block_key,
              unit_type, source, title, body, confidence, status, updated_by)
           VALUES ($1, $2, $3, 'kommunikation', 'observation', 'manual',
                   'Titel', 'Body', 'high', 'accepted', $4)
           RETURNING id`,
          [tenantA, sessionId, checkpointId, userA],
        )
      : await client.query<{ id: string }>(
          `INSERT INTO public.knowledge_unit
             (tenant_id, capture_session_id, block_checkpoint_id, block_key,
              unit_type, source, title, body, confidence, status, updated_by,
              themes)
           VALUES ($1, $2, $3, 'kommunikation', 'observation', 'manual',
                   'Titel', 'Body', 'high', 'accepted', $4, $5::text[])
           RETURNING id`,
          [tenantA, sessionId, checkpointId, userA, themes],
        );
  return ku.rows[0].id;
}

describe("MIG-123: knowledge_unit.themes (V9.8 SLC-V9.8-A)", () => {
  it("adds themes text[] NOT NULL DEFAULT '{}' — idempotent (AC-A-1)", async () => {
    await withTestDb(async (client) => {
      await applyThemesMigration(client);
      // 2. Apply darf nicht werfen (IF NOT EXISTS) — 0 Drift.
      await applyThemesMigration(client);

      const col = await client.query<{
        data_type: string;
        udt_name: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `SELECT data_type, udt_name, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'knowledge_unit'
           AND column_name = 'themes'`,
      );
      expect(col.rowCount).toBe(1);
      expect(col.rows[0].data_type).toBe("ARRAY");
      expect(col.rows[0].udt_name).toBe("_text"); // text[]
      expect(col.rows[0].is_nullable).toBe("NO");
      expect(col.rows[0].column_default ?? "").toContain("{}");
    });
  });

  it("creates a GIN index idx_knowledge_unit_themes (AC-A-4)", async () => {
    await withTestDb(async (client) => {
      await applyThemesMigration(client);

      const idx = await client.query<{ amname: string }>(
        `SELECT am.amname
         FROM pg_class i
         JOIN pg_am am ON am.oid = i.relam
         WHERE i.relname = 'idx_knowledge_unit_themes'`,
      );
      expect(idx.rowCount).toBe(1);
      expect(idx.rows[0].amname).toBe("gin");
    });
  });

  it("Bestands-/Default-Row bekommt themes = '{}' (AC-A-1: kein Backfill)", async () => {
    await withTestDb(async (client) => {
      await applyThemesMigration(client);
      const kuId = await seedKnowledgeUnit(client, null);

      const row = await client.query<{ themes: string[] }>(
        `SELECT themes FROM public.knowledge_unit WHERE id = $1`,
        [kuId],
      );
      expect(row.rows[0].themes).toEqual([]);
    });
  });

  it("supports containment queries (@> / &&) via the themes column (AC-A-4)", async () => {
    await withTestDb(async (client) => {
      await applyThemesMigration(client);
      const kuId = await seedKnowledgeUnit(client, ["pricing", "prozesse"]);

      const stored = await client.query<{ themes: string[] }>(
        `SELECT themes FROM public.knowledge_unit WHERE id = $1`,
        [kuId],
      );
      expect(stored.rows[0].themes).toEqual(["pricing", "prozesse"]);

      const contains = await client.query<{ id: string }>(
        `SELECT id FROM public.knowledge_unit
         WHERE id = $1 AND themes @> ARRAY['pricing']`,
        [kuId],
      );
      expect(contains.rowCount).toBe(1);

      const overlaps = await client.query<{ id: string }>(
        `SELECT id FROM public.knowledge_unit
         WHERE id = $1 AND themes && ARRAY['prozesse', 'nicht-vorhanden']`,
        [kuId],
      );
      expect(overlaps.rowCount).toBe(1);

      const misses = await client.query<{ id: string }>(
        `SELECT id FROM public.knowledge_unit
         WHERE id = $1 AND themes @> ARRAY['nicht-vorhanden']`,
        [kuId],
      );
      expect(misses.rowCount).toBe(0);
    });
  });
});
