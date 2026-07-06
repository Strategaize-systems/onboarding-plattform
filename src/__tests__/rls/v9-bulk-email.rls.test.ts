// V9 SLC-165 MT-6 — RLS-Pen-Test-Matrix fuer die 4 V9-Bulk-Email-Tabellen.
//
// Pflicht-Gate aus AC-SLC-165-10: Pen-Test-Cases (3 Rollen × 4 Tabellen).
// Diese Suite liefert Matrix-Tests (5 pro Tabelle) + 1 Cross-Cut-Defense.
//
// Rollen-Matrix (Migration 106, aktualisiert MIG-131):
//   - strategaize_admin: SELECT Cross-Tenant — alle 4 Tabellen. KEIN INSERT.
//   - tenant_admin (GF): SELECT + INSERT + UPDATE auf own-Tenant; KEIN Cross-Tenant.
//   - employee: Default-Deny (keine Policy → 0 Rows SELECT, INSERT-Reject).
//
// Test-Struktur pro Tabelle (5 Tests):
//   1. strategaize_admin SELECT cross-tenant → sieht beide Rows
//   2. tenant_admin SELECT own + cross-tenant DENY (kombiniert)
//   3. tenant_admin INSERT own ALLOW
//   4. tenant_admin UPDATE own ALLOW
//   5. employee SELECT DENY + INSERT DENY (kombiniert, default-deny)
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
// email_thread MT-6 Sensitive-Spalten + Status-Maschine — +8 Tests (SLC-166 MT-7)
//
// Die obigen 6 email_thread-Cases decken die Basics (Cross-Tenant SELECT/INSERT/
// UPDATE/default-deny) ab. MT-6 fuehrt zwei MT-6-spezifische RLS-relevante
// Aspekte ein, die hier ergaenzt werden:
//
// 1. Sensitive Spalten: `redacted_body` (TEXT) + `participant_pseudonyms`
//    (JSONB). Beide enthalten potentielle PII (Pseudonyme-Mapping enthaelt die
//    Klartext-Email-Adresse als Map-Key). Die SELECT-Policy muss auch fuer
//    diese Spalten greifen — Cross-Tenant-Read darf weder den Spalten-Wert
//    noch ein Pattern-Leakage erlauben.
// 2. Status-Maschine: thread_status durchlaeuft 'aggregated' → 'redacting' →
//    'redacted' (Happy Path) oder 'redacting' → 'failed' (Crash, Spec L179).
//    Die UPDATE-Policy muss alle 4 Werte zulassen, Cross-Tenant-UPDATE muss
//    weiterhin 0 Rows liefern.
//
// Setup-Pattern: nach seedV9BulkEmailFixtures UPDATE-en wir die Threads als
// Superuser auf 'redacted' + redacted_body + participant_pseudonyms. Dann
// kommt withJwtContext fuer den Pen-Test.
// ============================================================================

const REDACTED_BODY_PLACEHOLDER =
  "From: P1\nTo: P2\nSubject: Anfrage\n\nHallo P2, ich melde mich wegen der Sache. Gruss P1.";

const PARTICIPANT_PSEUDONYMS_PLACEHOLDER = {
  "alice@example.com": "P1",
  "bob@example.com": "P2",
};

async function applyRedactedFixturesToAllThreads(
  client: Client,
  threadAId: string,
  threadBId: string,
): Promise<void> {
  await client.query(
    `UPDATE public.email_thread
        SET redacted_body          = $1,
            participant_pseudonyms = $2,
            thread_status          = 'redacted'
      WHERE id IN ($3, $4)`,
    [
      REDACTED_BODY_PLACEHOLDER,
      JSON.stringify(PARTICIPANT_PSEUDONYMS_PLACEHOLDER),
      threadAId,
      threadBId,
    ],
  );
}

describe("V9 RLS email_thread MT-6 — Sensitive-Spalten + Status-Maschine (+8 Cases)", () => {
  // --- Cluster A: Sensitive-Spalten Read-Isolation (3 Cases) ---

  it("strategaize_admin sieht redacted_body + participant_pseudonyms cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await applyRedactedFixturesToAllThreads(client, f.threadA, f.threadB);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{
          id: string;
          redacted_body: string | null;
          participant_pseudonyms: Record<string, string> | null;
        }>(
          `SELECT id, redacted_body, participant_pseudonyms
             FROM public.email_thread
            WHERE id IN ($1, $2)
            ORDER BY id`,
          [f.threadA, f.threadB],
        );
        expect(res.rowCount).toBe(2);
        for (const row of res.rows) {
          expect(row.redacted_body).toContain("P1");
          expect(row.redacted_body).toContain("P2");
          expect(row.participant_pseudonyms).toMatchObject(
            PARTICIPANT_PSEUDONYMS_PLACEHOLDER,
          );
        }
      });
    });
  });

  it("tenant_admin sieht eigene redacted_body + participant_pseudonyms", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await applyRedactedFixturesToAllThreads(client, f.threadA, f.threadB);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{
          redacted_body: string | null;
          participant_pseudonyms: Record<string, string> | null;
        }>(
          `SELECT redacted_body, participant_pseudonyms
             FROM public.email_thread
            WHERE id = $1`,
          [f.threadA],
        );
        expect(res.rowCount).toBe(1);
        expect(res.rows[0].redacted_body).toContain("P1");
        expect(res.rows[0].participant_pseudonyms).toMatchObject(
          PARTICIPANT_PSEUDONYMS_PLACEHOLDER,
        );
      });
    });
  });

  it("tenant_admin: Cross-Tenant redacted_body + participant_pseudonyms → 0 Rows", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await applyRedactedFixturesToAllThreads(client, f.threadA, f.threadB);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{ redacted_body: string | null }>(
          `SELECT redacted_body, participant_pseudonyms
             FROM public.email_thread
            WHERE id = $1`,
          [f.threadB],
        );
        expect(res.rowCount).toBe(0);
      });
    });
  });

  // --- Cluster B: Status-Maschine MT-6 Transitions (3 Cases) ---

  it("tenant_admin darf UPDATE thread_status 'aggregated' → 'redacting' (Worker-Start-Pfad)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      // Default-Fixtures sind 'aggregated' (kein vorheriger UPDATE noetig).
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{ thread_status: string }>(
          `UPDATE public.email_thread
              SET thread_status = 'redacting'
            WHERE id = $1
            RETURNING thread_status`,
          [f.threadA],
        );
        expect(res.rowCount).toBe(1);
        expect(res.rows[0].thread_status).toBe("redacting");
      });
    });
  });

  it("tenant_admin darf UPDATE thread_status 'redacting' → 'redacted' (Happy Path)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      // Setup: Thread A auf 'redacting' setzen.
      await client.query(
        `UPDATE public.email_thread SET thread_status = 'redacting' WHERE id = $1`,
        [f.threadA],
      );
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{ thread_status: string }>(
          `UPDATE public.email_thread
              SET thread_status = 'redacted'
            WHERE id = $1
            RETURNING thread_status`,
          [f.threadA],
        );
        expect(res.rowCount).toBe(1);
        expect(res.rows[0].thread_status).toBe("redacted");
      });
    });
  });

  it("tenant_admin darf UPDATE thread_status 'redacting' → 'failed' (Crash-Pfad, L-1)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      // Setup: Thread A auf 'redacting' setzen.
      await client.query(
        `UPDATE public.email_thread SET thread_status = 'redacting' WHERE id = $1`,
        [f.threadA],
      );
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query<{ thread_status: string }>(
          `UPDATE public.email_thread
              SET thread_status = 'failed'
            WHERE id = $1
            RETURNING thread_status`,
          [f.threadA],
        );
        expect(res.rowCount).toBe(1);
        expect(res.rows[0].thread_status).toBe("failed");
      });
    });
  });

  // --- Cluster C: Default-Deny auf MT-6-Spalten (2 Cases) ---

  it("employee: SELECT redacted_body + participant_pseudonyms → 0 Rows", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await applyRedactedFixturesToAllThreads(client, f.threadA, f.threadB);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const res = await client.query<{ redacted_body: string | null }>(
          `SELECT redacted_body, participant_pseudonyms
             FROM public.email_thread
            WHERE id IN ($1, $2)`,
          [f.threadA, f.threadB],
        );
        expect(res.rowCount).toBe(0);
      });
    });
  });

  it("employee: UPDATE thread_status → 0 Rows (default-deny via RLS USING)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV9BulkEmailFixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        // RLS USING-Clause maskiert die Row vor dem UPDATE — kein WITH-CHECK-
        // Reject, sondern 0 Rows. Pattern analog der Cross-Cut-Defense fuer
        // email_message (Test L589-604).
        const res = await client.query(
          `UPDATE public.email_thread
              SET thread_status = 'failed'
            WHERE id = $1
            RETURNING id`,
          [f.threadA],
        );
        expect(res.rowCount).toBe(0);
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
