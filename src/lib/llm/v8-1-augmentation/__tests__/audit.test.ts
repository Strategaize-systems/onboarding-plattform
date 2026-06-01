// audit.test.ts — Verifiziert dass die Audit-Row-Shape gegen das tatsaechliche
// Coolify-DB-Schema kompatibel ist. Erzeugt Rows in derselben Form wie audit.ts
// und INSERT-tested sie via raw pg.Client. Beweist insbesondere, dass
// Migration 105 (role='v8_1_augmentation' im CHECK-Constraint) live ist.
//
// Pure-Logic der Module-Constants werden hier ebenfalls geprueft.

import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { seedTestTenants } from "@/test/fixtures/tenants";
import {
  V8_1_AI_COST_LEDGER_ROLE,
  V8_1_CACHE_HIT_SOURCE,
  V8_1_TONALITY_DRIFT_SOURCE,
  V8_1_LLM_CALL_SOURCE,
} from "../audit";

const itDb = process.env.TEST_DATABASE_URL ? it : it.skip;

describe("audit module constants", () => {
  it("V8_1_AI_COST_LEDGER_ROLE is the migration-105 role string", () => {
    expect(V8_1_AI_COST_LEDGER_ROLE).toBe("v8_1_augmentation");
  });

  it("V8_1_CACHE_HIT_SOURCE matches spec category", () => {
    expect(V8_1_CACHE_HIT_SOURCE).toBe("v8_1_llm_cache_hit");
  });

  it("V8_1_TONALITY_DRIFT_SOURCE matches spec category", () => {
    expect(V8_1_TONALITY_DRIFT_SOURCE).toBe("v8_1_llm_tonality_drift");
  });

  it("V8_1_LLM_CALL_SOURCE matches spec category", () => {
    expect(V8_1_LLM_CALL_SOURCE).toBe("v8_1_llm_call");
  });
});

describe("audit row-shape against Coolify-DB schema", () => {
  itDb("ai_cost_ledger accepts role='v8_1_augmentation' (Migration 105 verified)", async () => {
    await withTestDb(async (client) => {
      const { tenantA } = await seedTestTenants(client);

      const { rows } = await client.query<{ id: string; role: string }>(
        `INSERT INTO ai_cost_ledger
          (tenant_id, job_id, model_id, tokens_in, tokens_out, usd_cost, duration_ms, iteration, role)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, 1, 'v8_1_augmentation')
         RETURNING id, role`,
        [tenantA, "anthropic.claude-3-5-sonnet-20241022-v2:0", 812, 94, 0.0067, 3421]
      );

      expect(rows.length).toBe(1);
      expect(rows[0].role).toBe("v8_1_augmentation");
    });
  });

  itDb("ai_cost_ledger rejects unknown role (Migration 105 still enforces whitelist)", async () => {
    await withTestDb(async (client) => {
      const { tenantA } = await seedTestTenants(client);

      let errorMessage: string | null = null;
      await client.query("SAVEPOINT try_unknown_role");
      try {
        await client.query(
          `INSERT INTO ai_cost_ledger
            (tenant_id, job_id, model_id, tokens_in, tokens_out, usd_cost, duration_ms, iteration, role)
           VALUES ($1, NULL, 'm', 0, 0, 0, 0, 1, 'totally_unknown_role')`,
          [tenantA]
        );
      } catch (e) {
        errorMessage = (e as Error).message;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_unknown_role");

      expect(errorMessage).toMatch(/check constraint|ai_cost_ledger_role_check/i);
    });
  });

  itDb("error_log accepts source='v8_1_llm_cache_hit' with metadata", async () => {
    await withTestDb(async (client) => {
      const { tenantA } = await seedTestTenants(client);

      const { rows } = await client.query<{ id: string; source: string }>(
        `INSERT INTO error_log (level, source, message, metadata)
         VALUES ('info', 'v8_1_llm_cache_hit', $1, $2::jsonb)
         RETURNING id, source`,
        [
          `Test cache hit for tenant ${tenantA}`,
          JSON.stringify({
            capture_session_id: "00000000-0000-0000-0000-000000000000",
            model_id: "anthropic.claude-3-5-sonnet-20241022-v2:0",
            prompt_version: "v1",
          }),
        ]
      );

      expect(rows.length).toBe(1);
      expect(rows[0].source).toBe("v8_1_llm_cache_hit");
    });
  });

  itDb("error_log accepts source='v8_1_llm_tonality_drift' with metadata", async () => {
    await withTestDb(async (client) => {
      await seedTestTenants(client);

      const { rows } = await client.query<{ id: string; source: string }>(
        `INSERT INTO error_log (level, source, message, metadata)
         VALUES ('warn', 'v8_1_llm_tonality_drift', $1, $2::jsonb)
         RETURNING id, source`,
        [
          "Tonality drift detected",
          JSON.stringify({
            capture_session_id: "00000000-0000-0000-0000-000000000000",
            modul_name: "Modul 4",
            drift_snippet: "Ich glaube wir sollten...",
          }),
        ]
      );

      expect(rows[0].source).toBe("v8_1_llm_tonality_drift");
    });
  });

  itDb("error_log accepts source='v8_1_llm_call' with success+failure metadata", async () => {
    await withTestDb(async (client) => {
      const { tenantA } = await seedTestTenants(client);

      // Success
      await client.query(
        `INSERT INTO error_log (level, source, message, metadata)
         VALUES ('info', 'v8_1_llm_call', $1, $2::jsonb)`,
        [
          "V8.1 LLM call success",
          JSON.stringify({
            tenant_id: tenantA,
            model_id: "m",
            modul_name: "Modul 4",
            success: true,
          }),
        ]
      );

      // Failure
      await client.query(
        `INSERT INTO error_log (level, source, message, metadata)
         VALUES ('warn', 'v8_1_llm_call', $1, $2::jsonb)`,
        [
          "V8.1 LLM call failure",
          JSON.stringify({
            tenant_id: tenantA,
            model_id: "m",
            modul_name: "Modul 4",
            success: false,
          }),
        ]
      );

      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM error_log WHERE source = 'v8_1_llm_call'`
      );
      expect(parseInt(rows[0].count, 10)).toBeGreaterThanOrEqual(2);
    });
  });
});
