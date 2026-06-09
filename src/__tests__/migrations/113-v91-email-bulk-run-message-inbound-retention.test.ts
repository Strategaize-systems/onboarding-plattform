// V9.1 SLC-V9.1-A MT-2 — Migration 113 (V9.1 email_bulk_run/message ALTER, MIG-058).
//
// Verifiziert Schema-ALTER + Backfill + Indexes der Migration gegen die
// Coolify-DB im selben Docker-Netzwerk (siehe .claude/rules/coolify-test-setup.md).
//
// Dependency: MIG-057 (112) muss vorher laufen, weil MIG-058 endpoint_id FK
// auf email_inbound_endpoint setzt. Beide werden pro Test angewendet.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";

const MIGRATION_112_PATH = resolve(
  __dirname,
  "../../../sql/migrations/112_v91_inbound_foundation.sql",
);
const MIGRATION_113_PATH = resolve(
  __dirname,
  "../../../sql/migrations/113_v91_email_bulk_run_message_inbound_retention.sql",
);

function loadMigrationSql(path: string): string {
  const raw = readFileSync(path, "utf-8");
  return raw
    .replace(/^\s*BEGIN\s*;\s*$/m, "")
    .replace(/^\s*COMMIT\s*;\s*$/m, "");
}

async function applyMigrations(client: Client): Promise<void> {
  await client.query(loadMigrationSql(MIGRATION_112_PATH));
  await client.query(loadMigrationSql(MIGRATION_113_PATH));
}

// ============================================================================
// email_bulk_run — 5 neue Spalten + status CHECK extended
// ============================================================================

describe("Migration 113 — email_bulk_run ALTER", () => {
  it("email_bulk_run hat 5 neue Spalten (inbound_source default mbox_upload + NOT NULL)", async () => {
    await withTestDb(async (client) => {
      await applyMigrations(client);
      const res = await client.query<{
        column_name: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `SELECT column_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_bulk_run'
            AND column_name IN (
              'inbound_source',
              'endpoint_id',
              'daily_anchor_date',
              'retention_until',
              'soft_delete_at'
            )`,
      );
      const byName = new Map(res.rows.map((r) => [r.column_name, r]));
      expect(byName.size).toBe(5);

      // inbound_source: NOT NULL with DEFAULT 'mbox_upload'
      expect(byName.get("inbound_source")?.is_nullable).toBe("NO");
      expect(byName.get("inbound_source")?.column_default).toContain("mbox_upload");

      // endpoint_id, daily_anchor_date, retention_until, soft_delete_at: nullable
      expect(byName.get("endpoint_id")?.is_nullable).toBe("YES");
      expect(byName.get("daily_anchor_date")?.is_nullable).toBe("YES");
      expect(byName.get("retention_until")?.is_nullable).toBe("YES");
      expect(byName.get("soft_delete_at")?.is_nullable).toBe("YES");
    });
  });

  it("email_bulk_run.status CHECK contains 'continuous'", async () => {
    await withTestDb(async (client) => {
      await applyMigrations(client);
      const res = await client.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conname = 'email_bulk_run_status_check'`,
      );
      expect(res.rows.length).toBe(1);
      const def = res.rows[0]!.pg_get_constraintdef;
      expect(def).toContain("continuous");
      // V9-Bestand bleibt
      expect(def).toContain("uploaded");
      expect(def).toContain("completed");
      expect(def).toContain("failed");
    });
  });

  it("email_bulk_run.inbound_source CHECK enthaelt mbox_upload + forward_bucket", async () => {
    await withTestDb(async (client) => {
      await applyMigrations(client);
      const res = await client.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conname = 'email_bulk_run_inbound_source_check'`,
      );
      expect(res.rows.length).toBe(1);
      const def = res.rows[0]!.pg_get_constraintdef;
      expect(def).toContain("mbox_upload");
      expect(def).toContain("forward_bucket");
    });
  });

  it("email_bulk_run.endpoint_id FK references email_inbound_endpoint", async () => {
    await withTestDb(async (client) => {
      await applyMigrations(client);
      const res = await client.query<{ confrelid: string; conname: string }>(
        `SELECT confrelid::regclass::text AS confrelid, conname
           FROM pg_constraint
          WHERE conrelid = 'public.email_bulk_run'::regclass
            AND contype = 'f'`,
      );
      const fkTargets = res.rows.map((r) => r.confrelid);
      expect(fkTargets).toContain("email_inbound_endpoint");
    });
  });
});

// ============================================================================
// email_message — 2 neue Spalten
// ============================================================================

describe("Migration 113 — email_message ALTER", () => {
  it("email_message hat 2 neue Spalten (raw_storage_path + received_at, beide nullable)", async () => {
    await withTestDb(async (client) => {
      await applyMigrations(client);
      const res = await client.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_message'
            AND column_name IN ('raw_storage_path', 'received_at')`,
      );
      const byName = new Map(res.rows.map((r) => [r.column_name, r]));
      expect(byName.size).toBe(2);
      expect(byName.get("raw_storage_path")?.is_nullable).toBe("YES");
      expect(byName.get("received_at")?.is_nullable).toBe("YES");
    });
  });
});

// ============================================================================
// Indexes (3 neue)
// ============================================================================

describe("Migration 113 — Indexes (3 neue)", () => {
  it("idx_email_bulk_run_retention_pending existiert (partial WHERE soft_delete_at IS NULL)", async () => {
    await withTestDb(async (client) => {
      await applyMigrations(client);
      const res = await client.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'email_bulk_run'
            AND indexname = 'idx_email_bulk_run_retention_pending'`,
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]!.indexdef).toContain("soft_delete_at IS NULL");
    });
  });

  it("idx_email_bulk_run_forward_daily_roll existiert als UNIQUE partial index", async () => {
    await withTestDb(async (client) => {
      await applyMigrations(client);
      const res = await client.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'email_bulk_run'
            AND indexname = 'idx_email_bulk_run_forward_daily_roll'`,
      );
      expect(res.rows.length).toBe(1);
      const def = res.rows[0]!.indexdef;
      expect(def).toContain("UNIQUE");
      expect(def).toContain("forward_bucket");
    });
  });

  it("idx_email_message_raw_storage_path existiert (partial WHERE raw_storage_path IS NOT NULL)", async () => {
    await withTestDb(async (client) => {
      await applyMigrations(client);
      const res = await client.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'email_message'
            AND indexname = 'idx_email_message_raw_storage_path'`,
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]!.indexdef).toContain("raw_storage_path IS NOT NULL");
    });
  });
});

// ============================================================================
// Backfill (idempotent)
// ============================================================================

describe("Migration 113 — Backfill", () => {
  it("Backfill setzt retention_until auf created_at + 90d fuer V9-Bestand", async () => {
    await withTestDb(async (client) => {
      // Bootstrap V9-Bestand BEFORE applying MIG-058
      await client.query(loadMigrationSql(MIGRATION_112_PATH));
      // Create a tenant + uploader to satisfy FK + NOT NULL
      const tenant = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name) VALUES ('v91-backfill-test') RETURNING id`,
      );
      const tenantId = tenant.rows[0]!.id;
      const user = await client.query<{ id: string }>(
        `INSERT INTO auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
           VALUES (gen_random_uuid(), 'v91-backfill@test.local', '{}'::jsonb, '{}'::jsonb)
           RETURNING id`,
      );
      const userId = user.rows[0]!.id;

      // Insert email_bulk_run BEFORE MIG-058 — retention_until column does not exist yet,
      // so V9-style row has no retention metadata.
      await client.query(
        `INSERT INTO public.email_bulk_run
           (tenant_id, uploader_user_id, source_file_name, file_hash, storage_path, status)
         VALUES
           ($1, $2, 'backfill-test.mbox', 'hash-backfill-1', 'tenant/' || $1 || '/x.mbox', 'completed')`,
        [tenantId, userId],
      );

      // Now apply MIG-058 (which adds retention_until + backfills)
      await client.query(loadMigrationSql(MIGRATION_113_PATH));

      const res = await client.query<{ retention_until: string; created_at: string }>(
        `SELECT retention_until, created_at
           FROM public.email_bulk_run
          WHERE file_hash = 'hash-backfill-1'`,
      );
      expect(res.rows.length).toBe(1);
      const r = res.rows[0]!;
      expect(r.retention_until).not.toBeNull();
      const retentionMs = new Date(r.retention_until).getTime();
      const createdMs = new Date(r.created_at).getTime();
      const deltaDays = (retentionMs - createdMs) / (1000 * 60 * 60 * 24);
      expect(deltaDays).toBeGreaterThan(89.9);
      expect(deltaDays).toBeLessThan(90.1);
    });
  });
});
