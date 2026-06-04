// SLC-167 MT-1 — Migration 109 (V9 vw_bulk_email_cost_monthly View, MIG-054).
//
// Verifiziert View-Schema, security_invoker-Setting, GRANTs, Aggregation-Logik,
// status='failed'-Filter und Monats-Gruppierung gegen die Coolify-DB im selben
// Docker-Netzwerk (siehe .claude/rules/coolify-test-setup.md).
//
// Pre-Conditions:
//   - email_bulk_run-Tabelle existiert in der Test-DB (MIG-051/106 LIVE).
//   - Tests laufen in withTestDb-Transaction (Auto-ROLLBACK).
//
// Test-Strategie:
//   - Outer BEGIN/COMMIT der Migration werden gestrippt — withTestDb haelt die TX.
//   - Insert-Fixtures verwenden frische gen_random_uuid()-Tenants in der Tx,
//     damit keine Cross-Test-Verschmutzung entsteht.
//   - RLS-Inheritance wird hier NICHT getestet (separater Pen-Test-Layer fuer
//     authenticated/anon-Caller-Rollen — SLC-167 MT-3 RLS-Cases).
//     Diese Suite verifiziert NUR: Schema, Grants, security_invoker, Aggregation.
//
// LIVE-Apply: MT-1 fuehrt diese Migration auf Coolify-DB aus
// (per .claude/rules/sql-migration-hetzner.md). Nach Live-Apply lauft der Test
// gegen die TEST_DATABASE_URL-DB und greift auf die persistierte View zu.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../sql/migrations/109_v9_bulk_email_cost_view.sql",
);

function loadMigrationSql(): string {
  const raw = readFileSync(MIGRATION_PATH, "utf-8");
  return raw
    .replace(/^\s*BEGIN\s*;\s*$/m, "")
    .replace(/^\s*COMMIT\s*;\s*$/m, "");
}

async function applyMigration109(client: Client): Promise<void> {
  const sql = loadMigrationSql();
  await client.query(sql);
}

// ============================================================================
// View-Existenz + Schema
// ============================================================================

describe("Migration 109 — vw_bulk_email_cost_monthly View", () => {
  it("View existiert mit Pflicht-Spalten tenant_id + month + total_cost_eur + run_count", async () => {
    await withTestDb(async (client) => {
      await applyMigration109(client);
      const res = await client.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'vw_bulk_email_cost_monthly'
          ORDER BY ordinal_position`,
      );
      const names = res.rows.map((r) => r.column_name);
      expect(names).toEqual(
        expect.arrayContaining(["tenant_id", "month", "total_cost_eur", "run_count"]),
      );
      // run_count ist integer (per ::integer-Cast)
      const runCount = res.rows.find((r) => r.column_name === "run_count");
      expect(runCount?.data_type).toBe("integer");
      // total_cost_eur ist numeric
      const totalCost = res.rows.find((r) => r.column_name === "total_cost_eur");
      expect(totalCost?.data_type).toBe("numeric");
    });
  });

  it("View hat security_invoker = true (RLS-Inheritance aktiv)", async () => {
    await withTestDb(async (client) => {
      await applyMigration109(client);
      const res = await client.query<{ reloptions: string[] | null }>(
        `SELECT reloptions
           FROM pg_class
          WHERE relname = 'vw_bulk_email_cost_monthly'
            AND relnamespace = 'public'::regnamespace`,
      );
      expect(res.rows).toHaveLength(1);
      const options = res.rows[0].reloptions ?? [];
      expect(options.some((o) => o.includes("security_invoker=true"))).toBe(true);
    });
  });

  it("View hat GRANT SELECT fuer authenticated und service_role", async () => {
    await withTestDb(async (client) => {
      await applyMigration109(client);
      const res = await client.query<{ grantee: string; privilege_type: string }>(
        `SELECT grantee, privilege_type
           FROM information_schema.role_table_grants
          WHERE table_schema = 'public'
            AND table_name   = 'vw_bulk_email_cost_monthly'
            AND privilege_type = 'SELECT'`,
      );
      const grantees = res.rows.map((r) => r.grantee);
      expect(grantees).toContain("authenticated");
      expect(grantees).toContain("service_role");
    });
  });
});

// ============================================================================
// Aggregation-Logik
// ============================================================================

describe("Migration 109 — vw_bulk_email_cost_monthly Aggregation", () => {
  /**
   * Helper: legt einen Tenant + Uploader-User + N email_bulk_run-Rows an
   * und liefert die Tenant-ID + erwartete Monatssumme zurueck.
   *
   * Alle Inserts laufen innerhalb der Test-Tx und werden via ROLLBACK rueckgaengig.
   */
  async function seedRuns(
    client: Client,
    runs: Array<{
      preFilterCostEur: number;
      patternCostEur: number;
      status: string;
      createdAt: string;
    }>,
  ): Promise<{ tenantId: string }> {
    const tenantRes = await client.query<{ id: string }>(
      `INSERT INTO public.tenants (name) VALUES ($1) RETURNING id`,
      [`SLC-167-MT-1-Test-${crypto.randomUUID()}`],
    );
    const tenantId = tenantRes.rows[0].id;

    // raw_user_meta_data muss tenant_id + role enthalten — handle_new_user-Trigger
    // erzwingt das fuer tenant_admin (Default-Role). Siehe pg_proc handle_new_user.
    const userRes = await client.query<{ id: string }>(
      `INSERT INTO auth.users (instance_id, id, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at,
                               raw_app_meta_data, raw_user_meta_data, aud, role)
         VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
                 $1, '', now(), now(), now(),
                 '{}'::jsonb,
                 jsonb_build_object('tenant_id', $2::text, 'role', 'tenant_admin'),
                 'authenticated', 'authenticated')
         RETURNING id`,
      [`slc167-mt1-${crypto.randomUUID()}@test.local`, tenantId],
    );
    const userId = userRes.rows[0].id;

    for (const r of runs) {
      await client.query(
        `INSERT INTO public.email_bulk_run
           (tenant_id, uploader_user_id, source_file_name, file_hash,
            storage_path, pre_filter_cost_eur, pattern_extraction_cost_eur,
            status, created_at)
           VALUES ($1, $2, 'test.mbox', $3, 't/x', $4, $5, $6, $7)`,
        [
          tenantId,
          userId,
          crypto.randomUUID(),
          r.preFilterCostEur,
          r.patternCostEur,
          r.status,
          r.createdAt,
        ],
      );
    }

    return { tenantId };
  }

  it("aggregiert total_cost_eur korrekt ueber mehrere Runs im selben Monat", async () => {
    await withTestDb(async (client) => {
      await applyMigration109(client);
      const { tenantId } = await seedRuns(client, [
        {
          preFilterCostEur: 0.5,
          patternCostEur: 4.5,
          status: "completed",
          createdAt: "2026-06-01 10:00:00+00",
        },
        {
          preFilterCostEur: 0.3,
          patternCostEur: 2.7,
          status: "pattern_extracted",
          createdAt: "2026-06-15 14:30:00+00",
        },
      ]);

      const res = await client.query<{
        total_cost_eur: string;
        run_count: number;
      }>(
        `SELECT total_cost_eur, run_count
           FROM public.vw_bulk_email_cost_monthly
          WHERE tenant_id = $1`,
        [tenantId],
      );

      expect(res.rows).toHaveLength(1);
      // 0.5+4.5 + 0.3+2.7 = 8.0 EUR
      expect(parseFloat(res.rows[0].total_cost_eur)).toBeCloseTo(8.0, 4);
      expect(res.rows[0].run_count).toBe(2);
    });
  });

  it("excludiert status='failed' Runs aus der Aggregation", async () => {
    await withTestDb(async (client) => {
      await applyMigration109(client);
      const { tenantId } = await seedRuns(client, [
        {
          preFilterCostEur: 1.0,
          patternCostEur: 9.0,
          status: "failed",
          createdAt: "2026-06-01 10:00:00+00",
        },
        {
          preFilterCostEur: 0.2,
          patternCostEur: 1.8,
          status: "completed",
          createdAt: "2026-06-02 11:00:00+00",
        },
      ]);

      const res = await client.query<{
        total_cost_eur: string;
        run_count: number;
      }>(
        `SELECT total_cost_eur, run_count
           FROM public.vw_bulk_email_cost_monthly
          WHERE tenant_id = $1`,
        [tenantId],
      );

      expect(res.rows).toHaveLength(1);
      // Nur der completed-Run (0.2+1.8 = 2.0) wird gezaehlt, der failed-Run (10.0) NICHT
      expect(parseFloat(res.rows[0].total_cost_eur)).toBeCloseTo(2.0, 4);
      expect(res.rows[0].run_count).toBe(1);
    });
  });

  it("gruppiert nach Monat: zwei verschiedene Monate -> zwei Rows pro Tenant", async () => {
    await withTestDb(async (client) => {
      await applyMigration109(client);
      const { tenantId } = await seedRuns(client, [
        {
          preFilterCostEur: 0.5,
          patternCostEur: 4.5,
          status: "completed",
          createdAt: "2026-05-28 10:00:00+00",
        },
        {
          preFilterCostEur: 0.5,
          patternCostEur: 4.5,
          status: "completed",
          createdAt: "2026-06-03 10:00:00+00",
        },
      ]);

      const res = await client.query<{
        month: string;
        total_cost_eur: string;
        run_count: number;
      }>(
        `SELECT month::text AS month, total_cost_eur, run_count
           FROM public.vw_bulk_email_cost_monthly
          WHERE tenant_id = $1
          ORDER BY month`,
        [tenantId],
      );

      expect(res.rows).toHaveLength(2);
      expect(res.rows[0].month).toBe("2026-05-01");
      expect(res.rows[1].month).toBe("2026-06-01");
      expect(res.rows[0].run_count).toBe(1);
      expect(res.rows[1].run_count).toBe(1);
    });
  });

  it("liefert KEINE Row, wenn der Tenant nur failed-Runs hat", async () => {
    await withTestDb(async (client) => {
      await applyMigration109(client);
      const { tenantId } = await seedRuns(client, [
        {
          preFilterCostEur: 1.0,
          patternCostEur: 9.0,
          status: "failed",
          createdAt: "2026-06-01 10:00:00+00",
        },
      ]);

      const res = await client.query(
        `SELECT 1
           FROM public.vw_bulk_email_cost_monthly
          WHERE tenant_id = $1`,
        [tenantId],
      );

      expect(res.rows).toHaveLength(0);
    });
  });
});
