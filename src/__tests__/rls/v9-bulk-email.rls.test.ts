// V9 SLC-165 MT-6 — RLS-Pen-Test-Matrix fuer die 4 V9-Bulk-Email-Tabellen.
//
// Pflicht-Gate aus AC-SLC-165-10: 16+ Pen-Test-Cases (4 Rollen × 4 Tabellen).
// Diese Suite liefert 24 Matrix-Tests (6 pro Tabelle) + 1 Cross-Cut-Defense.
//
// Rollen-Matrix V9.0 (Migration 106 Zeile 18-24):
//   - strategaize_admin: SELECT Cross-Tenant — alle 4 Tabellen. KEIN INSERT.
//   - tenant_admin (GF): SELECT + INSERT + UPDATE auf own-Tenant; KEIN Cross-Tenant.
//   - tenant_member + employee: Default-Deny (keine Policy → 0 Rows SELECT, INSERT-Reject).
//
// Test-Struktur pro Tabelle (6 Tests):
//   1. strategaize_admin SELECT cross-tenant → sieht beide Rows
//   2. tenant_admin SELECT own + cross-tenant DENY (kombiniert)
//   3. tenant_admin INSERT own ALLOW
//   4. tenant_admin UPDATE own ALLOW
//   5. tenant_member SELECT DENY + INSERT DENY (kombiniert, default-deny)
//   6. employee SELECT DENY + INSERT DENY (kombiniert, default-deny)
//
// + Cross-Cut-Defense (1 describe, 3 Tests):
//   - tenant_admin INSERT mit Cross-Tenant tenant_id → RLS-WITH-CHECK Reject
//   - tenant_admin UPDATE einer Cross-Tenant-Row → 0 Rows (RLS USING filtert)
//   - strategaize_admin INSERT DENY (kein admin_insert-Policy, default-deny)
//
// SAVEPOINT-Pattern fuer expected RLS-Rejections per .claude/rules/coolify-test-setup.md
// (IMP-044). Eine RLS-Verletzung bringt die Tx in Abort-Status — wir wrappen jeden
// expected-failure Block in ein SAVEPOINT und rollen es selektiv zurueck.
//
// Pattern-Reuse:
//   - Test-Aufbau: src/__tests__/rls/block-review-rls.test.ts (SLC-041 MT-4).
//   - V4-Matrix-Vorlage: src/__tests__/rls/v4-perimeter-matrix.test.ts (SLC-037 MT-7).
//   - Fixtures: src/__tests__/rls/v9-bulk-email-fixtures.ts (eigener File, reused v4).

import { describe, it, expect } from "vitest";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedV9BulkEmailFixtures } from "./v9-bulk-email-fixtures";

/**
 * Wrapper fuer erwartete RLS-Rejections (SAVEPOINT-Pattern).
 * Gibt die error-message zurueck (leer wenn KEIN Fehler kam → Test schlaegt fehl).
 */
async function expectRlsReject(
  client: Client,
  query: string,
  params: unknown[],
): Promise<string> {
  await client.query("SAVEPOINT try_op");
  let errorMsg = "";
  try {
    await client.query(query, params);
  } catch (e) {
    errorMsg = (e as Error).message;
  }
  await client.query("ROLLBACK TO SAVEPOINT try_op");
  return errorMsg;
}

// ============================================================================
// email_bulk_run — 6 Tests
// ============================================================================

describe("V9 RLS email_bulk_run — 4 Rollen", () => {
  it("strategaize_admin sieht beide email_bulk_run cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_bulk_run
            WHERE id IN ($1, $2)`,
          [f.bulkRunA, f.bulkRunB],
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht eigene email_bulk_run, cross-tenant blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_bulk_run WHERE id = $1`,
          [f.bulkRunA],
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_bulk_run WHERE id = $1`,
          [f.bulkRunB],
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_admin darf INSERT in eigenen Tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{ id: string }>(
          `INSERT INTO public.email_bulk_run
             (tenant_id, uploader_user_id, source_file_name, file_hash,
              storage_path, status)
           VALUES ($1, $2, 'ta-insert.mbox',
                   'hash-ta-insert-' || substr(gen_random_uuid()::text, 1, 8),
                   'storage/ta-insert', 'uploaded')
           RETURNING id`,
          [f.tenantA, f.tenantAdminAUserId],
        );
        expect(res.rows[0].id).toBeTruthy();
      });
    });
  });

  it("tenant_admin darf UPDATE auf eigene email_bulk_run", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{ id: string; status: string }>(
          `UPDATE public.email_bulk_run
              SET status = 'parsing'
            WHERE id = $1
            RETURNING id, status`,
          [f.bulkRunA],
        );
        expect(res.rowCount).toBe(1);
        expect(res.rows[0].status).toBe("parsing");
      });
    });
  });

  it("tenant_member: SELECT 0 + INSERT DENY (default-deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const sel = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_bulk_run
            WHERE id IN ($1, $2)`,
          [f.bulkRunA, f.bulkRunB],
        );
        expect(sel.rows[0].c).toBe("0");

        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_bulk_run
             (tenant_id, uploader_user_id, source_file_name, file_hash,
              storage_path, status)
           VALUES ($1, $2, 'member-insert.mbox',
                   'hash-member-insert-' || substr(gen_random_uuid()::text, 1, 8),
                   'storage/member-insert', 'uploaded')`,
          [f.tenantA, f.tenantMemberAUserId],
        );
        expect(errMsg).toMatch(/row-level security|permission denied|violates/i);
      });
    });
  });

  it("employee: SELECT 0 + INSERT DENY (default-deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const sel = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_bulk_run
            WHERE id IN ($1, $2)`,
          [f.bulkRunA, f.bulkRunB],
        );
        expect(sel.rows[0].c).toBe("0");

        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_bulk_run
             (tenant_id, uploader_user_id, source_file_name, file_hash,
              storage_path, status)
           VALUES ($1, $2, 'emp-insert.mbox',
                   'hash-emp-insert-' || substr(gen_random_uuid()::text, 1, 8),
                   'storage/emp-insert', 'uploaded')`,
          [f.tenantA, f.employeeAUserId],
        );
        expect(errMsg).toMatch(/row-level security|permission denied|violates/i);
      });
    });
  });
});

// ============================================================================
// email_message — 6 Tests
// ============================================================================

describe("V9 RLS email_message — 4 Rollen", () => {
  it("strategaize_admin sieht beide email_message cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_message
            WHERE id IN ($1, $2)`,
          [f.messageA, f.messageB],
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht eigene email_message, cross-tenant blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_message WHERE id = $1`,
          [f.messageA],
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_message WHERE id = $1`,
          [f.messageB],
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_admin darf INSERT email_message in eigenen Tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{ id: string }>(
          `INSERT INTO public.email_message
             (tenant_id, bulk_run_id, thread_id, message_id, subject, body_text)
           VALUES ($1, $2, $3,
                   '<ta-insert-' || substr(gen_random_uuid()::text, 1, 8) || '@v9.test>',
                   'TA Insert', 'body')
           RETURNING id`,
          [f.tenantA, f.bulkRunA, f.threadA],
        );
        expect(res.rows[0].id).toBeTruthy();
      });
    });
  });

  it("tenant_admin darf UPDATE auf eigene email_message", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{ id: string; pre_filter_label: string }>(
          `UPDATE public.email_message
              SET pre_filter_label = 'content'
            WHERE id = $1
            RETURNING id, pre_filter_label`,
          [f.messageA],
        );
        expect(res.rowCount).toBe(1);
        expect(res.rows[0].pre_filter_label).toBe("content");
      });
    });
  });

  it("tenant_member: SELECT 0 + INSERT DENY (default-deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const sel = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_message
            WHERE id IN ($1, $2)`,
          [f.messageA, f.messageB],
        );
        expect(sel.rows[0].c).toBe("0");

        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_message
             (tenant_id, bulk_run_id, thread_id, message_id, subject, body_text)
           VALUES ($1, $2, $3,
                   '<member-insert-' || substr(gen_random_uuid()::text, 1, 8) || '@v9.test>',
                   'Member Insert', 'body')`,
          [f.tenantA, f.bulkRunA, f.threadA],
        );
        expect(errMsg).toMatch(/row-level security|permission denied|violates/i);
      });
    });
  });

  it("employee: SELECT 0 + INSERT DENY (default-deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const sel = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_message
            WHERE id IN ($1, $2)`,
          [f.messageA, f.messageB],
        );
        expect(sel.rows[0].c).toBe("0");

        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_message
             (tenant_id, bulk_run_id, thread_id, message_id, subject, body_text)
           VALUES ($1, $2, $3,
                   '<emp-insert-' || substr(gen_random_uuid()::text, 1, 8) || '@v9.test>',
                   'Emp Insert', 'body')`,
          [f.tenantA, f.bulkRunA, f.threadA],
        );
        expect(errMsg).toMatch(/row-level security|permission denied|violates/i);
      });
    });
  });
});

// ============================================================================
// email_thread — 6 Tests
// ============================================================================

describe("V9 RLS email_thread — 4 Rollen", () => {
  it("strategaize_admin sieht beide email_thread cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_thread
            WHERE id IN ($1, $2)`,
          [f.threadA, f.threadB],
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht eigenen email_thread, cross-tenant blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_thread WHERE id = $1`,
          [f.threadA],
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_thread WHERE id = $1`,
          [f.threadB],
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_admin darf INSERT email_thread in eigenen Tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{ id: string }>(
          `INSERT INTO public.email_thread
             (tenant_id, bulk_run_id, root_message_id, subject, email_count,
              thread_status)
           VALUES ($1, $2,
                   '<ta-insert-' || substr(gen_random_uuid()::text, 1, 8) || '@v9.test>',
                   'TA Insert Thread', 1, 'aggregated')
           RETURNING id`,
          [f.tenantA, f.bulkRunA],
        );
        expect(res.rows[0].id).toBeTruthy();
      });
    });
  });

  it("tenant_admin darf UPDATE auf eigenen email_thread", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{ id: string; thread_status: string }>(
          `UPDATE public.email_thread
              SET thread_status = 'redacted'
            WHERE id = $1
            RETURNING id, thread_status`,
          [f.threadA],
        );
        expect(res.rowCount).toBe(1);
        expect(res.rows[0].thread_status).toBe("redacted");
      });
    });
  });

  it("tenant_member: SELECT 0 + INSERT DENY (default-deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const sel = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_thread
            WHERE id IN ($1, $2)`,
          [f.threadA, f.threadB],
        );
        expect(sel.rows[0].c).toBe("0");

        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_thread
             (tenant_id, bulk_run_id, root_message_id, subject, email_count,
              thread_status)
           VALUES ($1, $2,
                   '<member-insert-' || substr(gen_random_uuid()::text, 1, 8) || '@v9.test>',
                   'Member Insert Thread', 1, 'aggregated')`,
          [f.tenantA, f.bulkRunA],
        );
        expect(errMsg).toMatch(/row-level security|permission denied|violates/i);
      });
    });
  });

  it("employee: SELECT 0 + INSERT DENY (default-deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const sel = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_thread
            WHERE id IN ($1, $2)`,
          [f.threadA, f.threadB],
        );
        expect(sel.rows[0].c).toBe("0");

        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_thread
             (tenant_id, bulk_run_id, root_message_id, subject, email_count,
              thread_status)
           VALUES ($1, $2,
                   '<emp-insert-' || substr(gen_random_uuid()::text, 1, 8) || '@v9.test>',
                   'Emp Insert Thread', 1, 'aggregated')`,
          [f.tenantA, f.bulkRunA],
        );
        expect(errMsg).toMatch(/row-level security|permission denied|violates/i);
      });
    });
  });
});

// ============================================================================
// email_pattern — 6 Tests
// ============================================================================

describe("V9 RLS email_pattern — 4 Rollen", () => {
  it("strategaize_admin sieht beide email_pattern cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_pattern
            WHERE id IN ($1, $2)`,
          [f.patternA, f.patternB],
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht eigenes email_pattern, cross-tenant blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_pattern WHERE id = $1`,
          [f.patternA],
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_pattern WHERE id = $1`,
          [f.patternB],
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_admin darf INSERT email_pattern in eigenen Tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{ id: string }>(
          `INSERT INTO public.email_pattern
             (tenant_id, bulk_run_id, thread_id, title, description, confidence,
              curation_status)
           VALUES ($1, $2, $3, 'TA Insert Pattern', 'desc', 0.9,
                   'pending_curation')
           RETURNING id`,
          [f.tenantA, f.bulkRunA, f.threadA],
        );
        expect(res.rows[0].id).toBeTruthy();
      });
    });
  });

  it("tenant_admin darf UPDATE auf eigenes email_pattern (Curation-Decision)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{ id: string; curation_status: string }>(
          `UPDATE public.email_pattern
              SET curation_status = 'accepted',
                  curator_user_id  = $2,
                  curated_at       = now()
            WHERE id = $1
            RETURNING id, curation_status`,
          [f.patternA, f.tenantAdminAUserId],
        );
        expect(res.rowCount).toBe(1);
        expect(res.rows[0].curation_status).toBe("accepted");
      });
    });
  });

  it("tenant_member: SELECT 0 + INSERT DENY (default-deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const sel = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_pattern
            WHERE id IN ($1, $2)`,
          [f.patternA, f.patternB],
        );
        expect(sel.rows[0].c).toBe("0");

        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_pattern
             (tenant_id, bulk_run_id, thread_id, title, description, confidence,
              curation_status)
           VALUES ($1, $2, $3, 'Member Pattern', 'desc', 0.5,
                   'pending_curation')`,
          [f.tenantA, f.bulkRunA, f.threadA],
        );
        expect(errMsg).toMatch(/row-level security|permission denied|violates/i);
      });
    });
  });

  it("employee: SELECT 0 + INSERT DENY (default-deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const sel = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_pattern
            WHERE id IN ($1, $2)`,
          [f.patternA, f.patternB],
        );
        expect(sel.rows[0].c).toBe("0");

        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_pattern
             (tenant_id, bulk_run_id, thread_id, title, description, confidence,
              curation_status)
           VALUES ($1, $2, $3, 'Emp Pattern', 'desc', 0.5,
                   'pending_curation')`,
          [f.tenantA, f.bulkRunA, f.threadA],
        );
        expect(errMsg).toMatch(/row-level security|permission denied|violates/i);
      });
    });
  });
});

// ============================================================================
// Cross-Cut Defense — 3 Tests
// ============================================================================

describe("V9 RLS Cross-Cut Defense (Pen-Test)", () => {
  it("tenant_admin INSERT mit Cross-Tenant tenant_id → WITH CHECK Reject", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_bulk_run
             (tenant_id, uploader_user_id, source_file_name, file_hash,
              storage_path, status)
           VALUES ($1, $2, 'cross-insert.mbox',
                   'hash-cross-' || substr(gen_random_uuid()::text, 1, 8),
                   'storage/cross', 'uploaded')`,
          // Tenant A user versucht eine Tenant-B-Row anzulegen → WITH CHECK reject.
          [f.tenantB, f.tenantAdminAUserId],
        );
        expect(errMsg).toMatch(/row-level security|new row violates/i);
      });
    });
  });

  it("tenant_admin UPDATE auf Cross-Tenant-Row → 0 Rows (RLS USING filtert vor)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        // UPDATE liefert 0 Rows, weil USING-Clause die fremde Row maskiert.
        const res = await client.query(
          `UPDATE public.email_message
              SET pre_filter_label = 'content'
            WHERE id = $1
            RETURNING id`,
          [f.messageB],
        );
        expect(res.rowCount).toBe(0);
      });
    });
  });

  it("strategaize_admin INSERT email_bulk_run → DENY (kein admin_insert-Policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_bulk_run
             (tenant_id, uploader_user_id, source_file_name, file_hash,
              storage_path, status)
           VALUES ($1, $2, 'sa-insert.mbox',
                   'hash-sa-' || substr(gen_random_uuid()::text, 1, 8),
                   'storage/sa', 'uploaded')`,
          [f.tenantA, f.strategaizeAdminUserId],
        );
        expect(errMsg).toMatch(/row-level security|new row violates/i);
      });
    });
  });
});
