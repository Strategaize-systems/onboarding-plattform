// V9.1 SLC-V9.1-A MT-R2 — Migration 116 (V9.1 Inbound IMAP Sync-State, MIG-061).
//
// REVISION R1 (DEC-205): IMAP-Pull-Reuse supersedes SES-Webhook. Verifiziert
// Schema-, RLS- und CHECK-Effekte der Migration gegen die Coolify-DB im selben
// Docker-Netzwerk (siehe .claude/rules/coolify-test-setup.md).
//
// Test-Strategie identisch zu MIG-057/112-Test:
//   - Jeder Test laeuft in einer eigenen withTestDb-Transaction (Auto-ROLLBACK).
//   - Die Migration wird PRO Transaction frisch angewendet, damit sie isoliert
//     getestet werden kann (auch bevor MT-R2 LIVE-Apply auf der Coolify-DB lief).
//   - Outer BEGIN/COMMIT der Migration werden gestrippt — withTestDb haelt die TX.
//   - RLS-Pen-Tests (4 Rollen) folgen in MT-R7 (__tests__/rls/v91-inbound.rls.test.ts).
//     Diese Suite verifiziert NUR Schema-Existenz + Policy-Existenz.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../sql/migrations/116_v91_email_inbound_sync_state.sql",
);

function loadMigrationSql(): string {
  const raw = readFileSync(MIGRATION_PATH, "utf-8");
  return raw
    .replace(/^\s*BEGIN\s*;\s*$/m, "")
    .replace(/^\s*COMMIT\s*;\s*$/m, "");
}

async function applyMigration116(client: Client): Promise<void> {
  const sql = loadMigrationSql();
  await client.query(sql);
}

// ============================================================================
// Schema-Existenz
// ============================================================================

describe("Migration 116 — Schema (email_inbound_sync_state)", () => {
  it("existiert mit Pflicht-Spalten + status CHECK + PK(endpoint_id)", async () => {
    await withTestDb(async (client) => {
      await applyMigration116(client);

      const cols = await client.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_inbound_sync_state'
          ORDER BY ordinal_position`,
      );
      const names = cols.rows.map((r) => r.column_name);
      expect(names).toEqual(
        expect.arrayContaining([
          "endpoint_id",
          "tenant_id",
          "folder",
          "last_uid",
          "status",
          "last_sync_at",
          "emails_synced_total",
          "error_message",
          "updated_at",
        ]),
      );

      // PRIMARY KEY auf endpoint_id
      const pk = await client.query<{ conname: string; def: string }>(
        `SELECT conname, pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conrelid = 'public.email_inbound_sync_state'::regclass
            AND contype = 'p'`,
      );
      expect(pk.rows.length).toBe(1);
      expect(pk.rows[0]!.def).toContain("endpoint_id");

      // status CHECK enthaelt alle 3 Werte
      const checkDefs = await client.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conrelid = 'public.email_inbound_sync_state'::regclass
            AND contype = 'c'`,
      );
      const allChecks = checkDefs.rows.map((r) => r.pg_get_constraintdef).join("\n");
      for (const status of ["idle", "syncing", "error"]) {
        expect(allChecks).toContain(status);
      }

      // tenant_id NOT NULL
      const tenantIdCol = cols.rows.find((r) => r.column_name === "tenant_id");
      expect(tenantIdCol?.is_nullable).toBe("NO");
    });
  });

  it("hat FK auf email_inbound_endpoint (CASCADE) + tenants", async () => {
    await withTestDb(async (client) => {
      await applyMigration116(client);
      const fks = await client.query<{ confrelid: string; def: string }>(
        `SELECT confrelid::regclass::text AS confrelid, pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE conrelid = 'public.email_inbound_sync_state'::regclass
            AND contype = 'f'`,
      );
      const fkTargets = fks.rows.map((r) => r.confrelid);
      expect(fkTargets).toContain("email_inbound_endpoint");
      expect(fkTargets).toContain("tenants");

      // endpoint_id-FK kaskadiert
      const endpointFk = fks.rows.find((r) => r.def.includes("endpoint_id"));
      expect(endpointFk?.def).toContain("ON DELETE CASCADE");
    });
  });

  it("hat default-Werte: folder='INBOX', last_uid=0, status='idle', emails_synced_total=0", async () => {
    await withTestDb(async (client) => {
      await applyMigration116(client);
      const defaults = await client.query<{ column_name: string; column_default: string | null }>(
        `SELECT column_name, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_inbound_sync_state'
            AND column_name IN ('folder', 'last_uid', 'status', 'emails_synced_total')`,
      );
      const byName = Object.fromEntries(
        defaults.rows.map((r) => [r.column_name, r.column_default ?? ""]),
      );
      expect(byName["folder"]).toContain("INBOX");
      expect(byName["last_uid"]).toContain("0");
      expect(byName["status"]).toContain("idle");
      expect(byName["emails_synced_total"]).toContain("0");
    });
  });
});

// ============================================================================
// RLS-Policy-Existenz (3 Policies)
// ============================================================================

describe("Migration 116 — RLS Policies (3 total)", () => {
  it("RLS aktiviert auf email_inbound_sync_state", async () => {
    await withTestDb(async (client) => {
      await applyMigration116(client);
      const res = await client.query<{ relrowsecurity: boolean }>(
        `SELECT relrowsecurity
           FROM pg_class
          WHERE relname = 'email_inbound_sync_state'`,
      );
      expect(res.rows[0]?.relrowsecurity).toBe(true);
    });
  });

  it("hat 3 Policies (admin_all + tenant_select + service_write)", async () => {
    await withTestDb(async (client) => {
      await applyMigration116(client);
      const res = await client.query<{ polname: string }>(
        `SELECT polname
           FROM pg_policy
          WHERE polrelid = 'public.email_inbound_sync_state'::regclass`,
      );
      const names = res.rows.map((r) => r.polname).sort();
      expect(names).toEqual([
        "email_inbound_sync_state_admin_all",
        "email_inbound_sync_state_service_write",
        "email_inbound_sync_state_tenant_select",
      ]);
    });
  });

  it("tenant-Policy ist SELECT-only (kein INSERT/UPDATE/DELETE fuer tenant_admin)", async () => {
    await withTestDb(async (client) => {
      await applyMigration116(client);
      const res = await client.query<{ policyname: string; cmd: string }>(
        `SELECT policyname, cmd
           FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename  = 'email_inbound_sync_state'
            AND policyname = 'email_inbound_sync_state_tenant_select'`,
      );
      expect(res.rows[0]?.cmd).toBe("SELECT");
    });
  });
});
