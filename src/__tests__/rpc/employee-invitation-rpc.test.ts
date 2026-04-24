import { describe, it, expect } from "vitest";
import type { Client, QueryResult } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedV4Fixtures, type V4Fixtures } from "../rls/v4-fixtures";

/**
 * SLC-034 MT-1 — Migration 072: rpc_create_employee_invitation,
 * rpc_revoke_employee_invitation, rpc_accept_employee_invitation_finalize.
 *
 * TDD-Strikt (SaaS-Mandat). Jeder Testfall beschreibt eine konkrete
 * Sicherheits- oder Lifecycle-Garantie.
 *
 * Voraussetzung: TEST_DATABASE_URL mit Migrationen 065-072 angewendet.
 */

// Helper: fuehrt eine Query in einem JWT-Context aus und gibt das Ergebnis zurueck.
// withJwtContext selbst gibt Promise<void> zurueck — wir nutzen eine Out-Variable.
async function queryAs<T extends Record<string, unknown>>(
  client: Client,
  userId: string,
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  let result!: QueryResult<T>;
  await withJwtContext(client, userId, async () => {
    result = await client.query<T>(sql, params);
  });
  return result;
}

async function createInvitationAs(
  client: Client,
  userId: string,
  email: string,
  displayName: string | null = null,
  roleHint: string | null = null
): Promise<string> {
  const res = await queryAs<{ result: Record<string, string> }>(
    client,
    userId,
    `SELECT public.rpc_create_employee_invitation($1, $2, $3) AS result`,
    [email, displayName, roleHint]
  );
  const r = res.rows[0].result;
  if (!r.invitation_id) {
    throw new Error(`setup failed: ${JSON.stringify(r)}`);
  }
  return r.invitation_id;
}

describe("rpc_create_employee_invitation", () => {
  it("tenant_admin erzeugt pending invitation mit 64-char hex-Token", async () => {
    await withTestDb(async (client) => {
      const f: V4Fixtures = await seedV4Fixtures(client);

      const res = await queryAs<{ result: Record<string, string> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_create_employee_invitation($1, $2, $3) AS result`,
        ["new.employee@tenant-a.test", "Max Mustermann", "Operations Manager"]
      );

      const result = res.rows[0].result;
      expect(result.invitation_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.invitation_token).toMatch(/^[0-9a-f]{64}$/);

      const check = await client.query<{
        tenant_id: string;
        email: string;
        display_name: string;
        role_hint: string;
        status: string;
        expires_at: string;
        invited_by_user_id: string;
      }>(
        `SELECT tenant_id, email, display_name, role_hint, status, expires_at, invited_by_user_id
           FROM public.employee_invitation WHERE id = $1`,
        [result.invitation_id]
      );
      expect(check.rowCount).toBe(1);
      expect(check.rows[0].tenant_id).toBe(f.tenantA);
      expect(check.rows[0].email).toBe("new.employee@tenant-a.test");
      expect(check.rows[0].display_name).toBe("Max Mustermann");
      expect(check.rows[0].role_hint).toBe("Operations Manager");
      expect(check.rows[0].status).toBe("pending");
      expect(check.rows[0].invited_by_user_id).toBe(f.tenantAdminAUserId);
      const expiresDelta = new Date(check.rows[0].expires_at).getTime() - Date.now();
      expect(expiresDelta).toBeGreaterThan(13 * 24 * 3600_000);
      expect(expiresDelta).toBeLessThan(15 * 24 * 3600_000);
    });
  });

  it("tenant_member wird abgelehnt (forbidden)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantMemberAUserId,
        `SELECT public.rpc_create_employee_invitation($1, NULL, NULL) AS result`,
        ["blocked@tenant-a.test"]
      );

      expect(res.rows[0].result).toEqual({ error: "forbidden" });
    });
  });

  it("employee wird abgelehnt (forbidden)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.employeeAUserId,
        `SELECT public.rpc_create_employee_invitation($1, NULL, NULL) AS result`,
        ["blocked@tenant-a.test"]
      );

      expect(res.rows[0].result).toEqual({ error: "forbidden" });
    });
  });

  it("zweite pending invitation mit gleicher email fuer gleichen Tenant -> duplicate_pending_invitation", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const first = await queryAs<{ result: Record<string, string> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_create_employee_invitation($1, NULL, NULL) AS result`,
        ["duplicate@tenant-a.test"]
      );
      expect(first.rows[0].result.invitation_id).toBeTruthy();

      const second = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_create_employee_invitation($1, NULL, NULL) AS result`,
        ["duplicate@tenant-a.test"]
      );
      expect(second.rows[0].result).toEqual({ error: "duplicate_pending_invitation" });
    });
  });

  it("leere email wird abgelehnt", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const res = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_create_employee_invitation($1, NULL, NULL) AS result`,
        [""]
      );

      expect(res.rows[0].result).toEqual({ error: "email_required" });
    });
  });
});

describe("rpc_revoke_employee_invitation", () => {
  it("tenant_admin revoked eigene pending invitation", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const invId = await createInvitationAs(client, f.tenantAdminAUserId, "to-revoke@tenant-a.test");

      const revoke = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_revoke_employee_invitation($1::uuid) AS result`,
        [invId]
      );

      expect(revoke.rows[0].result).toEqual({ revoked: true });

      const check = await client.query<{ status: string }>(
        `SELECT status FROM public.employee_invitation WHERE id = $1`,
        [invId]
      );
      expect(check.rows[0].status).toBe("revoked");
    });
  });

  it("tenant_admin darf NICHT fremde Tenant-Invitation revoken (forbidden)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const invId = await createInvitationAs(client, f.tenantAdminAUserId, "cross-tenant@tenant-a.test");

      const revoke = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantAdminBUserId,
        `SELECT public.rpc_revoke_employee_invitation($1::uuid) AS result`,
        [invId]
      );

      expect(revoke.rows[0].result).toEqual({ error: "forbidden" });

      const check = await client.query<{ status: string }>(
        `SELECT status FROM public.employee_invitation WHERE id = $1`,
        [invId]
      );
      expect(check.rows[0].status).toBe("pending");
    });
  });

  it("zweites revoke ist idempotent", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const invId = await createInvitationAs(client, f.tenantAdminAUserId, "idem@tenant-a.test");

      await queryAs(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_revoke_employee_invitation($1::uuid)`,
        [invId]
      );

      const second = await queryAs<{ result: Record<string, unknown> }>(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_revoke_employee_invitation($1::uuid) AS result`,
        [invId]
      );

      expect(second.rows[0].result).toEqual({ revoked: true, already: true });
    });
  });
});

describe("rpc_accept_employee_invitation_finalize", () => {
  it("happy path: pending + gueltig -> status=accepted, accepted_user_id gesetzt", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const invId = await createInvitationAs(client, f.tenantAdminAUserId, "finalize-happy@tenant-a.test");

      const res = await client.query<{ result: Record<string, unknown> }>(
        `SELECT public.rpc_accept_employee_invitation_finalize($1::uuid, $2::uuid) AS result`,
        [invId, f.employeeAUserId]
      );

      expect(res.rows[0].result).toEqual({ finalized: true });

      const check = await client.query<{
        status: string;
        accepted_user_id: string;
        accepted_at: string | null;
      }>(
        `SELECT status, accepted_user_id, accepted_at
           FROM public.employee_invitation WHERE id = $1`,
        [invId]
      );
      expect(check.rows[0].status).toBe("accepted");
      expect(check.rows[0].accepted_user_id).toBe(f.employeeAUserId);
      expect(check.rows[0].accepted_at).not.toBeNull();
    });
  });

  it("zweiter finalize mit SELBER user_id -> idempotent {finalized:true, already:true}", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const invId = await createInvitationAs(client, f.tenantAdminAUserId, "finalize-idem@tenant-a.test");

      await client.query(
        `SELECT public.rpc_accept_employee_invitation_finalize($1::uuid, $2::uuid)`,
        [invId, f.employeeAUserId]
      );
      const second = await client.query<{ result: Record<string, unknown> }>(
        `SELECT public.rpc_accept_employee_invitation_finalize($1::uuid, $2::uuid) AS result`,
        [invId, f.employeeAUserId]
      );

      expect(second.rows[0].result).toEqual({ finalized: true, already: true });
    });
  });

  it("zweiter finalize mit ANDERER user_id -> already_accepted_by_other", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const invId = await createInvitationAs(client, f.tenantAdminAUserId, "finalize-other@tenant-a.test");

      await client.query(
        `SELECT public.rpc_accept_employee_invitation_finalize($1::uuid, $2::uuid)`,
        [invId, f.employeeAUserId]
      );
      const second = await client.query<{ result: Record<string, unknown> }>(
        `SELECT public.rpc_accept_employee_invitation_finalize($1::uuid, $2::uuid) AS result`,
        [invId, f.employeeBUserId]
      );

      expect(second.rows[0].result).toEqual({ error: "already_accepted_by_other" });
    });
  });

  it("revoked invitation -> error=revoked", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const invId = await createInvitationAs(client, f.tenantAdminAUserId, "finalize-revoked@tenant-a.test");

      await queryAs(
        client,
        f.tenantAdminAUserId,
        `SELECT public.rpc_revoke_employee_invitation($1::uuid)`,
        [invId]
      );

      const res = await client.query<{ result: Record<string, unknown> }>(
        `SELECT public.rpc_accept_employee_invitation_finalize($1::uuid, $2::uuid) AS result`,
        [invId, f.employeeAUserId]
      );

      expect(res.rows[0].result).toEqual({ error: "revoked" });
    });
  });

  it("abgelaufene invitation (expires_at < now) -> error=expired", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      const invId = await createInvitationAs(client, f.tenantAdminAUserId, "finalize-expired@tenant-a.test");

      await client.query(
        `UPDATE public.employee_invitation SET expires_at = now() - interval '1 day' WHERE id = $1`,
        [invId]
      );

      const res = await client.query<{ result: Record<string, unknown> }>(
        `SELECT public.rpc_accept_employee_invitation_finalize($1::uuid, $2::uuid) AS result`,
        [invId, f.employeeAUserId]
      );

      expect(res.rows[0].result).toEqual({ error: "expired" });
    });
  });

  it("unbekannte invitation_id -> error=invitation_not_found", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      const res = await client.query<{ result: Record<string, unknown> }>(
        `SELECT public.rpc_accept_employee_invitation_finalize($1::uuid, $2::uuid) AS result`,
        ["00000000-0000-0000-0000-000000000000", f.employeeAUserId]
      );

      expect(res.rows[0].result).toEqual({ error: "invitation_not_found" });
    });
  });
});
