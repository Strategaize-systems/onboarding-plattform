// V9.1 SLC-V9.1-A MT-R7 — RLS-Pen-Test-Matrix fuer email_inbound_sync_state
// (MIG-061 / Migration 116, AC-R1-7).
//
// Rollen-Matrix MIG-061 (116, Zeile 18-22):
//   - strategaize_admin: FOR ALL Cross-Tenant (admin_all) — sieht beide Tenants.
//   - tenant_admin (GF): SELECT own Tenant (read-only). KEIN INSERT/UPDATE/DELETE
//     (kein write-Policy → Writes nur via service_role/Cron).
//   - tenant_member + employee: KEIN ACCESS (kein POLICY-Eintrag → Default-Deny).
//   - service_role: FOR ALL (Cron schreibt last_uid/status) — BYPASSRLS + Policy
//     als Defense-in-Depth. Nicht ueber withJwtContext testbar; Policy-Existenz
//     ist in src/__tests__/migrations/116-v91-email-inbound-sync-state.test.ts
//     bereits verifiziert.
//
// Test-Struktur (8 Cases):
//   1. strategaize_admin SELECT cross-tenant → sieht beide sync_state-Rows
//   2. tenant_admin SELECT own + cross-tenant DENY (kombiniert)
//   3. tenant_admin INSERT → RLS-WITH-CHECK Reject (write = service_role only)
//   4. tenant_admin UPDATE own → 0 Rows (kein UPDATE-Policy, USING filtert)
//   5. tenant_member SELECT DENY + INSERT DENY (kombiniert, default-deny)
//   6. employee SELECT DENY + INSERT DENY (kombiniert, default-deny)
//   7. tenant_admin DELETE own → 0 Rows (kein DELETE-Policy, USING filtert)
//   8. strategaize_admin INSERT own-Tenant ALLOW (admin_all FOR ALL WITH CHECK)
//
// SAVEPOINT-Pattern fuer expected RLS-Rejections per .claude/rules/coolify-test-setup.md
// (IMP-044). Pattern-Reuse: src/__tests__/rls/v9-bulk-email.rls.test.ts (SLC-165 MT-6).

import { describe, it, expect } from "vitest";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedV91InboundFixtures } from "./v91-inbound-fixtures";

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
// email_inbound_sync_state — 4 Rollen + Cross-Cut-Defense
// ============================================================================

describe("V9.1 RLS email_inbound_sync_state — 4 Rollen", () => {
  it("strategaize_admin sieht beide sync_state cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV91InboundFixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_inbound_sync_state
            WHERE endpoint_id IN ($1, $2)`,
          [f.endpointA, f.endpointB],
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht eigene sync_state, cross-tenant blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV91InboundFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_inbound_sync_state
            WHERE endpoint_id = $1`,
          [f.endpointA],
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_inbound_sync_state
            WHERE endpoint_id = $1`,
          [f.endpointB],
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_admin INSERT (auch own Tenant) → RLS DENY (write = service_role only)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV91InboundFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        // endpointA2 ist FK-valid (Tenant A) + hat noch keine sync_state-Row,
        // damit der Reject sauber RLS-WITH-CHECK ist (kein PK-Konflikt).
        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_inbound_sync_state
             (endpoint_id, tenant_id, folder, last_uid, status)
           VALUES ($1, $2, 'INBOX', 5, 'idle')`,
          [f.endpointA2, f.tenantA],
        );
        expect(errMsg).toMatch(/row-level security|new row violates|permission denied/i);
      });
    });
  });

  it("tenant_admin UPDATE eigene sync_state → 0 Rows (kein UPDATE-Policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV91InboundFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        // tenant_select ist FOR SELECT — kein UPDATE/ALL-Policy macht die Row
        // fuer UPDATE sichtbar → USING filtert → 0 Rows (kein Error).
        const res = await client.query(
          `UPDATE public.email_inbound_sync_state
              SET last_uid = 999
            WHERE endpoint_id = $1
            RETURNING endpoint_id`,
          [f.endpointA],
        );
        expect(res.rowCount).toBe(0);
      });
    });
  });

  it("tenant_member: SELECT 0 + INSERT DENY (default-deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV91InboundFixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const sel = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_inbound_sync_state
            WHERE endpoint_id IN ($1, $2)`,
          [f.endpointA, f.endpointB],
        );
        expect(sel.rows[0].c).toBe("0");

        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_inbound_sync_state
             (endpoint_id, tenant_id, folder, last_uid, status)
           VALUES ($1, $2, 'INBOX', 5, 'idle')`,
          [f.endpointA2, f.tenantA],
        );
        expect(errMsg).toMatch(/row-level security|new row violates|permission denied/i);
      });
    });
  });

  it("employee: SELECT 0 + INSERT DENY (default-deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV91InboundFixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const sel = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.email_inbound_sync_state
            WHERE endpoint_id IN ($1, $2)`,
          [f.endpointA, f.endpointB],
        );
        expect(sel.rows[0].c).toBe("0");

        const errMsg = await expectRlsReject(
          client,
          `INSERT INTO public.email_inbound_sync_state
             (endpoint_id, tenant_id, folder, last_uid, status)
           VALUES ($1, $2, 'INBOX', 5, 'idle')`,
          [f.endpointA2, f.tenantA],
        );
        expect(errMsg).toMatch(/row-level security|new row violates|permission denied/i);
      });
    });
  });
});

// ============================================================================
// Cross-Cut Defense — 2 Tests
// ============================================================================

describe("V9.1 RLS email_inbound_sync_state Cross-Cut Defense (Pen-Test)", () => {
  it("tenant_admin DELETE eigene sync_state → 0 Rows (kein DELETE-Policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV91InboundFixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const res = await client.query(
          `DELETE FROM public.email_inbound_sync_state
            WHERE endpoint_id = $1
            RETURNING endpoint_id`,
          [f.endpointA],
        );
        expect(res.rowCount).toBe(0);
      });
    });
  });

  it("strategaize_admin darf INSERT sync_state (admin_all FOR ALL)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV91InboundFixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        // admin_all ist FOR ALL mit WITH CHECK auf strategaize_admin → erlaubt.
        // endpointA2 (Tenant A) hat noch keine sync_state-Row.
        const res = await client.query<{ endpoint_id: string }>(
          `INSERT INTO public.email_inbound_sync_state
             (endpoint_id, tenant_id, folder, last_uid, status)
           VALUES ($1, $2, 'INBOX', 7, 'idle')
           RETURNING endpoint_id`,
          [f.endpointA2, f.tenantA],
        );
        expect(res.rows[0].endpoint_id).toBe(f.endpointA2);
      });
    });
  });
});
