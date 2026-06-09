// V9.1 SLC-V9.1-A MT-2 — Migration 112 (V9.1 Inbound-Foundation, MIG-057).
//
// Verifiziert Schema-, RLS- und CHECK-Effekte der Migration gegen die
// Coolify-DB im selben Docker-Netzwerk (siehe .claude/rules/coolify-test-setup.md).
//
// Test-Strategie identisch zu V9 MIG-106-Test:
//   - Jeder Test laeuft in einer eigenen withTestDb-Transaction (Auto-ROLLBACK).
//   - Die Migration wird PRO Transaction frisch angewendet, damit sie isoliert
//     getestet werden kann (auch bevor MT-2 LIVE-Apply auf der Coolify-DB lief).
//   - Outer BEGIN/COMMIT der Migration werden gestrippt — withTestDb haelt die TX.
//   - RLS-Pen-Tests werden in MT-6 abgedeckt (`__tests__/rls/v91-inbound.rls.test.ts`).
//     Diese Suite verifiziert NUR Schema-Existenz + Policy-Existenz.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../sql/migrations/112_v91_inbound_foundation.sql",
);

function loadMigrationSql(): string {
  const raw = readFileSync(MIGRATION_PATH, "utf-8");
  return raw
    .replace(/^\s*BEGIN\s*;\s*$/m, "")
    .replace(/^\s*COMMIT\s*;\s*$/m, "");
}

async function applyMigration112(client: Client): Promise<void> {
  const sql = loadMigrationSql();
  await client.query(sql);
}

// ============================================================================
// Schema-Existenz (3 Tabellen)
// ============================================================================

describe("Migration 112 — Schema (3 Tabellen)", () => {
  it("email_inbound_endpoint existiert mit Pflicht-Spalten + UNIQUE(slug) + status CHECK", async () => {
    await withTestDb(async (client) => {
      await applyMigration112(client);
      const cols = await client.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_inbound_endpoint'
          ORDER BY ordinal_position`,
      );
      const names = cols.rows.map((r) => r.column_name);
      expect(names).toEqual(
        expect.arrayContaining([
          "id",
          "tenant_id",
          "slug",
          "setup_token",
          "status",
          "display_name",
          "created_at",
          "updated_at",
        ]),
      );

      const constraints = await client.query<{ contype: string; conname: string }>(
        `SELECT contype, conname
           FROM pg_constraint
          WHERE conrelid = 'public.email_inbound_endpoint'::regclass`,
      );
      const conNames = constraints.rows.map((r) => r.conname);
      expect(conNames).toContain("email_inbound_endpoint_slug_unique");

      const checkDefs = await client.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conrelid = 'public.email_inbound_endpoint'::regclass
            AND contype = 'c'`,
      );
      const allChecks = checkDefs.rows.map((r) => r.pg_get_constraintdef).join("\n");
      for (const status of ["active", "paused", "revoked"]) {
        expect(allChecks).toContain(status);
      }
    });
  });

  it("email_forward_allowlist existiert mit pattern_type CHECK + FK auf endpoint", async () => {
    await withTestDb(async (client) => {
      await applyMigration112(client);
      const cols = await client.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_forward_allowlist'`,
      );
      const names = cols.rows.map((r) => r.column_name);
      expect(names).toEqual(
        expect.arrayContaining([
          "id",
          "endpoint_id",
          "tenant_id",
          "pattern",
          "pattern_type",
          "enabled",
          "created_at",
        ]),
      );

      const checkDefs = await client.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conrelid = 'public.email_forward_allowlist'::regclass
            AND contype = 'c'`,
      );
      const allChecks = checkDefs.rows.map((r) => r.pg_get_constraintdef).join("\n");
      expect(allChecks).toContain("domain");
      expect(allChecks).toContain("email_exact");

      const fks = await client.query<{ confrelid: string }>(
        `SELECT confrelid::regclass::text AS confrelid
           FROM pg_constraint
          WHERE conrelid = 'public.email_forward_allowlist'::regclass
            AND contype = 'f'`,
      );
      const fkTargets = fks.rows.map((r) => r.confrelid);
      expect(fkTargets).toContain("email_inbound_endpoint");
    });
  });

  it("email_validation_reject_log existiert mit reject_layer CHECK + nullable tenant_id", async () => {
    await withTestDb(async (client) => {
      await applyMigration112(client);
      const cols = await client.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_validation_reject_log'`,
      );
      const names = cols.rows.map((r) => r.column_name);
      expect(names).toEqual(
        expect.arrayContaining([
          "id",
          "tenant_id",
          "endpoint_id",
          "reject_layer",
          "sender_domain",
          "sender_full_email",
          "subject_snippet",
          "raw_storage_path",
          "created_at",
        ]),
      );

      // tenant_id must be nullable (tenant_not_found reject path)
      const tenantIdCol = cols.rows.find((r) => r.column_name === "tenant_id");
      expect(tenantIdCol?.is_nullable).toBe("YES");

      const checkDefs = await client.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conrelid = 'public.email_validation_reject_log'::regclass
            AND contype = 'c'`,
      );
      const allChecks = checkDefs.rows.map((r) => r.pg_get_constraintdef).join("\n");
      for (const layer of [
        "hmac_invalid",
        "tenant_not_found",
        "endpoint_inactive",
        "setup_token_missing",
        "setup_token_invalid",
        "allowlist_mismatch",
      ]) {
        expect(allChecks).toContain(layer);
      }
    });
  });
});

// ============================================================================
// RLS-Policy-Existenz (10 Policies = 4+4+2)
// ============================================================================

describe("Migration 112 — RLS Policies (10 total)", () => {
  it("RLS aktiviert auf 3 V9.1-Tabellen", async () => {
    await withTestDb(async (client) => {
      await applyMigration112(client);
      const res = await client.query<{ relname: string; relrowsecurity: boolean }>(
        `SELECT relname, relrowsecurity
           FROM pg_class
          WHERE relname IN (
            'email_inbound_endpoint',
            'email_forward_allowlist',
            'email_validation_reject_log'
          )`,
      );
      for (const row of res.rows) {
        expect(row.relrowsecurity).toBe(true);
      }
    });
  });

  it("email_inbound_endpoint hat 4 Policies (admin_all + 3 tenant_admin)", async () => {
    await withTestDb(async (client) => {
      await applyMigration112(client);
      const res = await client.query<{ polname: string }>(
        `SELECT polname
           FROM pg_policy
          WHERE polrelid = 'public.email_inbound_endpoint'::regclass`,
      );
      const names = res.rows.map((r) => r.polname).sort();
      expect(names).toEqual([
        "email_inbound_endpoint_admin_all",
        "email_inbound_endpoint_tenant_insert",
        "email_inbound_endpoint_tenant_select",
        "email_inbound_endpoint_tenant_update",
      ]);
    });
  });

  it("email_forward_allowlist hat 4 Policies (admin_all + tenant select/insert/delete)", async () => {
    await withTestDb(async (client) => {
      await applyMigration112(client);
      const res = await client.query<{ polname: string }>(
        `SELECT polname
           FROM pg_policy
          WHERE polrelid = 'public.email_forward_allowlist'::regclass`,
      );
      const names = res.rows.map((r) => r.polname).sort();
      expect(names).toEqual([
        "email_forward_allowlist_admin_all",
        "email_forward_allowlist_tenant_delete",
        "email_forward_allowlist_tenant_insert",
        "email_forward_allowlist_tenant_select",
      ]);
    });
  });

  it("email_validation_reject_log hat 2 SELECT-only Policies (admin + tenant)", async () => {
    await withTestDb(async (client) => {
      await applyMigration112(client);
      const res = await client.query<{ polname: string }>(
        `SELECT polname
           FROM pg_policy
          WHERE polrelid = 'public.email_validation_reject_log'::regclass`,
      );
      const names = res.rows.map((r) => r.polname).sort();
      expect(names).toEqual([
        "email_validation_reject_log_admin_select",
        "email_validation_reject_log_tenant_select",
      ]);
    });
  });
});

// ============================================================================
// ai_jobs.job_type CHECK-Erweiterung
// ============================================================================

describe("Migration 112 — ai_jobs.job_type CHECK extended", () => {
  it("ai_jobs_job_type_check enthaelt email_bulk_pipeline_trigger + email_bulk_retention_sweep", async () => {
    await withTestDb(async (client) => {
      await applyMigration112(client);
      const res = await client.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conname = 'ai_jobs_job_type_check'`,
      );
      expect(res.rows.length).toBe(1);
      const def = res.rows[0]!.pg_get_constraintdef;
      expect(def).toContain("email_bulk_pipeline_trigger");
      expect(def).toContain("email_bulk_retention_sweep");
      // Bestand der V9-Werte bleibt erhalten
      expect(def).toContain("email_bulk_parse");
      expect(def).toContain("email_bulk_pre_filter");
      expect(def).toContain("email_bulk_thread_redact");
      expect(def).toContain("email_bulk_pattern_extract");
    });
  });
});
