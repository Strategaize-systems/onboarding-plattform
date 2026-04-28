// SLC-041 MT-4 — RLS-Test-Matrix-Erweiterung fuer block_review (V4.1, MIG-028).
//
// Pflicht-Gate aus Slice-Spec AC-12: 4 Rollen × block_review = mind. 8 Test-Faelle PASS
// gegen Live-DB. Tests laufen via TEST_DATABASE_URL gegen die Coolify-Supabase-DB,
// jeder Test in einer Transaction die am Ende ge-ROLLBACK-t wird (siehe withTestDb).
//
// SAVEPOINT-Pattern fuer expected RLS-Rejections (siehe IMP-044 / coolify-test-setup.md):
// Eine RLS-Verletzung bringt die Tx in Abort-Status. Wir nehmen jeden expected-failure
// Block in ein SAVEPOINT und rollen es selektiv zurueck.

import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedV4Fixtures, type V4Fixtures } from "./v4-fixtures";
import type { Client } from "pg";

/**
 * Seed: erzeugt block_review-Eintraege fuer Tenant A und Tenant B.
 * Ruft die V4-Fixtures auf, fuegt 2 block_review-Rows hinzu (je 1 pro Tenant).
 */
async function seedBlockReviews(client: Client): Promise<{
  fixtures: V4Fixtures;
  reviewA: string;
  reviewB: string;
}> {
  const fixtures = await seedV4Fixtures(client);

  const ins = await client.query<{ id: string }>(
    `INSERT INTO public.block_review (tenant_id, capture_session_id, block_key, status)
     VALUES ($1, $2, 'A', 'pending'),
            ($3, $4, 'A', 'pending')
     RETURNING id`,
    [
      fixtures.tenantA,
      fixtures.sessionEmployeeA,
      fixtures.tenantB,
      fixtures.sessionEmployeeB,
    ],
  );
  return {
    fixtures,
    reviewA: ins.rows[0].id,
    reviewB: ins.rows[1].id,
  };
}

/**
 * Versucht eine Query, erwartet eine Rejection mit row-level-security oder
 * permission-Meldung. SAVEPOINT-Wrap damit die Tx nicht abbricht.
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

// ================================================================
// SELECT-Cases (5 Tests)
// ================================================================

describe("RLS block_review — SELECT-Matrix", () => {
  it("strategaize_admin sieht beide block_review-Rows cross-tenant", async () => {
    await withTestDb(async (client) => {
      const { fixtures, reviewA, reviewB } = await seedBlockReviews(client);
      await withJwtContext(client, fixtures.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.block_review WHERE id IN ($1, $2)`,
          [reviewA, reviewB],
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht NUR den eigenen block_review (own tenant)", async () => {
    await withTestDb(async (client) => {
      const { fixtures, reviewA } = await seedBlockReviews(client);
      await withJwtContext(client, fixtures.tenantAdminAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.block_review WHERE id = $1`,
          [reviewA],
        );
        expect(res.rows[0].c).toBe("1");
      });
    });
  });

  it("tenant_admin sieht KEINE fremden block_reviews (cross-tenant blockiert)", async () => {
    await withTestDb(async (client) => {
      const { fixtures, reviewB } = await seedBlockReviews(client);
      await withJwtContext(client, fixtures.tenantAdminAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.block_review WHERE id = $1`,
          [reviewB],
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_member sieht KEINE block_reviews (default-deny)", async () => {
    await withTestDb(async (client) => {
      const { fixtures } = await seedBlockReviews(client);
      await withJwtContext(client, fixtures.tenantMemberAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.block_review`,
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });

  it("employee sieht KEINE block_reviews (default-deny)", async () => {
    await withTestDb(async (client) => {
      const { fixtures } = await seedBlockReviews(client);
      await withJwtContext(client, fixtures.employeeAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.block_review`,
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });
});

// ================================================================
// WRITE-Cases — INSERT/UPDATE/DELETE Approval-Hoheit (4 Tests)
// ================================================================

describe("RLS block_review — Write-Matrix (Approval-Hoheit strategaize_admin)", () => {
  it("strategaize_admin darf INSERT in eigenem oder fremdem Tenant", async () => {
    await withTestDb(async (client) => {
      const { fixtures } = await seedBlockReviews(client);
      await withJwtContext(client, fixtures.strategaizeAdminUserId, async () => {
        const res = await client.query<{ id: string }>(
          `INSERT INTO public.block_review (tenant_id, capture_session_id, block_key, status)
           VALUES ($1, $2, 'NEW_BLOCK', 'approved')
           RETURNING id`,
          [fixtures.tenantA, fixtures.sessionEmployeeA],
        );
        expect(res.rows[0].id).toBeTruthy();
      });
    });
  });

  it("tenant_admin darf NICHT in eigene block_review schreiben (kein INSERT-Recht)", async () => {
    await withTestDb(async (client) => {
      const { fixtures } = await seedBlockReviews(client);
      await withJwtContext(client, fixtures.tenantAdminAUserId, async () => {
        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.block_review (tenant_id, capture_session_id, block_key, status)
           VALUES ($1, $2, 'X', 'approved')`,
          [fixtures.tenantA, fixtures.sessionEmployeeA],
        );
        expect(errMsg).toMatch(/row-level security|permission denied/i);
      });
    });
  });

  it("tenant_admin darf NICHT eigenen block_review updaten", async () => {
    await withTestDb(async (client) => {
      const { fixtures, reviewA } = await seedBlockReviews(client);
      await withJwtContext(client, fixtures.tenantAdminAUserId, async () => {
        // SELECT geht (Read-Policy), UPDATE geht nicht.
        await client.query("SAVEPOINT try_update");
        const updRes = await client.query(
          `UPDATE public.block_review SET status = 'approved' WHERE id = $1 RETURNING id`,
          [reviewA],
        );
        await client.query("ROLLBACK TO SAVEPOINT try_update");
        // Bei reinem RLS-Filter (kein Error) liefert UPDATE 0 Rows zurueck.
        expect(updRes.rowCount).toBe(0);
      });
    });
  });

  it("tenant_member darf weder lesen noch schreiben (default-deny)", async () => {
    await withTestDb(async (client) => {
      const { fixtures } = await seedBlockReviews(client);
      await withJwtContext(client, fixtures.tenantMemberAUserId, async () => {
        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.block_review (tenant_id, capture_session_id, block_key, status)
           VALUES ($1, $2, 'X', 'approved')`,
          [fixtures.tenantA, fixtures.sessionEmployeeA],
        );
        expect(errMsg).toMatch(/row-level security|permission denied/i);

        // SELECT default-deny -> 0 rows
        const selRes = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.block_review`,
        );
        expect(selRes.rows[0].c).toBe("0");
      });
    });
  });
});

// ================================================================
// Trigger-Bonus-Cases (3 Tests)
// ================================================================

describe("RLS block_review — Trigger ON INSERT capture_events (AC-4, AC-5)", () => {
  it("Trigger erstellt pending-Eintrag bei answer_submitted in employee_questionnaire-Session", async () => {
    await withTestDb(async (client) => {
      const fixtures = await seedV4Fixtures(client);

      // capture_events INSERT als tenant_member (alle authentifizierten haben INSERT-Recht)
      await withJwtContext(client, fixtures.employeeAUserId, async () => {
        await client.query(
          `INSERT INTO public.capture_events
             (session_id, tenant_id, block_key, question_id, client_event_id,
              event_type, payload, created_by)
           VALUES ($1, $2, 'XBLK', 'q1', gen_random_uuid()::text,
                   'answer_submitted', '{"value": "test"}'::jsonb, $3)`,
          [fixtures.sessionEmployeeA, fixtures.tenantA, fixtures.employeeAUserId],
        );
      });

      // Verifikation als strategaize_admin (RLS-Bypass fuer Read)
      await withJwtContext(client, fixtures.strategaizeAdminUserId, async () => {
        const res = await client.query<{ status: string; tenant_id: string }>(
          `SELECT status, tenant_id::text AS tenant_id
             FROM public.block_review
            WHERE capture_session_id = $1 AND block_key = 'XBLK'`,
          [fixtures.sessionEmployeeA],
        );
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0].status).toBe("pending");
        expect(res.rows[0].tenant_id).toBe(fixtures.tenantA);
      });
    });
  });

  it("Trigger ueberschreibt approved-Eintrag NICHT (ON CONFLICT DO NOTHING)", async () => {
    await withTestDb(async (client) => {
      const fixtures = await seedV4Fixtures(client);

      // Vorab approved-Eintrag setzen (via Superuser, simulating prior backfill)
      await client.query(
        `INSERT INTO public.block_review
           (tenant_id, capture_session_id, block_key, status, reviewed_by, reviewed_at)
         VALUES ($1, $2, 'YBLK', 'approved', $3, now())`,
        [fixtures.tenantA, fixtures.sessionEmployeeA, fixtures.strategaizeAdminUserId],
      );

      // Neuer Mitarbeiter-Submit auf YBLK - Trigger sollte NICHT zuruecksetzen
      await withJwtContext(client, fixtures.employeeAUserId, async () => {
        await client.query(
          `INSERT INTO public.capture_events
             (session_id, tenant_id, block_key, question_id, client_event_id,
              event_type, payload, created_by)
           VALUES ($1, $2, 'YBLK', 'q1', gen_random_uuid()::text,
                   'answer_submitted', '{}'::jsonb, $3)`,
          [fixtures.sessionEmployeeA, fixtures.tenantA, fixtures.employeeAUserId],
        );
      });

      const res = await client.query<{ status: string }>(
        `SELECT status FROM public.block_review
          WHERE capture_session_id = $1 AND block_key = 'YBLK'`,
        [fixtures.sessionEmployeeA],
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].status).toBe("approved"); // nicht zurueckgesetzt
    });
  });

  it("Trigger ignoriert non-employee_questionnaire-Sessions", async () => {
    await withTestDb(async (client) => {
      const fixtures = await seedV4Fixtures(client);

      // Insert in eine GF-Session (capture_mode='questionnaire', nicht employee)
      await withJwtContext(client, fixtures.tenantAdminAUserId, async () => {
        await client.query(
          `INSERT INTO public.capture_events
             (session_id, tenant_id, block_key, question_id, client_event_id,
              event_type, payload, created_by)
           VALUES ($1, $2, 'ZBLK', 'q1', gen_random_uuid()::text,
                   'answer_submitted', '{}'::jsonb, $3)`,
          [fixtures.sessionAdminA, fixtures.tenantA, fixtures.tenantAdminAUserId],
        );
      });

      const res = await client.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM public.block_review
          WHERE capture_session_id = $1 AND block_key = 'ZBLK'`,
        [fixtures.sessionAdminA],
      );
      expect(res.rows[0].c).toBe("0");
    });
  });
});
