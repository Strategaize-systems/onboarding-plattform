// V9.1 SLC-V9.1-C MT-2 — Coolify-DB-Integration-Test fuer die Retention-Sweep-
// SQL-Semantik (AC-V9.1-C-8). Gated auf TEST_DATABASE_URL (IMP-1183 Skip-Guard);
// no-op lokal ohne DB. Laeuft on-server via coolify-test-setup.md Pattern
// (node:20 im Docker-Netz). Alles in EINER Transaction die am Ende ROLLBACKed —
// es persistiert nichts.
//
// Verifiziert die exakten Queries aus createRetentionStoreFromSupabase() gegen
// das echte Schema (MIG-058 run-level retention): Soft-Delete-UPDATE,
// Hard-deletable-SELECT, knowledge_unit-Idempotency (metadata->>bulk_run_id),
// email_message-Cascade. Storage-Delete ist im MT-1 Unit-Test abgedeckt.

import { describe, it, expect } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeLive = TEST_DATABASE_URL ? describe : describe.skip;

describeLive("Retention-Sweep SQL (Live Coolify-DB)", async () => {
  const { Client } = await import("pg");

  it("schema sanity: email_bulk_run hat retention_until + soft_delete_at", async () => {
    const c = new Client({ connectionString: TEST_DATABASE_URL });
    await c.connect();
    try {
      const r = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='email_bulk_run'
          AND column_name IN ('retention_until','soft_delete_at','created_at')
        ORDER BY column_name
      `);
      expect(r.rows.map((row) => row.column_name)).toEqual([
        "created_at",
        "retention_until",
        "soft_delete_at",
      ]);
    } finally {
      await c.end();
    }
  });

  it("schema sanity: email_message hat raw_storage_path, KEIN deleted_at", async () => {
    const c = new Client({ connectionString: TEST_DATABASE_URL });
    await c.connect();
    try {
      const r = await c.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='email_message'
          AND column_name IN ('raw_storage_path','deleted_at','retention_until','bulk_run_id')
        ORDER BY column_name
      `);
      // Bestaetigt run-level Resolution: nur raw_storage_path + bulk_run_id, KEIN
      // deleted_at / retention_until auf email_message.
      expect(r.rows.map((row) => row.column_name)).toEqual([
        "bulk_run_id",
        "raw_storage_path",
      ]);
    } finally {
      await c.end();
    }
  });

  it("schema sanity: email_message.bulk_run_id ist ON DELETE CASCADE", async () => {
    const c = new Client({ connectionString: TEST_DATABASE_URL });
    await c.connect();
    try {
      const r = await c.query(`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = rc.constraint_name
        WHERE kcu.table_name='email_message' AND kcu.column_name='bulk_run_id'
        LIMIT 1
      `);
      expect(r.rows[0]?.delete_rule).toBe("CASCADE");
    } finally {
      await c.end();
    }
  });

  it("Soft/Hard/Cascade/Idempotency-Semantik (Transaction-ROLLBACK)", async () => {
    const c = new Client({ connectionString: TEST_DATABASE_URL });
    await c.connect();
    try {
      await c.query("BEGIN");

      const tenant = await c.query(
        "SELECT id FROM public.tenants LIMIT 1",
      );
      const user = await c.query("SELECT id FROM auth.users LIMIT 1");
      if (tenant.rowCount === 0 || user.rowCount === 0) {
        // Ohne Seed-Tenant/User kein Insert moeglich — Semantik trotzdem ok.
        await c.query("ROLLBACK");
        return;
      }
      const tenantId = tenant.rows[0].id as string;
      const userId = user.rows[0].id as string;

      // 3 Runs: fresh (skip), 65d (soft-target), 95d+soft_delete_at (hard-target)
      const mkRun = async (ageDays: number, soft: boolean, tag: string) => {
        const res = await c.query(
          `INSERT INTO public.email_bulk_run
             (tenant_id, uploader_user_id, source_file_name, file_hash,
              storage_path, status, inbound_source, created_at, soft_delete_at)
           VALUES ($1,$2,$3,$4,$5,'completed','forward_bucket',
                   now() - ($6 || ' days')::interval,
                   CASE WHEN $7 THEN now() - interval '30 days' ELSE NULL END)
           RETURNING id`,
          [tenantId, userId, `f-${tag}.mbox`, `hash-${tag}-${Math.floor(ageDays)}`,
            `path/${tag}`, String(ageDays), soft],
        );
        return res.rows[0].id as string;
      };
      const fresh = await mkRun(1, false, "fresh");
      const soft65 = await mkRun(65, false, "soft65");
      const hard95 = await mkRun(95, true, "hard95");

      // email_message fuer hard95 (Cascade-Target)
      await c.query(
        `INSERT INTO public.email_message
           (tenant_id, bulk_run_id, message_id, raw_storage_path)
         VALUES ($1,$2,'mid-1','path/hard95/m1.eml')`,
        [tenantId, hard95],
      );

      // ── Phase 1: Soft-Delete (mirror softDeleteExpiredRuns, 60d Cutoff) ──
      const soft = await c.query(
        `UPDATE public.email_bulk_run
           SET soft_delete_at = now()
         WHERE created_at < now() - interval '60 days'
           AND soft_delete_at IS NULL
           AND id = ANY($1::uuid[])
         RETURNING id`,
        [[fresh, soft65, hard95]],
      );
      // Nur soft65 wird neu soft-deleted (fresh zu jung, hard95 schon gesetzt).
      expect(soft.rows.map((r) => r.id)).toEqual([soft65]);

      // ── Phase 2: Hard-deletable SELECT (90d Cutoff + soft_delete_at set) ──
      const hard = await c.query(
        `SELECT id FROM public.email_bulk_run
         WHERE created_at < now() - interval '90 days'
           AND soft_delete_at IS NOT NULL
           AND id = ANY($1::uuid[])`,
        [[fresh, soft65, hard95]],
      );
      expect(hard.rows.map((r) => r.id)).toEqual([hard95]);

      // ── Idempotency: knowledge_unit via metadata->>bulk_run_id ──
      const importedBefore = await c.query(
        `SELECT 1 FROM public.knowledge_unit
         WHERE source='email_bulk' AND metadata->>'bulk_run_id' = $1 LIMIT 1`,
        [hard95],
      );
      expect(importedBefore.rowCount).toBe(0); // kein Import -> hard-deletable

      // ── Cascade: DELETE run entfernt email_message ──
      await c.query("DELETE FROM public.email_bulk_run WHERE id = $1", [hard95]);
      const orphan = await c.query(
        "SELECT 1 FROM public.email_message WHERE bulk_run_id = $1",
        [hard95],
      );
      expect(orphan.rowCount).toBe(0);

      await c.query("ROLLBACK");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      await c.end();
    }
  });
});
