import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedV4Fixtures } from "./v4-fixtures";

/**
 * V4 RLS-Perimeter-Matrix (SLC-033 MT-9 Skelett, Vervollstaendigung in SLC-037)
 * =============================================================================
 *
 * 4 Rollen (strategaize_admin, tenant_admin, tenant_member, employee)
 * x 8 Tabellen (capture_session, block_checkpoint, knowledge_unit, validation_layer,
 *                block_diagnosis, sop, handbook_snapshot,
 *                bridge_run, bridge_proposal, employee_invitation)
 * = 32 Pflicht-Matrix-Faelle (hier als test.todo skizziert).
 *
 * Zusaetzlich: 8 direkte Pflicht-PASS-Faelle fuer R16 (employee-Sichtperimeter).
 * Diese sind als `it(...)` mit echten Assertions implementiert, damit das Skelett
 * bereits jetzt ein belastbares Sicherheitsnetz spannt.
 *
 * Vollstaendige Ausformulierung (RW-Verhalten, CRUD-Matrix, Cross-Tenant-Tests):
 * SLC-037 (Employee Capture-UI + Sicht-Perimeter).
 *
 * HINWEIS
 * -------
 * Dieses Modul erfordert TEST_DATABASE_URL mit angewendeten V4-Migrationen
 * (065-071, 075). Ohne V4-Schema faellt `seedV4Fixtures` schon beim Setup.
 */

const TABLES_WITHOUT_EMPLOYEE_ACCESS = [
  "block_diagnosis",
  "sop",
  "handbook_snapshot",
  "bridge_run",
  "bridge_proposal",
  "employee_invitation",
] as const;

describe("V4 RLS-Perimeter-Matrix — employee-Sichtperimeter (R16)", () => {
  // ============================================================
  // PASS-Kategorie 1: employee SELECT auf fremde capture_session -> 0 rows
  // ============================================================
  it("employee sieht KEINE fremde capture_session (eigener Tenant, anderer owner)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.capture_session WHERE id = $1`,
          [f.sessionAdminA]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });

  it("employee sieht KEINE capture_session eines anderen Tenants", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.capture_session WHERE id = $1`,
          [f.sessionEmployeeB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });

  it("employee sieht EIGENE capture_session (owner_user_id = auth.uid())", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.capture_session WHERE id = $1`,
          [f.sessionEmployeeA]
        );
        expect(res.rows[0].c).toBe("1");
      });
    });
  });

  // ============================================================
  // PASS-Kategorie 2: employee SELECT auf tabellen-ohne-employee-policy -> 0 rows
  // ============================================================
  for (const table of TABLES_WITHOUT_EMPLOYEE_ACCESS) {
    it(`employee sieht NICHTS in ${table} (keine employee-Policy, RLS default-deny)`, async () => {
      await withTestDb(async (client) => {
        const f = await seedV4Fixtures(client);
        await withJwtContext(client, f.employeeAUserId, async () => {
          const res = await client.query<{ c: string }>(
            `SELECT count(*)::text AS c FROM public.${table}`
          );
          expect(res.rows[0].c).toBe("0");
        });
      });
    });
  }

  // ============================================================
  // PASS-Kategorie 3: strategaize_admin sieht alles (Kontroll-Assertion)
  // ============================================================
  it("strategaize_admin sieht alle capture_sessions tenant-uebergreifend", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.capture_session
            WHERE id IN ($1, $2, $3, $4)`,
          [f.sessionAdminA, f.sessionAdminB, f.sessionEmployeeA, f.sessionEmployeeB]
        );
        expect(res.rows[0].c).toBe("4");
      });
    });
  });

  // ============================================================
  // MATRIX-SKELETT (32 Pflicht-Faelle = 4 Rollen x 8 Tabellen)
  // Tabellen laut SLC-033: capture_session, knowledge_unit, block_diagnosis,
  //                         sop, handbook_snapshot, bridge_run, bridge_proposal,
  //                         employee_invitation. Vervollstaendigung in SLC-037.
  // Die 8 direkten PASS-Faelle oben decken den employee-Sichtperimeter bereits
  // jetzt ab (capture_session + 6 "no-access"-Tabellen + strategaize_admin).
  // ============================================================

  // capture_session (4)
  it.todo("matrix: strategaize_admin — capture_session cross-tenant R/W");
  it.todo("matrix: tenant_admin — capture_session eigener Tenant R/W, fremder: 0 rows");
  it.todo("matrix: tenant_member — capture_session eigener Tenant read, kein write");
  it.todo("matrix: employee — capture_session update eigener session, fremde blockiert");

  // knowledge_unit (4)
  it.todo("matrix: strategaize_admin — knowledge_unit cross-tenant R/W");
  it.todo("matrix: tenant_admin — knowledge_unit eigener Tenant R/W");
  it.todo("matrix: tenant_member — knowledge_unit eigener Tenant read");
  it.todo("matrix: employee — knowledge_unit SELECT nur zu eigenen sessions");

  // block_diagnosis (4)
  it.todo("matrix: strategaize_admin — block_diagnosis cross-tenant R/W");
  it.todo("matrix: tenant_admin — block_diagnosis eigener Tenant R");
  it.todo("matrix: tenant_member — block_diagnosis KEIN Zugriff (per Default keine Policy)");
  it.todo("matrix: employee — block_diagnosis KEIN Zugriff (0 rows)");

  // sop (4)
  it.todo("matrix: strategaize_admin — sop cross-tenant R/W");
  it.todo("matrix: tenant_admin — sop eigener Tenant R");
  it.todo("matrix: tenant_member — sop eigener Tenant R (je nach Policy)");
  it.todo("matrix: employee — sop KEIN Zugriff");

  // handbook_snapshot (4)
  it.todo("matrix: strategaize_admin — handbook_snapshot cross-tenant R/W");
  it.todo("matrix: tenant_admin — handbook_snapshot eigener Tenant R/W");
  it.todo("matrix: tenant_member — handbook_snapshot KEIN Zugriff");
  it.todo("matrix: employee — handbook_snapshot KEIN Zugriff");

  // bridge_run (4)
  it.todo("matrix: strategaize_admin — bridge_run cross-tenant R/W");
  it.todo("matrix: tenant_admin — bridge_run eigener Tenant R/W");
  it.todo("matrix: tenant_member — bridge_run KEIN Zugriff");
  it.todo("matrix: employee — bridge_run KEIN Zugriff");

  // bridge_proposal (4)
  it.todo("matrix: strategaize_admin — bridge_proposal cross-tenant R/W");
  it.todo("matrix: tenant_admin — bridge_proposal eigener Tenant R/W");
  it.todo("matrix: tenant_member — bridge_proposal KEIN Zugriff");
  it.todo("matrix: employee — bridge_proposal KEIN Zugriff");

  // employee_invitation (4)
  it.todo("matrix: strategaize_admin — employee_invitation cross-tenant R/W");
  it.todo("matrix: tenant_admin — employee_invitation eigener Tenant R/W, cross-tenant INSERT blockiert");
  it.todo("matrix: tenant_member — employee_invitation KEIN Zugriff");
  it.todo("matrix: employee — employee_invitation KEIN Zugriff");

  // BONUS: block_checkpoint + validation_layer (nicht in Slice-8 aber R16-relevant)
  it.todo("bonus: employee — block_checkpoint INSERT fuer eigene session OK, fremde blockiert");
  it.todo("bonus: employee — validation_layer SELECT nur zu eigenen KUs");
});

describe("V4 Trigger — bridge_run_set_stale", () => {
  it("setzt juengsten completed bridge_run auf stale bei INSERT questionnaire_submit", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      // bridge_run (completed) fuer sessionEmployeeA anlegen
      const bridgeRunInsert = await client.query<{ id: string }>(
        `INSERT INTO public.bridge_run
           (tenant_id, capture_session_id, template_id, template_version, status,
            triggered_by_user_id, created_at, completed_at)
         VALUES ($1, $2, $3, $4, 'completed', $5, now() - interval '1 minute', now() - interval '30 seconds')
         RETURNING id`,
        [f.tenantA, f.sessionEmployeeA, f.templateId, f.templateVersion, f.tenantAdminAUserId]
      );
      const bridgeRunId = bridgeRunInsert.rows[0].id;

      // Vor INSERT: status = 'completed'
      const before = await client.query<{ status: string }>(
        `SELECT status FROM public.bridge_run WHERE id = $1`,
        [bridgeRunId]
      );
      expect(before.rows[0].status).toBe("completed");

      // block_checkpoint mit checkpoint_type='questionnaire_submit' INSERTen
      await client.query(
        `INSERT INTO public.block_checkpoint
           (tenant_id, capture_session_id, block_key, checkpoint_type,
            content, content_hash, created_by)
         VALUES ($1, $2, 'A', 'questionnaire_submit', '{}'::jsonb, 'hash-v4-trig-' || substr(gen_random_uuid()::text, 1, 8), $3)`,
        [f.tenantA, f.sessionEmployeeA, f.employeeAUserId]
      );

      // Nach INSERT: status = 'stale'
      const after = await client.query<{ status: string }>(
        `SELECT status FROM public.bridge_run WHERE id = $1`,
        [bridgeRunId]
      );
      expect(after.rows[0].status).toBe("stale");
    });
  });
});
