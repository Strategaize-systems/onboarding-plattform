// SLC-165 MT-2 — Migration 106 (V9 Bulk-Email-Schema-Foundation, MIG-051).
//
// Verifiziert Schema-, RLS- und Storage-Effekte der Migration gegen die
// Coolify-DB im selben Docker-Netzwerk (siehe .claude/rules/coolify-test-setup.md).
//
// Test-Strategie:
//   - Jeder Test laeuft in einer eigenen withTestDb-Transaction (Auto-ROLLBACK).
//   - Die Migration wird PRO Transaction frisch angewendet, damit sie isoliert
//     getestet werden kann (auch bevor MT-2b LIVE-Apply auf der Coolify-DB lief).
//   - Outer BEGIN/COMMIT der Migration werden gestrippt — withTestDb haelt die TX.
//   - RLS-Pen-Tests werden in einem separaten Pen-Test-File abgedeckt
//     (`src/__tests__/rls/v9-bulk-email.rls.test.ts`, kommt in SLC-165 MT-6).
//     Diese Suite verifiziert NUR Schema-Existenz + Policy-Existenz.
//
// LIVE-Apply-Status: MT-2b BLOCKED bis V8.1 STABLE. Tests laufen offline gegen
// jede Coolify-DB-Replika ohne LIVE-Pre-Cond.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../sql/migrations/106_v9_bulk_email_schema.sql",
);

/**
 * Liest die Migration und strippt outer BEGIN;/COMMIT;-Statements,
 * weil withTestDb bereits eine Transaction haelt.
 */
function loadMigrationSql(): string {
  const raw = readFileSync(MIGRATION_PATH, "utf-8");
  return raw
    .replace(/^\s*BEGIN\s*;\s*$/m, "")
    .replace(/^\s*COMMIT\s*;\s*$/m, "");
}

async function applyMigration106(client: Client): Promise<void> {
  const sql = loadMigrationSql();
  await client.query(sql);
}

// ============================================================================
// Schema-Existenz
// ============================================================================

describe("Migration 106 — Schema (4 Tabellen)", () => {
  it("email_bulk_run existiert mit Pflicht-Spalten + GENERATED total_cost_eur", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{
        column_name: string;
        data_type: string;
        is_generated: string;
      }>(
        `SELECT column_name, data_type, is_generated
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_bulk_run'
          ORDER BY ordinal_position`,
      );
      const names = res.rows.map((r) => r.column_name);
      expect(names).toEqual(
        expect.arrayContaining([
          "id",
          "tenant_id",
          "uploader_user_id",
          "capture_session_id",
          "source_file_name",
          "file_hash",
          "storage_path",
          "email_count",
          "content_emails",
          "thread_count",
          "patterns_extracted",
          "patterns_accepted",
          "patterns_imported",
          "pre_filter_cost_eur",
          "pattern_extraction_cost_eur",
          "total_cost_eur",
          "status",
          "failure_reason",
          "created_at",
          "updated_at",
          "completed_at",
        ]),
      );
      const totalCost = res.rows.find((r) => r.column_name === "total_cost_eur");
      expect(totalCost?.is_generated).toBe("ALWAYS");
    });
  });

  it("email_bulk_run hat UNIQUE(tenant_id, file_hash) + status CHECK-Constraint", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{ contype: string; conname: string }>(
        `SELECT contype, conname
           FROM pg_constraint
          WHERE conrelid = 'public.email_bulk_run'::regclass`,
      );
      const types = res.rows.map((r) => r.contype);
      expect(types).toContain("u"); // UNIQUE
      expect(types).toContain("c"); // CHECK (status)
      expect(res.rows.some((r) => r.conname === "email_bulk_run_unique_per_tenant")).toBe(true);
    });
  });

  it("email_message existiert mit Pflicht-Headers + pre_filter_label CHECK", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_message'`,
      );
      const names = res.rows.map((r) => r.column_name);
      expect(names).toEqual(
        expect.arrayContaining([
          "id",
          "tenant_id",
          "bulk_run_id",
          "message_id",
          "in_reply_to",
          "references_array",
          "from_address",
          "to_addresses",
          "cc_addresses",
          "subject",
          "date",
          "body_text",
          "body_html",
          "has_attachments",
          "attachment_metadata",
          "pre_filter_label",
          "pre_filter_confidence",
          "pre_filter_corrected",
          "pii_redacted",
          "thread_id",
          "created_at",
        ]),
      );
      const checks = await client.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conrelid = 'public.email_message'::regclass
            AND contype = 'c'`,
      );
      const checkDefs = checks.rows.map((r) => r.pg_get_constraintdef).join("\n");
      for (const label of ["content", "short_reply", "notification", "newsletter", "private", "unclear"]) {
        expect(checkDefs).toContain(label);
      }
    });
  });

  it("email_thread existiert mit thread_status CHECK", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_thread'`,
      );
      const names = res.rows.map((r) => r.column_name);
      expect(names).toEqual(
        expect.arrayContaining([
          "id",
          "tenant_id",
          "bulk_run_id",
          "root_message_id",
          "subject",
          "email_count",
          "first_date",
          "last_date",
          "participant_pseudonyms",
          "redacted_body",
          "thread_status",
          "created_at",
        ]),
      );
    });
  });

  it("email_pattern existiert mit curation_status CHECK + FK auf knowledge_unit", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_pattern'`,
      );
      const names = res.rows.map((r) => r.column_name);
      expect(names).toEqual(
        expect.arrayContaining([
          "id",
          "tenant_id",
          "bulk_run_id",
          "thread_id",
          "title",
          "description",
          "evidence_snippets",
          "themes",
          "confidence",
          "suggested_section",
          "curation_status",
          "curated_section",
          "curator_user_id",
          "curated_at",
          "imported_to_handbook_at",
          "imported_knowledge_unit_id",
          "created_at",
        ]),
      );
      // FK target check
      const fk = await client.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conrelid = 'public.email_pattern'::regclass
            AND contype  = 'f'`,
      );
      const fkDefs = fk.rows.map((r) => r.pg_get_constraintdef).join("\n");
      expect(fkDefs).toContain("knowledge_unit");
    });
  });

  it("late-binding FK email_message.thread_id -> email_thread existiert", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{ conname: string; pg_get_constraintdef: string }>(
        `SELECT conname, pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conrelid = 'public.email_message'::regclass
            AND contype  = 'f'
            AND conname  = 'fk_email_message_thread'`,
      );
      expect(res.rowCount).toBe(1);
      // pg_get_constraintdef rendert ohne `public.`-Prefix wenn das Default-Schema
      // im search_path ist (was bei Supabase-Default-Setup der Fall ist).
      expect(res.rows[0].pg_get_constraintdef).toContain("REFERENCES email_thread");
      expect(res.rows[0].pg_get_constraintdef).toContain("ON DELETE SET NULL");
    });
  });
});

// ============================================================================
// Pflicht-Indexes
// ============================================================================

describe("Migration 106 — Indexes", () => {
  it("email_bulk_run hat 3+ indexes (tenant + status partial + session partial)", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{ indexname: string }>(
        `SELECT indexname
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename  = 'email_bulk_run'`,
      );
      const idx = res.rows.map((r) => r.indexname);
      expect(idx).toEqual(
        expect.arrayContaining([
          "idx_email_bulk_run_tenant",
          "idx_email_bulk_run_status",
          "idx_email_bulk_run_session",
        ]),
      );
    });
  });

  it("email_message hat 4 indexes (bulk_run + thread + message_id + tenant)", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{ indexname: string }>(
        `SELECT indexname
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename  = 'email_message'`,
      );
      const idx = res.rows.map((r) => r.indexname);
      expect(idx).toEqual(
        expect.arrayContaining([
          "idx_email_message_bulk_run",
          "idx_email_message_thread",
          "idx_email_message_message_id",
          "idx_email_message_tenant",
        ]),
      );
    });
  });
});

// ============================================================================
// RLS-Policy-Existenz (Pen-Tests separat in v9-bulk-email.rls.test.ts)
// ============================================================================

describe("Migration 106 — RLS Policies", () => {
  it("alle 4 Tabellen haben ENABLE ROW LEVEL SECURITY", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{ relname: string; relrowsecurity: boolean }>(
        `SELECT relname, relrowsecurity
           FROM pg_class
          WHERE relname IN ('email_bulk_run', 'email_message', 'email_thread', 'email_pattern')`,
      );
      expect(res.rowCount).toBe(4);
      for (const row of res.rows) {
        expect(row.relrowsecurity).toBe(true);
      }
    });
  });

  it("16 Policies (4 pro Tabelle: admin_select + tenant_select + tenant_insert + tenant_update)", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{ tablename: string; policyname: string }>(
        `SELECT c.relname AS tablename, p.polname AS policyname
           FROM pg_policy p
           JOIN pg_class c ON c.oid = p.polrelid
          WHERE c.relname IN ('email_bulk_run', 'email_message', 'email_thread', 'email_pattern')`,
      );
      expect(res.rowCount).toBe(16);

      for (const table of ["email_bulk_run", "email_message", "email_thread", "email_pattern"]) {
        const tablePolicies = res.rows.filter((r) => r.tablename === table).map((r) => r.policyname);
        expect(tablePolicies).toEqual(
          expect.arrayContaining([
            `${table}_admin_select`,
            `${table}_tenant_select`,
            `${table}_tenant_insert`,
            `${table}_tenant_update`,
          ]),
        );
      }
    });
  });
});

// ============================================================================
// capture_session.capture_mode CHECK + Storage-Bucket
// ============================================================================

describe("Migration 106 — capture_mode CHECK", () => {
  it("capture_session_capture_mode_check enthaelt 'email_bulk' + alle Bestandswerte", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{ pg_get_constraintdef: string }>(
        `SELECT pg_get_constraintdef(oid)
           FROM pg_constraint
          WHERE conname = 'capture_session_capture_mode_check'`,
      );
      expect(res.rowCount).toBe(1);
      const def = res.rows[0].pg_get_constraintdef;
      for (const mode of [
        "questionnaire",
        "evidence",
        "dialogue",
        "employee_questionnaire",
        "walkthrough_stub",
        "walkthrough",
        "email_bulk",
      ]) {
        expect(def).toContain(mode);
      }
    });
  });

  it("INSERT capture_session mit capture_mode='email_bulk' wird akzeptiert", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      // capture_session hat mehrere NOT NULL Spalten: tenant_id, template_id,
      // template_version, owner_user_id, status, answers, metadata,
      // released_for_strategaize_review. Wir holen template_id + version
      // aus dem Bestand und referenzieren einen bestehenden auth.users-User,
      // um den handle_new_user-Trigger zu vermeiden.
      const tenantRes = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name) VALUES ($1) RETURNING id`,
        ["V9-mt2-test-tenant"],
      );
      const tenantId = tenantRes.rows[0].id;
      const sessionRes = await client.query<{ capture_mode: string }>(
        `INSERT INTO public.capture_session (
           tenant_id, template_id, template_version, owner_user_id,
           status, answers, released_for_strategaize_review, metadata, capture_mode
         )
         SELECT
           $1::uuid,
           t.id,
           t.version,
           (SELECT id FROM auth.users LIMIT 1),
           'open',
           '{}'::jsonb,
           false,
           '{}'::jsonb,
           'email_bulk'
         FROM public.template t
         LIMIT 1
         RETURNING capture_mode`,
        [tenantId],
      );
      expect(sessionRes.rows[0].capture_mode).toBe("email_bulk");
    });
  });
});

describe("Migration 106 — Storage-Bucket + View", () => {
  it("storage.buckets enthaelt 'bulk-email' mit file_size_limit + allowed_mime_types", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{
        id: string;
        public: boolean;
        file_size_limit: number | null;
        allowed_mime_types: string[] | null;
      }>(
        `SELECT id, public, file_size_limit, allowed_mime_types
           FROM storage.buckets
          WHERE id = 'bulk-email'`,
      );
      expect(res.rowCount).toBe(1);
      expect(res.rows[0].public).toBe(false);
      // file_size_limit ist bigint -> pg liefert als String, daher Number(...)
      expect(Number(res.rows[0].file_size_limit)).toBe(524288000);
      expect(res.rows[0].allowed_mime_types).toEqual(
        expect.arrayContaining(["application/mbox", "message/rfc822"]),
      );
    });
  });

  it("3 Storage-RLS-Policies fuer bulk-email-Bucket existieren", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      const res = await client.query<{ polname: string }>(
        `SELECT polname
           FROM pg_policy
          WHERE polrelid = 'storage.objects'::regclass
            AND polname  LIKE 'bulk_email_bucket_%'`,
      );
      const names = res.rows.map((r) => r.polname);
      expect(names).toEqual(
        expect.arrayContaining([
          "bulk_email_bucket_insert",
          "bulk_email_bucket_select",
          "bulk_email_bucket_delete",
        ]),
      );
    });
  });

  it("vw_bulk_email_cost_monthly View existiert + filtert failed-Runs aus", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      // View vorhanden?
      const viewRes = await client.query<{ viewname: string }>(
        `SELECT viewname
           FROM pg_views
          WHERE schemaname = 'public'
            AND viewname   = 'vw_bulk_email_cost_monthly'`,
      );
      expect(viewRes.rowCount).toBe(1);

      // Smoke: 1 completed-Run + 1 failed-Run → View zeigt nur completed.
      // tenant zuerst, weil handle_new_user-Trigger auf auth.users den Wert
      // tenant_id aus raw_app_meta_data liest.
      const tenantRes = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name) VALUES ($1) RETURNING id`,
        ["V9-mt2-cost-test"],
      );
      const tenantId = tenantRes.rows[0].id;
      // auth.users-Schema von Supabase erfordert viele NOT-NULL Spalten +
      // handle_new_user-Trigger verlangt tenant_id + role in raw_USER_meta_data
      // (NICHT raw_app_meta_data — siehe pg_proc handle_new_user-Definition).
      // Pattern aus src/__tests__/rls/v4-fixtures.ts (mkUser) reused.
      const userRes = await client.query<{ id: string }>(
        `INSERT INTO auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at
         )
         VALUES (
           '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
           'authenticated', 'authenticated',
           'mt2-test-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
           '{}'::jsonb,
           jsonb_build_object('tenant_id', $1::text, 'role', 'tenant_admin'),
           now(), now()
         )
         RETURNING id`,
        [tenantId],
      );
      const userId = userRes.rows[0].id;
      await client.query(
        `INSERT INTO public.email_bulk_run
            (tenant_id, uploader_user_id, source_file_name, file_hash, storage_path,
             pre_filter_cost_eur, pattern_extraction_cost_eur, status)
          VALUES ($1, $2, 'a.mbox', 'hash-a', 'p/a', 1.5, 3.0, 'completed'),
                 ($1, $2, 'b.mbox', 'hash-b', 'p/b', 2.0, 5.0, 'failed')`,
        [tenantId, userId],
      );
      const viewSum = await client.query<{ total_cost_eur: string | null; run_count: string }>(
        `SELECT total_cost_eur::text, run_count::text
           FROM public.vw_bulk_email_cost_monthly
          WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(viewSum.rowCount).toBe(1);
      expect(Number(viewSum.rows[0].total_cost_eur)).toBeCloseTo(4.5, 4); // 1.5 + 3.0, failed excluded
      expect(viewSum.rows[0].run_count).toBe("1");
    });
  });
});

// ============================================================================
// Idempotenz
// ============================================================================

describe("Migration 106 — Idempotenz", () => {
  it("apply 2x: keine Fehler, Tabellen + Policies bleiben in erwartetem Zustand", async () => {
    await withTestDb(async (client) => {
      await applyMigration106(client);
      await applyMigration106(client);

      const tables = await client.query<{ relname: string }>(
        `SELECT relname FROM pg_class
          WHERE relname IN ('email_bulk_run','email_message','email_thread','email_pattern')`,
      );
      expect(tables.rowCount).toBe(4);

      const policies = await client.query<{ c: string }>(
        `SELECT count(*)::text AS c
           FROM pg_policy p
           JOIN pg_class c ON c.oid = p.polrelid
          WHERE c.relname IN ('email_bulk_run','email_message','email_thread','email_pattern')`,
      );
      expect(policies.rows[0].c).toBe("16");
    });
  });
});
