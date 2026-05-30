// Coolify-DB-Integration-Test fuer Cache-JSONB-Merge.
// Runs via Docker-Sidecar im Coolify-Netzwerk (coolify-test-setup.md).
//
// Verifiziert dass mergeCacheIntoMetadata Output korrekt in
// capture_session.metadata persistiert UND beim Read defensiv geparst wird.

import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { seedTestTenants } from "@/test/fixtures/tenants";
import {
  buildCacheKey,
  mergeCacheIntoMetadata,
  readCacheFromMetadata,
  V8_1_CACHE_METADATA_KEY,
} from "../cache";
import type { CacheStructure } from "../types";

const itDb = process.env.TEST_DATABASE_URL ? it : it.skip;

function makeCache(modelId: string, promptVersion: string): CacheStructure {
  return {
    cache_key: buildCacheKey(modelId, promptVersion),
    augmented_at: new Date().toISOString(),
    hebel: [
      {
        modul_name: "Modul 4 — Operative Skalierbarkeit",
        modul_id: 4,
        aktuelle_stufe: 2,
        text: "Wir empfehlen, dieses Modul gemeinsam zu staerken.",
        is_llm_augmented: true,
        token_count: { input: 412, output: 38 },
        cost_usd: 0.0034,
      },
    ],
  };
}

describe("cache JSONB roundtrip against Coolify-DB", () => {
  itDb("merge → write → read returns identical CacheStructure", async () => {
    await withTestDb(async (client) => {
      const { tenantA, templateId, templateVersion } = await seedTestTenants(client);

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO capture_session (tenant_id, template_id, template_version, mode)
         VALUES ($1, $2, $3, 'self_service')
         RETURNING id`,
        [tenantA, templateId, templateVersion]
      );
      const sessionId = rows[0].id;

      const cache = makeCache("anthropic.claude-3-5-sonnet-20241022-v2:0", "v1");
      const newMetadata = mergeCacheIntoMetadata({}, cache);

      await client.query(
        `UPDATE capture_session SET metadata = $1 WHERE id = $2`,
        [JSON.stringify(newMetadata), sessionId]
      );

      const { rows: readRows } = await client.query<{
        metadata: Record<string, unknown>;
      }>(`SELECT metadata FROM capture_session WHERE id = $1`, [sessionId]);

      const parsed = readCacheFromMetadata(readRows[0].metadata);
      expect(parsed).not.toBe(null);
      expect(parsed?.cache_key).toBe(cache.cache_key);
      expect(parsed?.hebel.length).toBe(1);
      expect(parsed?.hebel[0].modul_id).toBe(4);
      expect(parsed?.hebel[0].cost_usd).toBe(0.0034);
    });
  });

  itDb("merge preserves existing v8_report_snapshot key", async () => {
    await withTestDb(async (client) => {
      const { tenantA, templateId, templateVersion } = await seedTestTenants(client);

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO capture_session (tenant_id, template_id, template_version, mode, metadata)
         VALUES ($1, $2, $3, 'self_service', $4::jsonb)
         RETURNING id`,
        [
          tenantA,
          templateId,
          templateVersion,
          JSON.stringify({
            v8_report_snapshot: {
              schemaVersion: "1.0",
              finalizedAt: "2026-05-30T08:00:00.000Z",
              dummy: true,
            },
          }),
        ]
      );
      const sessionId = rows[0].id;

      const { rows: priorRows } = await client.query<{
        metadata: Record<string, unknown>;
      }>(`SELECT metadata FROM capture_session WHERE id = $1`, [sessionId]);
      const priorMetadata = priorRows[0].metadata;

      const newCache = makeCache("anthropic.claude-3-5-sonnet-20241022-v2:0", "v1");
      const mergedMetadata = mergeCacheIntoMetadata(priorMetadata, newCache);

      await client.query(
        `UPDATE capture_session SET metadata = $1 WHERE id = $2`,
        [JSON.stringify(mergedMetadata), sessionId]
      );

      const { rows: finalRows } = await client.query<{
        metadata: Record<string, unknown>;
      }>(`SELECT metadata FROM capture_session WHERE id = $1`, [sessionId]);

      const meta = finalRows[0].metadata;
      expect(meta.v8_report_snapshot).toBeDefined();
      expect((meta.v8_report_snapshot as { dummy: boolean }).dummy).toBe(true);
      expect(meta[V8_1_CACHE_METADATA_KEY]).toBeDefined();
      const parsed = readCacheFromMetadata(meta);
      expect(parsed?.cache_key).toBe(newCache.cache_key);
    });
  });

  itDb("read against empty metadata returns null", async () => {
    await withTestDb(async (client) => {
      const { tenantA, templateId, templateVersion } = await seedTestTenants(client);

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO capture_session (tenant_id, template_id, template_version, mode)
         VALUES ($1, $2, $3, 'self_service')
         RETURNING id`,
        [tenantA, templateId, templateVersion]
      );
      const sessionId = rows[0].id;

      const { rows: readRows } = await client.query<{
        metadata: Record<string, unknown>;
      }>(`SELECT metadata FROM capture_session WHERE id = $1`, [sessionId]);

      const parsed = readCacheFromMetadata(readRows[0].metadata);
      expect(parsed).toBe(null);
    });
  });

  itDb("read against malformed cache JSONB returns null (defensive)", async () => {
    await withTestDb(async (client) => {
      const { tenantA, templateId, templateVersion } = await seedTestTenants(client);

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO capture_session (tenant_id, template_id, template_version, mode, metadata)
         VALUES ($1, $2, $3, 'self_service', $4::jsonb)
         RETURNING id`,
        [
          tenantA,
          templateId,
          templateVersion,
          JSON.stringify({
            v8_1_llm_augmentation_cache: { cache_key: 42, broken: true },
          }),
        ]
      );
      const sessionId = rows[0].id;

      const { rows: readRows } = await client.query<{
        metadata: Record<string, unknown>;
      }>(`SELECT metadata FROM capture_session WHERE id = $1`, [sessionId]);

      const parsed = readCacheFromMetadata(readRows[0].metadata);
      expect(parsed).toBe(null);
    });
  });
});
