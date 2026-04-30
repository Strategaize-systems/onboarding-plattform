// SLC-046 MT-4 — V4.2 Foundation RLS-Test-Matrix
//
// Pflicht-Gate AC-12: 4-Rollen-Matrix (strategaize_admin, tenant_admin, tenant_member, employee)
// fuer reminder_log + user_settings. 8 Tests pro Tabelle = 16 total. Gegen Live-DB.
//
// reminder_log (alle authenticated-Rollen): GRANT SELECT only — INSERT/UPDATE/DELETE
// nur via service_role (Cron). Daher INSERT fuer alle 4 authenticated-Rollen DENY.
//   strategaize_admin: SELECT cross-tenant ALLOW (RLS-Policy), INSERT DENY (kein GRANT)
//   tenant_admin:      SELECT eigener Tenant ALLOW + cross-tenant DENY, INSERT DENY
//   tenant_member:     SELECT DENY (Default-Deny), INSERT DENY
//   employee:          SELECT DENY (Default-Deny), INSERT DENY
//
// user_settings:
//   strategaize_admin: SELECT cross-user ALLOW, INSERT ALLOW
//   tenant_admin:      SELECT eigener Eintrag ALLOW + fremder Eintrag DENY, UPDATE DENY auf fremden
//   tenant_member:     SELECT eigener Eintrag ALLOW, UPDATE eigener Eintrag ALLOW
//   employee:          SELECT eigener Eintrag ALLOW, UPDATE eigener Eintrag ALLOW
//
// SAVEPOINT-Pattern fuer expected RLS-Rejections (rules/coolify-test-setup.md).

import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedV4Fixtures } from "../rls/v4-fixtures";

// ============================================================
// Helper: Insert reminder_log row als Superuser (Setup fuer SELECT-Tests)
// ============================================================
async function seedReminderLog(
  client: import("pg").Client,
  tenantId: string,
  employeeUserId: string
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO public.reminder_log
       (tenant_id, employee_user_id, reminder_stage, sent_date, email_to, status)
     VALUES ($1, $2, 'stage1', current_date, 'test@example.com', 'sent')
     RETURNING id`,
    [tenantId, employeeUserId]
  );
  return res.rows[0].id;
}

// ============================================================
// reminder_log: 4 Rollen × {SELECT, INSERT}
// ============================================================
describe("V4.2 reminder_log RLS-Matrix (8 Faelle)", () => {
  it("strategaize_admin: SELECT cross-tenant ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await seedReminderLog(client, f.tenantA, f.employeeAUserId);
      await seedReminderLog(client, f.tenantB, f.employeeBUserId);

      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const r = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.reminder_log
           WHERE tenant_id IN ($1, $2)
           ORDER BY tenant_id`,
          [f.tenantA, f.tenantB]
        );
        expect(r.rowCount).toBe(2);
      });
    });
  });

  it("strategaize_admin: INSERT DENY (kein GRANT fuer authenticated; INSERT nur via service_role)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        await client.query(`SAVEPOINT try_insert`);
        let errorMessage: string | null = null;
        try {
          await client.query(
            `INSERT INTO public.reminder_log
               (tenant_id, employee_user_id, reminder_stage, sent_date, email_to, status)
             VALUES ($1, $2, 'stage2', current_date, 'admin-insert@example.com', 'sent')`,
            [f.tenantA, f.employeeAUserId]
          );
        } catch (e) {
          errorMessage = (e as Error).message;
        }
        await client.query(`ROLLBACK TO SAVEPOINT try_insert`);
        expect(errorMessage).not.toBeNull();
        expect(errorMessage!).toMatch(/permission denied|row-level security|violates/i);
      });
    });
  });

  it("tenant_admin: SELECT eigener Tenant ALLOW + cross-tenant DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await seedReminderLog(client, f.tenantA, f.employeeAUserId);
      await seedReminderLog(client, f.tenantB, f.employeeBUserId);

      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const r = await client.query<{ tenant_id: string }>(
          `SELECT tenant_id FROM public.reminder_log
           WHERE tenant_id IN ($1, $2)`,
          [f.tenantA, f.tenantB]
        );
        // Sieht nur Tenant A wegen RLS
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].tenant_id).toBe(f.tenantA);
      });
    });
  });

  it("tenant_admin: INSERT DENY (auch eigener Tenant)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        await client.query(`SAVEPOINT try_insert`);
        let errorMessage: string | null = null;
        try {
          await client.query(
            `INSERT INTO public.reminder_log
               (tenant_id, employee_user_id, reminder_stage, sent_date, email_to, status)
             VALUES ($1, $2, 'stage1', current_date, 'try@example.com', 'sent')`,
            [f.tenantA, f.employeeAUserId]
          );
        } catch (e) {
          errorMessage = (e as Error).message;
        }
        await client.query(`ROLLBACK TO SAVEPOINT try_insert`);
        expect(errorMessage).not.toBeNull();
        expect(errorMessage!).toMatch(/row-level security|violates|permission/i);
      });
    });
  });

  it("tenant_member: SELECT DENY (RLS Default-Deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await seedReminderLog(client, f.tenantA, f.employeeAUserId);

      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const r = await client.query(
          `SELECT id FROM public.reminder_log WHERE tenant_id = $1`,
          [f.tenantA]
        );
        // Default-Deny: keine Policy fuer tenant_member → 0 Rows sichtbar
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("tenant_member: INSERT DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        await client.query(`SAVEPOINT try_insert`);
        let errorMessage: string | null = null;
        try {
          await client.query(
            `INSERT INTO public.reminder_log
               (tenant_id, employee_user_id, reminder_stage, sent_date, email_to, status)
             VALUES ($1, $2, 'stage1', current_date, 'try@example.com', 'sent')`,
            [f.tenantA, f.employeeAUserId]
          );
        } catch (e) {
          errorMessage = (e as Error).message;
        }
        await client.query(`ROLLBACK TO SAVEPOINT try_insert`);
        expect(errorMessage).not.toBeNull();
        expect(errorMessage!).toMatch(/row-level security|violates|permission/i);
      });
    });
  });

  it("employee: SELECT DENY (RLS Default-Deny)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await seedReminderLog(client, f.tenantA, f.employeeAUserId);

      await withJwtContext(client, f.employeeAUserId, async () => {
        const r = await client.query(
          `SELECT id FROM public.reminder_log WHERE tenant_id = $1`,
          [f.tenantA]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("employee: INSERT DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.employeeAUserId, async () => {
        await client.query(`SAVEPOINT try_insert`);
        let errorMessage: string | null = null;
        try {
          await client.query(
            `INSERT INTO public.reminder_log
               (tenant_id, employee_user_id, reminder_stage, sent_date, email_to, status)
             VALUES ($1, $2, 'stage1', current_date, 'try@example.com', 'sent')`,
            [f.tenantA, f.employeeAUserId]
          );
        } catch (e) {
          errorMessage = (e as Error).message;
        }
        await client.query(`ROLLBACK TO SAVEPOINT try_insert`);
        expect(errorMessage).not.toBeNull();
        expect(errorMessage!).toMatch(/row-level security|violates|permission/i);
      });
    });
  });
});

// ============================================================
// user_settings: 4 Rollen × {SELECT, UPDATE} (INSERT geht nur via Trigger / service_role)
// ============================================================
describe("V4.2 user_settings RLS-Matrix (8 Faelle)", () => {
  it("strategaize_admin: SELECT cross-user ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const r = await client.query<{ user_id: string }>(
          `SELECT user_id FROM public.user_settings
           WHERE user_id IN ($1, $2, $3)
           ORDER BY user_id`,
          [f.tenantAdminAUserId, f.tenantAdminBUserId, f.employeeAUserId]
        );
        // Auto-Trigger erzeugt user_settings fuer jeden auth.users-INSERT
        expect(r.rowCount).toBe(3);
      });
    });
  });

  it("strategaize_admin: UPDATE fremder User ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const r = await client.query<{ user_id: string }>(
          `UPDATE public.user_settings
              SET reminders_opt_out = true
            WHERE user_id = $1
            RETURNING user_id`,
          [f.employeeAUserId]
        );
        expect(r.rowCount).toBe(1);
      });
    });
  });

  it("tenant_admin: SELECT eigener Eintrag ALLOW + fremder Eintrag DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        // Eigener Eintrag sichtbar
        const own = await client.query(
          `SELECT user_id FROM public.user_settings WHERE user_id = $1`,
          [f.tenantAdminAUserId]
        );
        expect(own.rowCount).toBe(1);

        // Fremder Eintrag (Tenant B) NICHT sichtbar
        const foreign = await client.query(
          `SELECT user_id FROM public.user_settings WHERE user_id = $1`,
          [f.tenantAdminBUserId]
        );
        expect(foreign.rowCount).toBe(0);
      });
    });
  });

  it("tenant_admin: UPDATE fremder Eintrag DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const r = await client.query(
          `UPDATE public.user_settings
              SET reminders_opt_out = true
            WHERE user_id = $1
            RETURNING user_id`,
          [f.tenantAdminBUserId]
        );
        // RLS-Filter macht WHERE-Match unmoeglich → rowCount = 0 (kein Error, aber kein Update)
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("tenant_member: SELECT eigener Eintrag ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const r = await client.query(
          `SELECT user_id, reminders_opt_out
             FROM public.user_settings
            WHERE user_id = $1`,
          [f.tenantMemberAUserId]
        );
        expect(r.rowCount).toBe(1);
      });
    });
  });

  it("tenant_member: UPDATE eigener Eintrag ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const r = await client.query<{ user_id: string }>(
          `UPDATE public.user_settings
              SET reminders_opt_out = true
            WHERE user_id = $1
            RETURNING user_id, reminders_opt_out`,
          [f.tenantMemberAUserId]
        );
        expect(r.rowCount).toBe(1);
      });
    });
  });

  it("employee: SELECT eigener Eintrag ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.employeeAUserId, async () => {
        const r = await client.query(
          `SELECT user_id FROM public.user_settings WHERE user_id = $1`,
          [f.employeeAUserId]
        );
        expect(r.rowCount).toBe(1);
      });
    });
  });

  it("employee: UPDATE eigener Eintrag ALLOW (Opt-Out)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.employeeAUserId, async () => {
        const r = await client.query<{ reminders_opt_out: boolean }>(
          `UPDATE public.user_settings
              SET reminders_opt_out = true
            WHERE user_id = $1
            RETURNING reminders_opt_out`,
          [f.employeeAUserId]
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].reminders_opt_out).toBe(true);
      });
    });
  });
});
