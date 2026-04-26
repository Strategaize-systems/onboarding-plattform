import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedV4Fixtures } from "./v4-fixtures";

/**
 * V4 RLS-Perimeter-Matrix (SLC-033 MT-9 Skelett, Vervollstaendigung in SLC-037 MT-7)
 * =================================================================================
 *
 * 4 Rollen (strategaize_admin, tenant_admin, tenant_member, employee)
 * x 8 Tabellen (capture_session, knowledge_unit, block_diagnosis, sop,
 *                handbook_snapshot, bridge_run, bridge_proposal,
 *                employee_invitation)
 * = 32 Pflicht-Matrix-Faelle.
 *
 * Zusaetzlich:
 *   - 8 direkte PASS-Faelle fuer R16 (employee-Sichtperimeter, capture_session
 *     + 6 no-access-Tabellen + strategaize_admin-Kontrolle).
 *   - 2 Bonus-Aktiv-Faelle (employee block_checkpoint INSERT eigene/fremde Session,
 *     employee validation_layer SELECT).
 *
 * HINWEIS
 * -------
 * Dieses Modul erfordert TEST_DATABASE_URL mit angewendeten V4-Migrationen
 * (065-073, 075). Ohne V4-Schema faellt `seedV4Fixtures` schon beim Setup.
 *
 * ERWARTUNGS-MATRIX (alle Counts beziehen sich auf die 2-Tenant-Fixtures)
 * --------------------------------------------------------------------
 * | Tabelle              | sa | ta-A   | tm-A          | emp-A         |
 * |----------------------|----|--------|---------------|---------------|
 * | capture_session      | 4  | 2 (A)  | 2 (A)         | 1 (eigene)    |
 * | knowledge_unit       | 2  | 1 (A)  | 1 (A)         | 1 (own session)|
 * | block_diagnosis      | 2  | 1 (A)  | 0 (no policy) | 0             |
 * | sop                  | 2  | 1 (A)  | 0             | 0             |
 * | handbook_snapshot    | 2  | 1 (A)  | 0             | 0             |
 * | bridge_run           | 2  | 1 (A)  | 0             | 0             |
 * | bridge_proposal      | 2  | 1 (A)  | 0             | 0             |
 * | employee_invitation  | 2  | 1 (A)  | 0             | 0             |
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
});

// ================================================================
// MATRIX (32 Pflicht-Faelle): 4 Rollen x 8 Tabellen
// SLC-037 MT-7 — Vervollstaendigung
// ================================================================

describe("V4 RLS-Matrix — capture_session", () => {
  it("strategaize_admin sieht alle 4 capture_sessions cross-tenant", async () => {
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

  it("tenant_admin sieht 2 capture_sessions im eigenen Tenant, 0 cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.capture_session
            WHERE id IN ($1, $2)`,
          [f.sessionAdminA, f.sessionEmployeeA]
        );
        expect(own.rows[0].c).toBe("2");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.capture_session
            WHERE id IN ($1, $2)`,
          [f.sessionAdminB, f.sessionEmployeeB]
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_member sieht 2 capture_sessions im eigenen Tenant (read-only), 0 cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.capture_session
            WHERE id IN ($1, $2)`,
          [f.sessionAdminA, f.sessionEmployeeA]
        );
        expect(own.rows[0].c).toBe("2");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.capture_session
            WHERE id IN ($1, $2)`,
          [f.sessionAdminB, f.sessionEmployeeB]
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("employee sieht NUR die eigene capture_session, fremder owner + cross-tenant blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.capture_session
            WHERE id = $1`,
          [f.sessionEmployeeA]
        );
        expect(own.rows[0].c).toBe("1");

        const others = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.capture_session
            WHERE id IN ($1, $2, $3)`,
          [f.sessionAdminA, f.sessionAdminB, f.sessionEmployeeB]
        );
        expect(others.rows[0].c).toBe("0");
      });
    });
  });
});

describe("V4 RLS-Matrix — knowledge_unit", () => {
  it("strategaize_admin sieht beide knowledge_units cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.knowledge_unit
            WHERE id IN ($1, $2)`,
          [f.knowledgeUnitA, f.knowledgeUnitB]
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht eigene knowledge_unit, fremde blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.knowledge_unit WHERE id = $1`,
          [f.knowledgeUnitA]
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.knowledge_unit WHERE id = $1`,
          [f.knowledgeUnitB]
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_member sieht eigene knowledge_unit (read), fremde blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.knowledge_unit WHERE id = $1`,
          [f.knowledgeUnitA]
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.knowledge_unit WHERE id = $1`,
          [f.knowledgeUnitB]
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("employee sieht knowledge_unit NUR zur eigenen Session, andere blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.knowledge_unit WHERE id = $1`,
          [f.knowledgeUnitA]
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.knowledge_unit WHERE id = $1`,
          [f.knowledgeUnitB]
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });
});

describe("V4 RLS-Matrix — block_diagnosis", () => {
  it("strategaize_admin sieht beide block_diagnosis cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.block_diagnosis
            WHERE id IN ($1, $2)`,
          [f.blockDiagnosisA, f.blockDiagnosisB]
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht eigene block_diagnosis (read), fremde blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.block_diagnosis WHERE id = $1`,
          [f.blockDiagnosisA]
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.block_diagnosis WHERE id = $1`,
          [f.blockDiagnosisB]
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_member sieht KEINE block_diagnosis (no member-policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.block_diagnosis
            WHERE id IN ($1, $2)`,
          [f.blockDiagnosisA, f.blockDiagnosisB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });

  it("employee sieht KEINE block_diagnosis (no employee-policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.block_diagnosis
            WHERE id IN ($1, $2)`,
          [f.blockDiagnosisA, f.blockDiagnosisB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });
});

describe("V4 RLS-Matrix — sop", () => {
  it("strategaize_admin sieht beide sops cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.sop WHERE id IN ($1, $2)`,
          [f.sopA, f.sopB]
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht eigene sop (read), fremde blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.sop WHERE id = $1`,
          [f.sopA]
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.sop WHERE id = $1`,
          [f.sopB]
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_member sieht KEINE sop (no member-policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.sop WHERE id IN ($1, $2)`,
          [f.sopA, f.sopB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });

  it("employee sieht KEINE sop (no employee-policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.sop WHERE id IN ($1, $2)`,
          [f.sopA, f.sopB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });
});

describe("V4 RLS-Matrix — handbook_snapshot", () => {
  it("strategaize_admin sieht beide handbook_snapshots cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.handbook_snapshot WHERE id IN ($1, $2)`,
          [f.handbookSnapshotA, f.handbookSnapshotB]
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht eigene handbook_snapshot (RW), fremde blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.handbook_snapshot WHERE id = $1`,
          [f.handbookSnapshotA]
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.handbook_snapshot WHERE id = $1`,
          [f.handbookSnapshotB]
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_member sieht KEINE handbook_snapshot (no member-policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.handbook_snapshot WHERE id IN ($1, $2)`,
          [f.handbookSnapshotA, f.handbookSnapshotB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });

  it("employee sieht KEINE handbook_snapshot (no employee-policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.handbook_snapshot WHERE id IN ($1, $2)`,
          [f.handbookSnapshotA, f.handbookSnapshotB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });
});

describe("V4 RLS-Matrix — bridge_run", () => {
  it("strategaize_admin sieht beide bridge_runs cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.bridge_run WHERE id IN ($1, $2)`,
          [f.bridgeRunA, f.bridgeRunB]
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht eigene bridge_run (RW), fremde blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.bridge_run WHERE id = $1`,
          [f.bridgeRunA]
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.bridge_run WHERE id = $1`,
          [f.bridgeRunB]
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_member sieht KEINE bridge_run (no member-policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.bridge_run WHERE id IN ($1, $2)`,
          [f.bridgeRunA, f.bridgeRunB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });

  it("employee sieht KEINE bridge_run (no employee-policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.bridge_run WHERE id IN ($1, $2)`,
          [f.bridgeRunA, f.bridgeRunB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });
});

describe("V4 RLS-Matrix — bridge_proposal", () => {
  it("strategaize_admin sieht beide bridge_proposals cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.bridge_proposal WHERE id IN ($1, $2)`,
          [f.bridgeProposalA, f.bridgeProposalB]
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht eigene bridge_proposal (RW), fremde blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.bridge_proposal WHERE id = $1`,
          [f.bridgeProposalA]
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.bridge_proposal WHERE id = $1`,
          [f.bridgeProposalB]
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_member sieht KEINE bridge_proposal (no member-policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.bridge_proposal WHERE id IN ($1, $2)`,
          [f.bridgeProposalA, f.bridgeProposalB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });

  it("employee sieht KEINE bridge_proposal (no employee-policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.bridge_proposal WHERE id IN ($1, $2)`,
          [f.bridgeProposalA, f.bridgeProposalB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });
});

describe("V4 RLS-Matrix — employee_invitation", () => {
  it("strategaize_admin sieht beide employee_invitations cross-tenant", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.strategaizeAdminUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.employee_invitation WHERE id IN ($1, $2)`,
          [f.employeeInvitationA, f.employeeInvitationB]
        );
        expect(res.rows[0].c).toBe("2");
      });
    });
  });

  it("tenant_admin sieht eigene employee_invitation (RW), fremde blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.employee_invitation WHERE id = $1`,
          [f.employeeInvitationA]
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.employee_invitation WHERE id = $1`,
          [f.employeeInvitationB]
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });

  it("tenant_member sieht KEINE employee_invitation (no member-policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.tenantMemberAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.employee_invitation WHERE id IN ($1, $2)`,
          [f.employeeInvitationA, f.employeeInvitationB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });

  it("employee sieht KEINE employee_invitation (no employee-policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const res = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.employee_invitation WHERE id IN ($1, $2)`,
          [f.employeeInvitationA, f.employeeInvitationB]
        );
        expect(res.rows[0].c).toBe("0");
      });
    });
  });
});

// ================================================================
// BONUS: Aktiv-Tests (employee block_checkpoint INSERT, validation_layer SELECT)
// SLC-037 MT-7 — R16 Aktiv-Faelle
// ================================================================

describe("V4 RLS-Bonus — employee block_checkpoint INSERT", () => {
  it("employee kann block_checkpoint INSERT fuer eigene Session", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const res = await client.query<{ id: string }>(
          `INSERT INTO public.block_checkpoint
             (tenant_id, capture_session_id, block_key, checkpoint_type,
              content, content_hash, created_by)
           VALUES ($1, $2, 'A', 'questionnaire_submit', '{}'::jsonb, $3, $4)
           RETURNING id`,
          [
            f.tenantA,
            f.sessionEmployeeA,
            "hash-emp-own-" + Math.random().toString(36).slice(2, 10),
            f.employeeAUserId,
          ]
        );
        expect(res.rows[0].id).toBeTruthy();
      });
    });
  });

  it("employee kann KEIN block_checkpoint INSERT fuer FREMDE Session (Permission-Error)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        // SAVEPOINT-Pattern (IMP-044): erwartete RLS-Rejection bringt die Tx
        // sonst in Abort-Status, wodurch RESET ROLE im finally crasht.
        await client.query("SAVEPOINT before_foreign_insert");
        let errorMessage = "";
        try {
          await client.query(
            `INSERT INTO public.block_checkpoint
               (tenant_id, capture_session_id, block_key, checkpoint_type,
                content, content_hash, created_by)
             VALUES ($1, $2, 'A', 'questionnaire_submit', '{}'::jsonb, $3, $4)`,
            [
              f.tenantA,
              f.sessionAdminA,
              "hash-emp-foreign-" + Math.random().toString(36).slice(2, 10),
              f.employeeAUserId,
            ]
          );
        } catch (e) {
          errorMessage = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT before_foreign_insert");
        expect(errorMessage).toMatch(/row-level security|permission denied|new row violates/i);
      });
    });
  });
});

describe("V4 RLS-Bonus — employee validation_layer SELECT", () => {
  it("employee sieht validation_layer NUR zu eigenen KUs, fremde blockiert", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);
      await withJwtContext(client, f.employeeAUserId, async () => {
        const own = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.validation_layer WHERE id = $1`,
          [f.validationLayerA]
        );
        expect(own.rows[0].c).toBe("1");

        const cross = await client.query<{ c: string }>(
          `SELECT count(*)::text AS c FROM public.validation_layer WHERE id = $1`,
          [f.validationLayerB]
        );
        expect(cross.rows[0].c).toBe("0");
      });
    });
  });
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
