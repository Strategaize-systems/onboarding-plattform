import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { seedTestTenants } from "@/test/fixtures/tenants";

// V9.8 SLC-V9.8-B MT-1 (AC-B-4 / SC-4) — DB-Sidecar Tenant-Isolation fuer das
// Tag-Vokabular. Beweist die Eigenschaft, auf die getTenantTagVocabulary baut:
// die tenant-scoped Aggregation `WHERE tenant_id = $1` ueber knowledge_unit.themes
// leakt KEINE Tags eines anderen Tenants. getTenantTagVocabulary selbst nutzt
// supabase-js/PostgREST (`.eq("tenant_id", tenantId)`) — diese Sidecar prueft die
// gleiche WHERE-Semantik direkt via pg.Client (raw SQL) + die JS-Aggregation
// (Frequenz/Sort), 1:1 zum Loader.
//
// Mig 123 ist erst /deploy LIVE (R-A-1) → hier IN der gerollbackten Tx
// self-applied (BEGIN/COMMIT entfernt). node:20-Sidecar gegen Coolify-DB
// (TEST_DATABASE_URL); ohne DB DB-gated skip.

function applyThemesMigration(client: Client): Promise<unknown> {
  const sql = readFileSync(
    path.join(process.cwd(), "sql/migrations/123_v98_knowledge_unit_themes.sql"),
    "utf8",
  )
    .replace(/^\s*BEGIN;\s*$/gm, "")
    .replace(/^\s*COMMIT;\s*$/gm, "");
  return client.query(sql);
}

async function seedKnowledgeUnit(
  client: Client,
  tenantId: string,
  ownerUserId: string,
  templateId: string,
  templateVersion: string,
  themes: string[],
  marker: string,
): Promise<void> {
  const session = await client.query<{ id: string }>(
    `INSERT INTO public.capture_session
       (tenant_id, template_id, template_version, owner_user_id, status)
     VALUES ($1, $2, $3, $4, 'open')
     RETURNING id`,
    [tenantId, templateId, templateVersion, ownerUserId],
  );
  const sessionId = session.rows[0].id;

  const cp = await client.query<{ id: string }>(
    `INSERT INTO public.block_checkpoint
       (tenant_id, capture_session_id, block_key, checkpoint_type,
        content, content_hash, created_by)
     VALUES ($1, $2, 'email_bulk', 'email_bulk_import',
             '{}'::jsonb, $3, $4)
     RETURNING id`,
    [tenantId, sessionId, `vocab-iso-${marker}`, ownerUserId],
  );
  const checkpointId = cp.rows[0].id;

  await client.query(
    `INSERT INTO public.knowledge_unit
       (tenant_id, capture_session_id, block_checkpoint_id, block_key,
        unit_type, source, title, body, confidence, status, updated_by, themes)
     VALUES ($1, $2, $3, 'kommunikation', 'observation', 'manual',
             'Titel', 'Body', 'high', 'accepted', $4, $5::text[])`,
    [tenantId, sessionId, checkpointId, ownerUserId, themes],
  );
}

/** Mirror der Loader-Aggregation: Frequenz desc, Tie alpha asc, Cap. */
function aggregate(rows: { themes: string[] }[], cap = 60): string[] {
  const freq = new Map<string, number>();
  for (const r of rows) {
    for (const raw of r.themes ?? []) {
      const tag = typeof raw === "string" ? raw.trim() : "";
      if (tag) freq.set(tag, (freq.get(tag) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    .slice(0, cap)
    .map(([t]) => t);
}

describe("tag-vocabulary tenant isolation (V9.8 SLC-V9.8-B, AC-B-4)", () => {
  it("a tenant-scoped themes aggregation never leaks another tenant's tags", async () => {
    await withTestDb(async (client) => {
      await applyThemesMigration(client);
      const { tenantA, tenantB, userA, userB, templateId, templateVersion } =
        await seedTestTenants(client);

      // Tenant A: pricing (x2), prozesse (x1).
      await seedKnowledgeUnit(
        client, tenantA, userA, templateId, templateVersion,
        ["pricing", "prozesse"], "a1",
      );
      await seedKnowledgeUnit(
        client, tenantA, userA, templateId, templateVersion,
        ["pricing"], "a2",
      );
      // Tenant B: a unique tag that MUST never appear for tenant A.
      await seedKnowledgeUnit(
        client, tenantB, userB, templateId, templateVersion,
        ["geheim-b-only", "pricing"], "b1",
      );

      const aRows = await client.query<{ themes: string[] }>(
        `SELECT themes FROM public.knowledge_unit WHERE tenant_id = $1`,
        [tenantA],
      );
      const vocabA = aggregate(aRows.rows);
      expect(vocabA).toEqual(["pricing", "prozesse"]);
      expect(vocabA).not.toContain("geheim-b-only");

      const bRows = await client.query<{ themes: string[] }>(
        `SELECT themes FROM public.knowledge_unit WHERE tenant_id = $1`,
        [tenantB],
      );
      const vocabB = aggregate(bRows.rows);
      expect(vocabB.sort()).toEqual(["geheim-b-only", "pricing"]);
    });
  });
});
