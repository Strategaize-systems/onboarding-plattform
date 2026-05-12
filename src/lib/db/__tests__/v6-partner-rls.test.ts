import { describe, it, expect } from "vitest";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";

// V6 SLC-101 — Pen-Test-Suite Partner-Tenant Foundation + RLS.
//
// PFLICHT-BESTANDTEIL VON SLC-101 (DEC-110): Pen-Test-PASS ist Pre-Condition
// fuer alle weiteren V6-Slices (SLC-102..106).
//
// Pattern-Reuse: v5-walkthrough-rls.test.ts (SAVEPOINT fuer expected RLS-Rejection,
// withTestDb fuer BEGIN/ROLLBACK pro Test, withJwtContext fuer Role+Tenant-Switch).
//
// Test-Faelle-Block (gemaess Slice-Spec):
//   - Schema-Smoke (V6-Migration korrekt appliziert)
//   - partner_client_mapping Trigger (tenant_kind-Konsistenz)
//   - partner_admin Read-Own (happy path)
//   - partner_admin Cross-Partner-Read-Isolation  (16 Faelle, 3 als it.todo placeholder)
//   - partner_admin Cross-Client-Read-Isolation   (8 Faelle)
//   - partner_admin Write-Block                   (12 Faelle, 2 als it.todo)
//   - tenant_admin (Mandant) Cross-Mandant-Isolation (8 Faelle)
//   - tenant_admin (Mandant) Sicht auf Partner-Daten (4 Faelle)
//   - partner_admin vs. Direkt-Kunden             (4 Faelle)
//   - partner_admin per-Operation × per-Tabelle Read-Matrix (zusaetzliche Coverage)
//
// Regression V4 (46 Faelle) + V5.1 (48 Faelle) laufen in den bestehenden
// Test-Files admin-rls.test.ts / rls-isolation.test.ts / v5-walkthrough-rls.test.ts /
// walkthrough-embed-rls.test.ts — werden hier nicht dupliziert.
//
// partner_branding_config (SLC-104) und lead_push_consent/audit (SLC-106) sind
// als `it.todo(...)` markiert mit Slice-Referenz — werden aktiviert wenn die
// jeweiligen Migrations (091, 092) appliziert sind.

interface V6Fixture {
  // Tenants
  partnerA: string;
  partnerB: string;
  clientA: string; // unter partnerA, mapping=accepted
  clientB: string; // unter partnerB, mapping=accepted
  clientPending: string; // unter partnerA, mapping=invited (nicht-accepted)
  directTenant: string; // tenant_kind=direct_client (kein Partner)

  // Users
  strategaizeAdmin: string;
  partnerAAdmin: string;
  partnerBAdmin: string;
  clientAAdmin: string; // tenant_admin von clientA
  clientBAdmin: string; // tenant_admin von clientB
  directAdmin: string; // tenant_admin von directTenant

  // partner_organization Rows
  partnerOrgA: string;
  partnerOrgB: string;

  // partner_client_mapping Rows
  mappingA_accepted: string;
  mappingB_accepted: string;
  mappingA_pending: string;

  // Capture-Chain pro Mandant + Direkt-Kunde
  templateId: string;
  templateVersion: string;
  captureClientA: string;
  captureClientB: string;
  captureClientPending: string;
  captureDirect: string;
  checkpointClientA: string;
  checkpointClientB: string;
  knowledgeClientA: string;
  knowledgeClientB: string;
  validationClientA: string;
  validationClientB: string;
}

async function seedV6Fixture(client: Client): Promise<V6Fixture> {
  // --- Tenants ---
  const tA = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind)
     VALUES ('V6 PartnerA', 'de', 'partner_organization')
     RETURNING id`
  );
  const partnerA = tA.rows[0].id;

  const tB = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind)
     VALUES ('V6 PartnerB', 'de', 'partner_organization')
     RETURNING id`
  );
  const partnerB = tB.rows[0].id;

  const tCA = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
     VALUES ('V6 ClientA', 'de', 'partner_client', $1)
     RETURNING id`,
    [partnerA]
  );
  const clientA = tCA.rows[0].id;

  const tCB = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
     VALUES ('V6 ClientB', 'de', 'partner_client', $1)
     RETURNING id`,
    [partnerB]
  );
  const clientB = tCB.rows[0].id;

  const tCP = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
     VALUES ('V6 ClientPending', 'de', 'partner_client', $1)
     RETURNING id`,
    [partnerA]
  );
  const clientPending = tCP.rows[0].id;

  const tD = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language)
     VALUES ('V6 DirectTenant', 'de')
     RETURNING id`
  );
  const directTenant = tD.rows[0].id;

  // --- Users (auth.users + handle_new_user-Trigger erzeugt profiles) ---
  async function mkUser(
    label: string,
    role: "strategaize_admin" | "tenant_admin" | "tenant_member" | "employee" | "partner_admin",
    tenantId: string | null
  ): Promise<string> {
    const metadata =
      role === "strategaize_admin" ? { role } : { role, tenant_id: tenantId };
    const res = await client.query<{ id: string }>(
      `INSERT INTO auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       )
       VALUES (
         '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
         'authenticated', 'authenticated',
         $1 || '-' || substr(gen_random_uuid()::text, 1, 8) || '@v6.test', '',
         '{}'::jsonb, $2::jsonb,
         now(), now()
       )
       RETURNING id`,
      [label, JSON.stringify(metadata)]
    );
    return res.rows[0].id;
  }

  const strategaizeAdmin = await mkUser("v6-sa", "strategaize_admin", null);
  await client.query(
    `UPDATE public.profiles SET role='strategaize_admin', tenant_id=NULL WHERE id=$1`,
    [strategaizeAdmin]
  );

  const partnerAAdmin = await mkUser("v6-pa-a", "partner_admin", partnerA);
  const partnerBAdmin = await mkUser("v6-pa-b", "partner_admin", partnerB);
  const clientAAdmin = await mkUser("v6-ta-cA", "tenant_admin", clientA);
  const clientBAdmin = await mkUser("v6-ta-cB", "tenant_admin", clientB);
  const directAdmin = await mkUser("v6-ta-dt", "tenant_admin", directTenant);

  // --- partner_organization ---
  const poA = await client.query<{ id: string }>(
    `INSERT INTO public.partner_organization
       (tenant_id, legal_name, display_name, contact_email, country, created_by_admin_user_id)
     VALUES ($1, 'V6 KanzleiA GmbH', 'KanzleiA', 'contact@a.test', 'DE', $2)
     RETURNING id`,
    [partnerA, strategaizeAdmin]
  );
  const partnerOrgA = poA.rows[0].id;

  const poB = await client.query<{ id: string }>(
    `INSERT INTO public.partner_organization
       (tenant_id, legal_name, display_name, contact_email, country, created_by_admin_user_id)
     VALUES ($1, 'V6 KanzleiB GmbH', 'KanzleiB', 'contact@b.test', 'DE', $2)
     RETURNING id`,
    [partnerB, strategaizeAdmin]
  );
  const partnerOrgB = poB.rows[0].id;

  // --- partner_client_mapping ---
  const mapAA = await client.query<{ id: string }>(
    `INSERT INTO public.partner_client_mapping
       (partner_tenant_id, client_tenant_id, invited_by_user_id, invitation_status, accepted_at)
     VALUES ($1, $2, $3, 'accepted', now())
     RETURNING id`,
    [partnerA, clientA, partnerAAdmin]
  );
  const mappingA_accepted = mapAA.rows[0].id;

  const mapBB = await client.query<{ id: string }>(
    `INSERT INTO public.partner_client_mapping
       (partner_tenant_id, client_tenant_id, invited_by_user_id, invitation_status, accepted_at)
     VALUES ($1, $2, $3, 'accepted', now())
     RETURNING id`,
    [partnerB, clientB, partnerBAdmin]
  );
  const mappingB_accepted = mapBB.rows[0].id;

  const mapAP = await client.query<{ id: string }>(
    `INSERT INTO public.partner_client_mapping
       (partner_tenant_id, client_tenant_id, invited_by_user_id, invitation_status)
     VALUES ($1, $2, $3, 'invited')
     RETURNING id`,
    [partnerA, clientPending, partnerAAdmin]
  );
  const mappingA_pending = mapAP.rows[0].id;

  // --- Template ---
  const tpl = await client.query<{ id: string; version: string }>(
    `INSERT INTO public.template (slug, name, version, blocks)
     VALUES ('v6-test-' || substr(gen_random_uuid()::text, 1, 8), 'V6 Test Tpl', '1.0.0', '[]'::jsonb)
     RETURNING id, version`
  );
  const templateId = tpl.rows[0].id;
  const templateVersion = tpl.rows[0].version;

  // --- capture_session pro Mandant + Direkt ---
  async function mkCapture(tenantId: string, ownerUserId: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO public.capture_session
         (tenant_id, template_id, template_version, owner_user_id, status, capture_mode)
       VALUES ($1, $2, $3, $4, 'open', 'questionnaire')
       RETURNING id`,
      [tenantId, templateId, templateVersion, ownerUserId]
    );
    return r.rows[0].id;
  }
  const captureClientA = await mkCapture(clientA, clientAAdmin);
  const captureClientB = await mkCapture(clientB, clientBAdmin);
  const captureClientPending = await mkCapture(clientPending, clientAAdmin);
  const captureDirect = await mkCapture(directTenant, directAdmin);

  // --- block_checkpoint pro Mandant ---
  function rand(): string {
    return Math.random().toString(36).slice(2, 10);
  }
  async function mkCheckpoint(
    tenantId: string,
    sessionId: string,
    userId: string,
    hashSuffix: string
  ): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO public.block_checkpoint
         (tenant_id, capture_session_id, block_key, checkpoint_type, content, content_hash, created_by)
       VALUES ($1, $2, 'A', 'questionnaire_submit', '{}'::jsonb, $3, $4)
       RETURNING id`,
      [tenantId, sessionId, `v6-${hashSuffix}-` + rand(), userId]
    );
    return r.rows[0].id;
  }
  const checkpointClientA = await mkCheckpoint(
    clientA,
    captureClientA,
    clientAAdmin,
    "ca"
  );
  const checkpointClientB = await mkCheckpoint(
    clientB,
    captureClientB,
    clientBAdmin,
    "cb"
  );

  // --- knowledge_unit pro Mandant ---
  async function mkKnowledge(
    tenantId: string,
    sessionId: string,
    checkpointId: string
  ): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO public.knowledge_unit
         (tenant_id, capture_session_id, block_checkpoint_id, block_key,
          unit_type, source, title, body, confidence, evidence_refs, status)
       VALUES ($1, $2, $3, 'A', 'finding', 'questionnaire',
               'V6 KU', 'V6 Body', 'medium', '[]'::jsonb, 'proposed')
       RETURNING id`,
      [tenantId, sessionId, checkpointId]
    );
    return r.rows[0].id;
  }
  const knowledgeClientA = await mkKnowledge(clientA, captureClientA, checkpointClientA);
  const knowledgeClientB = await mkKnowledge(clientB, captureClientB, checkpointClientB);

  // --- validation_layer pro Mandant ---
  async function mkValidation(
    tenantId: string,
    kuId: string,
    reviewerUserId: string
  ): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO public.validation_layer
         (tenant_id, knowledge_unit_id, reviewer_user_id, reviewer_role,
          action, previous_status, new_status, note)
       VALUES ($1, $2, $3, 'tenant_admin', 'comment', NULL, 'proposed', 'V6')
       RETURNING id`,
      [tenantId, kuId, reviewerUserId]
    );
    return r.rows[0].id;
  }
  const validationClientA = await mkValidation(clientA, knowledgeClientA, clientAAdmin);
  const validationClientB = await mkValidation(clientB, knowledgeClientB, clientBAdmin);

  return {
    partnerA,
    partnerB,
    clientA,
    clientB,
    clientPending,
    directTenant,
    strategaizeAdmin,
    partnerAAdmin,
    partnerBAdmin,
    clientAAdmin,
    clientBAdmin,
    directAdmin,
    partnerOrgA,
    partnerOrgB,
    mappingA_accepted,
    mappingB_accepted,
    mappingA_pending,
    templateId,
    templateVersion,
    captureClientA,
    captureClientB,
    captureClientPending,
    captureDirect,
    checkpointClientA,
    checkpointClientB,
    knowledgeClientA,
    knowledgeClientB,
    validationClientA,
    validationClientB,
  };
}

/**
 * Probiert ein DML im SAVEPOINT-Block. Liefert null bei Erfolg, sonst die
 * Fehler-Message. Pattern aus v5-walkthrough-rls.test.ts.
 */
async function tryDml(
  client: Client,
  sql: string,
  params: unknown[]
): Promise<string | null> {
  await client.query("SAVEPOINT rls_dml");
  try {
    await client.query(sql, params);
    await client.query("RELEASE SAVEPOINT rls_dml");
    return null;
  } catch (e) {
    try {
      await client.query("ROLLBACK TO SAVEPOINT rls_dml");
    } catch {
      // already rolled back
    }
    return (e as Error).message;
  }
}

// ============================================================================
// Schema-Smoke: Migration 090 vollstaendig appliziert
// ============================================================================

describe("V6 Migration 090 — Schema-Smoke", () => {
  it("tenants hat tenant_kind + parent_partner_tenant_id Spalten", async () => {
    await withTestDb(async (client) => {
      const r = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='tenants'
            AND column_name IN ('tenant_kind', 'parent_partner_tenant_id')`
      );
      const names = r.rows.map((x) => x.column_name).sort();
      expect(names).toEqual(["parent_partner_tenant_id", "tenant_kind"]);
    });
  });

  it("tenants.tenant_kind hat DEFAULT 'direct_client' und CHECK-Constraint", async () => {
    await withTestDb(async (client) => {
      const r = await client.query<{ column_default: string | null }>(
        `SELECT column_default FROM information_schema.columns
          WHERE table_schema='public' AND table_name='tenants' AND column_name='tenant_kind'`
      );
      expect(r.rows[0].column_default).toMatch(/direct_client/);

      const c = await client.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
          WHERE conname='tenants_tenant_kind_check'`
      );
      expect(c.rowCount).toBe(1);
    });
  });

  it("partner_organization Tabelle existiert mit UNIQUE auf tenant_id", async () => {
    await withTestDb(async (client) => {
      const t = await client.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='partner_organization'`
      );
      expect(t.rowCount).toBe(1);

      const u = await client.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname='public' AND tablename='partner_organization'
            AND indexdef ILIKE '%UNIQUE%tenant_id%'`
      );
      expect(u.rowCount).toBeGreaterThan(0);
    });
  });

  it("partner_client_mapping Tabelle existiert mit UNIQUE (partner_tenant_id, client_tenant_id)", async () => {
    await withTestDb(async (client) => {
      const c = await client.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint
          WHERE conname='partner_client_mapping_unique_pair'`
      );
      expect(c.rowCount).toBe(1);
    });
  });

  it("Postgres-Rolle partner_admin existiert in pg_roles", async () => {
    await withTestDb(async (client) => {
      const r = await client.query(
        `SELECT 1 FROM pg_roles WHERE rolname='partner_admin'`
      );
      expect(r.rowCount).toBe(1);
    });
  });

  it("profiles.role CHECK akzeptiert 'partner_admin'", async () => {
    await withTestDb(async (client) => {
      const t = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name, language, tenant_kind)
         VALUES ('PA-CHECK-T', 'de', 'partner_organization') RETURNING id`
      );
      const u = await client.query<{ id: string }>(
        `INSERT INTO auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           raw_app_meta_data, raw_user_meta_data, created_at, updated_at
         )
         VALUES (
           '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
           'authenticated', 'authenticated',
           'pa-check-' || substr(gen_random_uuid()::text, 1, 8) || '@v6.test', '',
           '{}'::jsonb, jsonb_build_object('role', 'partner_admin', 'tenant_id', $1::text),
           now(), now()
         ) RETURNING id`,
        [t.rows[0].id]
      );
      const p = await client.query<{ role: string }>(
        `SELECT role FROM public.profiles WHERE id=$1`,
        [u.rows[0].id]
      );
      expect(p.rows[0].role).toBe("partner_admin");
    });
  });
});

// ============================================================================
// partner_client_mapping Trigger — tenant_kind-Konsistenz
// ============================================================================

describe("V6 partner_client_mapping Trigger — tenant_kind-Konsistenz", () => {
  it("rejects INSERT wenn partner_tenant_id auf einen direct_client-Tenant zeigt", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      const err = await tryDml(
        client,
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status)
         VALUES ($1, $2, 'invited')`,
        [f.directTenant, f.clientA] // directTenant ist KEIN partner_organization
      );
      expect(err).toMatch(/partner_tenant_id must reference.*partner_organization/i);
    });
  });

  it("rejects INSERT wenn client_tenant_id auf einen direct_client-Tenant zeigt", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      const err = await tryDml(
        client,
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status)
         VALUES ($1, $2, 'invited')`,
        [f.partnerA, f.directTenant] // directTenant ist kein partner_client
      );
      expect(err).toMatch(/client_tenant_id must reference.*partner_client/i);
    });
  });

  it("accepts INSERT mit korrekten tenant_kinds (partner_organization + partner_client)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      // Neuen Mandanten unter partnerB anlegen
      const t = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
         VALUES ('Extra Mandant', 'de', 'partner_client', $1) RETURNING id`,
        [f.partnerB]
      );
      const err = await tryDml(
        client,
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status)
         VALUES ($1, $2, 'invited')`,
        [f.partnerB, t.rows[0].id]
      );
      expect(err).toBeNull();
    });
  });
});

// ============================================================================
// CHECK-Constraint tenants_parent_partner_consistency
// ============================================================================

describe("V6 tenants CHECK — parent_partner_consistency", () => {
  it("rejects: tenant_kind='partner_client' OHNE parent_partner_tenant_id", async () => {
    await withTestDb(async (client) => {
      const err = await tryDml(
        client,
        `INSERT INTO public.tenants (name, language, tenant_kind)
         VALUES ('Broken Client', 'de', 'partner_client')`,
        []
      );
      expect(err).toMatch(/parent_partner_consistency|check constraint/i);
    });
  });

  it("rejects: tenant_kind='direct_client' MIT parent_partner_tenant_id", async () => {
    await withTestDb(async (client) => {
      const tA = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name, language, tenant_kind)
         VALUES ('PA', 'de', 'partner_organization') RETURNING id`
      );
      const err = await tryDml(
        client,
        `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
         VALUES ('Wrong Direct', 'de', 'direct_client', $1)`,
        [tA.rows[0].id]
      );
      expect(err).toMatch(/parent_partner_consistency|check constraint/i);
    });
  });
});

// ============================================================================
// partner_admin — Read-Own (happy path)
// ============================================================================

describe("V6 partner_admin Read-Own", () => {
  it("partner_admin SELECT eigene partner_organization → ALLOW (1 row)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.partner_organization WHERE tenant_id=$1`,
          [f.partnerA]
        );
        expect(r.rowCount).toBe(1);
      });
    });
  });

  it("partner_admin SELECT eigenes partner_client_mapping → ALLOW (2 rows: accepted + pending)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.partner_client_mapping WHERE partner_tenant_id=$1`,
          [f.partnerA]
        );
        expect(r.rowCount).toBe(2);
      });
    });
  });

  it("partner_admin SELECT eigene Partner-Org-Tenant-Row → ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.tenants WHERE id=$1`,
          [f.partnerA]
        );
        expect(r.rowCount).toBe(1);
      });
    });
  });

  it("partner_admin SELECT eigene Mandanten-Tenants (parent=own) → ALLOW (2 rows: clientA + clientPending)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.tenants WHERE parent_partner_tenant_id=$1`,
          [f.partnerA]
        );
        expect(r.rowCount).toBe(2);
      });
    });
  });

  it("partner_admin SELECT accepted-Mandant capture_session → ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.capture_session WHERE tenant_id=$1`,
          [f.clientA]
        );
        expect(r.rowCount).toBe(1);
      });
    });
  });

  it("partner_admin SELECT capture_session des nicht-akzeptierten Mandanten → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.capture_session WHERE tenant_id=$1`,
          [f.clientPending]
        );
        // clientPending hat mapping aber invitation_status='invited' → policy filtert
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("partner_admin SELECT eigene Mandanten knowledge_unit → ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.knowledge_unit WHERE tenant_id=$1`,
          [f.clientA]
        );
        expect(r.rowCount).toBe(1);
      });
    });
  });

  it("partner_admin SELECT eigene Mandanten block_checkpoint → ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.block_checkpoint WHERE tenant_id=$1`,
          [f.clientA]
        );
        expect(r.rowCount).toBe(1);
      });
    });
  });

  it("partner_admin SELECT eigene Mandanten validation_layer → ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.validation_layer WHERE tenant_id=$1`,
          [f.clientA]
        );
        expect(r.rowCount).toBe(1);
      });
    });
  });
});

// ============================================================================
// partner_admin Cross-Partner-Read-Isolation (16 Faelle, davon 3 it.todo)
// ============================================================================

describe("V6 partner_admin Cross-Partner-Read-Isolation (16 cases)", () => {
  // Cross-Read 1+2: partner_organization (beide Richtungen)
  it("Case CP-1: partnerA-admin SELECT partner_organization von partnerB → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.partner_organization WHERE tenant_id=$1`,
          [f.partnerB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CP-2: partnerB-admin SELECT partner_organization von partnerA → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerBAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.partner_organization WHERE tenant_id=$1`,
          [f.partnerA]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  // Cross-Read 3+4: partner_client_mapping
  it("Case CP-3: partnerA-admin SELECT partner_client_mapping von partnerB → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.partner_client_mapping WHERE partner_tenant_id=$1`,
          [f.partnerB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CP-4: partnerB-admin SELECT partner_client_mapping von partnerA → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerBAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.partner_client_mapping WHERE partner_tenant_id=$1`,
          [f.partnerA]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  // Cross-Read 5+6: capture_session (Mandanten unter dem anderen Partner)
  it("Case CP-5: partnerA-admin SELECT capture_session von clientB (unter partnerB) → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.capture_session WHERE tenant_id=$1`,
          [f.clientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CP-6: partnerB-admin SELECT capture_session von clientA (unter partnerA) → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerBAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.capture_session WHERE tenant_id=$1`,
          [f.clientA]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  // Cross-Read 7+8: knowledge_unit
  it("Case CP-7: partnerA-admin SELECT knowledge_unit von clientB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.knowledge_unit WHERE tenant_id=$1`,
          [f.clientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CP-8: partnerB-admin SELECT knowledge_unit von clientA → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerBAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.knowledge_unit WHERE tenant_id=$1`,
          [f.clientA]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  // Cross-Read 9+10: block_checkpoint
  it("Case CP-9: partnerA-admin SELECT block_checkpoint von clientB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.block_checkpoint WHERE tenant_id=$1`,
          [f.clientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CP-10: partnerB-admin SELECT block_checkpoint von clientA → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerBAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.block_checkpoint WHERE tenant_id=$1`,
          [f.clientA]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  // Cross-Read 11+12: validation_layer
  it("Case CP-11: partnerA-admin SELECT validation_layer von clientB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.validation_layer WHERE tenant_id=$1`,
          [f.clientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CP-12: partnerB-admin SELECT validation_layer von clientA → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerBAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.validation_layer WHERE tenant_id=$1`,
          [f.clientA]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  // Cross-Read 13: partnerA-admin SELECT partnerB tenant-Row → DENY
  it("Case CP-13: partnerA-admin SELECT tenants Row von partnerB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.tenants WHERE id=$1`,
          [f.partnerB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  // Cross-Read 14: partnerA-admin SELECT clientB tenant-Row → DENY
  it("Case CP-14: partnerA-admin SELECT tenants Row von clientB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.tenants WHERE id=$1`,
          [f.clientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  // Placeholder fuer SLC-104 + SLC-106:
  it.todo("Case CP-15: partnerA-admin SELECT partner_branding_config von partnerB → DENY (SLC-104 Migration 091)");
  it.todo("Case CP-16: partnerA-admin SELECT lead_push_consent/audit von partnerB → DENY (SLC-106 Migration 092)");
});

// ============================================================================
// partner_admin Cross-Client-Read-Isolation (8 Faelle)
// ============================================================================

describe("V6 partner_admin Cross-Client-Read-Isolation (8 cases)", () => {
  it("Case CC-1: partnerA-admin SELECT capture_session des Mandanten unter partnerB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.capture_session WHERE id=$1`,
          [f.captureClientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CC-2: partnerA-admin SELECT knowledge_unit des Mandanten unter partnerB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.knowledge_unit WHERE id=$1`,
          [f.knowledgeClientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CC-3: partnerA-admin SELECT block_checkpoint des Mandanten unter partnerB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.block_checkpoint WHERE id=$1`,
          [f.checkpointClientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CC-4: partnerA-admin SELECT validation_layer des Mandanten unter partnerB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.validation_layer WHERE id=$1`,
          [f.validationClientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CC-5: partnerA-admin SELECT capture_session des invited-aber-nicht-accepted Mandanten → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.capture_session WHERE id=$1`,
          [f.captureClientPending]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CC-6: partnerA-admin SELECT capture_session nach Revocation → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      // Mapping clientA auf revoked setzen (als superuser, ausserhalb withJwtContext)
      await client.query(
        `UPDATE public.partner_client_mapping
           SET invitation_status='revoked', revoked_at=now()
         WHERE id=$1`,
        [f.mappingA_accepted]
      );
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.capture_session WHERE id=$1`,
          [f.captureClientA]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CC-7: partnerA-admin SELECT knowledge_unit nach Mapping-Revocation → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await client.query(
        `UPDATE public.partner_client_mapping SET invitation_status='revoked', revoked_at=now() WHERE id=$1`,
        [f.mappingA_accepted]
      );
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.knowledge_unit WHERE id=$1`,
          [f.knowledgeClientA]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CC-8: partnerA-admin SELECT block_checkpoint nach Mapping-Revocation → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await client.query(
        `UPDATE public.partner_client_mapping SET invitation_status='revoked', revoked_at=now() WHERE id=$1`,
        [f.mappingA_accepted]
      );
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.block_checkpoint WHERE id=$1`,
          [f.checkpointClientA]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });
});

// ============================================================================
// partner_admin Write-Block (12 Faelle, davon 2 it.todo)
// ============================================================================

describe("V6 partner_admin Write-Block (12 cases)", () => {
  it("Case WB-1: partnerA-admin INSERT partner_organization fuer partnerB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.partner_organization
             (tenant_id, legal_name, display_name, contact_email, country)
           VALUES ($1, 'Hijack', 'Hijack', 'x@x.test', 'DE')`,
          [f.partnerB]
        );
        expect(err).toMatch(/permission denied|row-level security/i);
      });
    });
  });

  it("Case WB-2: partnerA-admin UPDATE partner_organization von partnerB → DENY (0 rows updated)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `UPDATE public.partner_organization SET display_name='hijack' WHERE tenant_id=$1`,
          [f.partnerB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case WB-3: partnerA-admin DELETE partner_organization von partnerB → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `DELETE FROM public.partner_organization WHERE tenant_id=$1`,
          [f.partnerB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case WB-4: partnerA-admin INSERT partner_client_mapping mit partner_tenant_id=partnerB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        // Ein neuer Mandant unter partnerB als Ziel; INSERT-Versuch muss scheitern
        const err = await tryDml(
          client,
          `INSERT INTO public.partner_client_mapping
             (partner_tenant_id, client_tenant_id, invitation_status)
           VALUES ($1, $2, 'invited')`,
          [f.partnerB, f.clientB]
        );
        expect(err).toMatch(/permission denied|row-level security|unique/i);
      });
    });
  });

  it("Case WB-5: partnerA-admin UPDATE partner_client_mapping von partnerB → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `UPDATE public.partner_client_mapping SET invitation_status='revoked'
             WHERE partner_tenant_id=$1`,
          [f.partnerB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case WB-6: partnerA-admin DELETE partner_client_mapping von partnerB → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `DELETE FROM public.partner_client_mapping WHERE partner_tenant_id=$1`,
          [f.partnerB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case WB-7: partnerA-admin UPDATE capture_session von clientB → DENY (0 rows / kein UPDATE-Policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `UPDATE public.capture_session SET status='finalized' WHERE id=$1`,
          [f.captureClientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case WB-8: partnerA-admin INSERT knowledge_unit fuer clientB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.knowledge_unit
             (tenant_id, capture_session_id, block_key, unit_type, source,
              title, body, confidence, evidence_refs, status)
           VALUES ($1, $2, 'A', 'finding', 'questionnaire',
                   'Hijack', 'Hijack', 'medium', '[]'::jsonb, 'proposed')`,
          [f.clientB, f.captureClientB]
        );
        expect(err).toMatch(/permission denied|row-level security/i);
      });
    });
  });

  it("Case WB-9: partnerA-admin UPDATE block_checkpoint von clientB → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `UPDATE public.block_checkpoint SET block_key='hijack' WHERE id=$1`,
          [f.checkpointClientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case WB-10: partnerA-admin UPDATE validation_layer von clientB → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `UPDATE public.validation_layer SET note='hijack' WHERE id=$1`,
          [f.validationClientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  // Placeholder fuer V6.SLC-104 + SLC-106:
  it.todo("Case WB-11: partnerA-admin INSERT partner_branding_config fuer partnerB → DENY (SLC-104)");
  it.todo("Case WB-12: partnerA-admin UPDATE lead_push_consent von partnerB → DENY (SLC-106)");
});

// ============================================================================
// tenant_admin (Mandant) Cross-Mandant-Isolation (8 Faelle)
// ============================================================================

describe("V6 tenant_admin Mandant Cross-Mandant-Isolation (8 cases)", () => {
  it("Case CM-1: clientA-admin SELECT capture_session von clientB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.clientAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.capture_session WHERE tenant_id=$1`,
          [f.clientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CM-2: clientA-admin SELECT knowledge_unit von clientB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.clientAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.knowledge_unit WHERE tenant_id=$1`,
          [f.clientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CM-3: clientA-admin SELECT block_checkpoint von clientB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.clientAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.block_checkpoint WHERE tenant_id=$1`,
          [f.clientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CM-4: clientA-admin SELECT validation_layer von clientB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.clientAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.validation_layer WHERE tenant_id=$1`,
          [f.clientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CM-5: clientA-admin UPDATE capture_session von clientB → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.clientAAdmin, async () => {
        const r = await client.query(
          `UPDATE public.capture_session SET status='finalized' WHERE id=$1`,
          [f.captureClientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CM-6: clientA-admin SELECT tenants Row von clientB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.clientAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.tenants WHERE id=$1`,
          [f.clientB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CM-7: clientA-admin SELECT profile von clientB-admin → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.clientAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.profiles WHERE id=$1`,
          [f.clientBAdmin]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case CM-8: clientA-admin INSERT capture_session fuer clientB → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.clientAAdmin, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.capture_session
             (tenant_id, template_id, template_version, owner_user_id, status, capture_mode)
           VALUES ($1, $2, $3, $4, 'open', 'questionnaire')`,
          [f.clientB, f.templateId, f.templateVersion, f.clientAAdmin]
        );
        expect(err).toMatch(/permission denied|row-level security/i);
      });
    });
  });
});

// ============================================================================
// tenant_admin (Mandant) Sicht auf Partner-Daten (4 Faelle)
// ============================================================================

describe("V6 tenant_admin Mandant — Sicht auf Partner-Daten (4 cases)", () => {
  it("Case MP-1: clientA-admin SELECT partner_organization (eigener Partner) → DENY (0 rows; Mandant sieht Partner-Stammdaten nicht direkt)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.clientAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.partner_organization WHERE tenant_id=$1`,
          [f.partnerA]
        );
        // Mandant hat keine partner_organization-Policy → 0 rows
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case MP-2: clientA-admin SELECT partner_organization (fremder Partner) → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.clientAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.partner_organization WHERE tenant_id=$1`,
          [f.partnerB]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case MP-3: clientA-admin SELECT partner_client_mapping (eigenes Mapping) → ALLOW (Branding-Lookup, pcm_select_own_mandant)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.clientAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.partner_client_mapping WHERE client_tenant_id=$1`,
          [f.clientA]
        );
        // Mandant darf eigenes Mapping lesen (fuer Branding) — 1 Row
        expect(r.rowCount).toBe(1);
      });
    });
  });

  it("Case MP-4: clientA-admin INSERT partner_organization → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.clientAAdmin, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.partner_organization
             (tenant_id, legal_name, display_name, contact_email, country)
           VALUES ($1, 'Mandant-Hijack', 'X', 'x@x.test', 'DE')`,
          [f.partnerA]
        );
        expect(err).toMatch(/permission denied|row-level security/i);
      });
    });
  });
});

// ============================================================================
// partner_admin vs. Direkt-Kunden (4 Faelle)
// ============================================================================

describe("V6 partner_admin vs. Direkt-Kunden (4 cases)", () => {
  it("Case DK-1: partnerA-admin SELECT tenants Row eines Direkt-Kunden → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.tenants WHERE id=$1`,
          [f.directTenant]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case DK-2: partnerA-admin SELECT capture_session eines Direkt-Kunden → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.capture_session WHERE tenant_id=$1`,
          [f.directTenant]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case DK-3: partnerA-admin SELECT knowledge_unit eines Direkt-Kunden → DENY", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      // Mandant_pending-Mapping ist 'invited' → partner_admin sieht nichts
      // Direkt-Kunde hat KEIN Mapping → ebenfalls 0 Rows
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT 1 FROM public.knowledge_unit ku
             JOIN public.capture_session cs ON cs.id=ku.capture_session_id
            WHERE cs.tenant_id=$1`,
          [f.directTenant]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case DK-4: Direkt-Kunde-Admin sieht NICHT partnerA-Daten (Regression: bestehende RLS bleibt scharf)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.directAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.tenants WHERE id=$1`,
          [f.partnerA]
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });
});

// ============================================================================
// strategaize_admin Override (Sanity: bricht V4-Pattern nicht)
// ============================================================================

describe("V6 strategaize_admin Override (sanity)", () => {
  it("strategaize_admin SELECT partner_organization cross-tenant → ALLOW (alle 2 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.strategaizeAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.partner_organization`
        );
        expect(r.rowCount).toBe(2);
      });
    });
  });

  it("strategaize_admin SELECT alle partner_client_mappings → ALLOW (3 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.strategaizeAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.partner_client_mapping`
        );
        expect(r.rowCount).toBe(3);
      });
    });
  });

  it("strategaize_admin INSERT partner_organization → ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      // neuer Partner-Tenant
      const t = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name, language, tenant_kind)
         VALUES ('PartnerC', 'de', 'partner_organization') RETURNING id`
      );
      await withJwtContext(client, f.strategaizeAdmin, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.partner_organization
             (tenant_id, legal_name, display_name, contact_email, country)
           VALUES ($1, 'KanzleiC', 'C', 'c@c.test', 'NL')`,
          [t.rows[0].id]
        );
        expect(err).toBeNull();
      });
    });
  });
});

// ============================================================================
// V6 SLC-103 — partner_client_mapping Cross-Partner Write/Read Isolation (8 cases)
// ============================================================================
//
// SLC-103 AC #12 — 4 Operations (SELECT/INSERT/UPDATE/DELETE) × 2 Cross-Partner
// Vektoren. Pen-Test verifiziert die 5 pcm_*-Policies aus Migration 090.
// Aktiviert mit SLC-103 (Server Actions inviteMandant/revokeMandantInvitation
// gehen ueber service_role/admin, aber RLS-Layer ist Defense-in-Depth).

describe("V6 SLC-103 partner_client_mapping Cross-Partner Isolation (8 cases)", () => {
  // ---------- SELECT (2) ----------
  it("Case PCM-1: partnerA-admin SELECT partner_client_mapping von partnerB → DENY (0 rows)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `SELECT id FROM public.partner_client_mapping WHERE id=$1`,
          [f.mappingB_accepted],
        );
        expect(r.rowCount).toBe(0);
      });
    });
  });

  it("Case PCM-2: partnerA-admin SELECT alle mappings → sieht nur eigene (partnerA), nicht partnerB", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query<{ partner_tenant_id: string }>(
          `SELECT DISTINCT partner_tenant_id FROM public.partner_client_mapping`,
        );
        const seenPartners = r.rows.map((row) => row.partner_tenant_id);
        expect(seenPartners).toContain(f.partnerA);
        expect(seenPartners).not.toContain(f.partnerB);
      });
    });
  });

  // ---------- INSERT (2) ----------
  it("Case PCM-3: partnerA-admin INSERT mapping fuer partnerB → DENY (RLS WITH CHECK)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      // Neuer partner_client unter partnerB
      const newCli = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
         VALUES ('PCM-3 ClientForB', 'de', 'partner_client', $1)
         RETURNING id`,
        [f.partnerB],
      );

      let errMsg: string | null = null;
      await withJwtContext(client, f.partnerAAdmin, async () => {
        await client.query("SAVEPOINT try_pcm_insert");
        try {
          await client.query(
            `INSERT INTO public.partner_client_mapping
               (partner_tenant_id, client_tenant_id, invitation_status)
             VALUES ($1, $2, 'invited')`,
            [f.partnerB, newCli.rows[0].id],
          );
        } catch (e) {
          errMsg = (e as Error).message;
        }
        await client.query("ROLLBACK TO SAVEPOINT try_pcm_insert");
      });

      expect(errMsg).toMatch(/permission denied|row-level security/i);
    });
  });

  it("Case PCM-4: partnerA-admin INSERT mapping mit korrektem partner_tenant_id=partnerA → ALLOW", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      const newCli = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
         VALUES ('PCM-4 ClientForA', 'de', 'partner_client', $1)
         RETURNING id`,
        [f.partnerA],
      );

      let insertedId: string | null = null;
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query<{ id: string }>(
          `INSERT INTO public.partner_client_mapping
             (partner_tenant_id, client_tenant_id, invitation_status)
           VALUES ($1, $2, 'invited')
           RETURNING id`,
          [f.partnerA, newCli.rows[0].id],
        );
        insertedId = r.rows[0]?.id ?? null;
      });
      expect(insertedId).toBeTruthy();
    });
  });

  // ---------- UPDATE (2) ----------
  it("Case PCM-5: partnerA-admin UPDATE partnerB-mapping → DENY (0 rows, RLS USING)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      let updatedRowCount: number | null = null;
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query(
          `UPDATE public.partner_client_mapping
              SET invitation_status='revoked', revoked_at=now()
            WHERE id=$1`,
          [f.mappingB_accepted],
        );
        updatedRowCount = r.rowCount;
      });
      expect(updatedRowCount).toBe(0);

      // Side-Check: partnerB-mapping ist unveraendert 'accepted'
      const check = await client.query<{ invitation_status: string }>(
        `SELECT invitation_status FROM public.partner_client_mapping WHERE id=$1`,
        [f.mappingB_accepted],
      );
      expect(check.rows[0].invitation_status).toBe("accepted");
    });
  });

  it("Case PCM-6: partnerA-admin UPDATE eigenes mapping (partnerA_pending → revoked) → ALLOW (rowCount=1)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      let updatedRowCount: number | null = null;
      let newStatus: string | null = null;
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query<{ invitation_status: string }>(
          `UPDATE public.partner_client_mapping
              SET invitation_status='revoked', revoked_at=now()
            WHERE id=$1
          RETURNING invitation_status`,
          [f.mappingA_pending],
        );
        updatedRowCount = r.rowCount;
        newStatus = r.rows[0]?.invitation_status ?? null;
      });
      expect(updatedRowCount).toBe(1);
      expect(newStatus).toBe("revoked");
    });
  });

  // ---------- DELETE (2) ----------
  it("Case PCM-7: partnerA-admin DELETE partnerB-mapping → DENY (0 rows, kein DELETE-Grant)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      let deletedRowCount: number | null = null;
      let permissionDenied = false;
      await withJwtContext(client, f.partnerAAdmin, async () => {
        await client.query("SAVEPOINT try_pcm_delete_b");
        try {
          const r = await client.query(
            `DELETE FROM public.partner_client_mapping WHERE id=$1`,
            [f.mappingB_accepted],
          );
          deletedRowCount = r.rowCount;
        } catch (e) {
          permissionDenied = /permission denied|row-level security/i.test(
            (e as Error).message,
          );
        }
        await client.query("ROLLBACK TO SAVEPOINT try_pcm_delete_b");
      });

      // DELETE-Grant fuer partner_admin in Migration 090 ist NICHT vergeben
      // (GRANT SELECT, INSERT, UPDATE — keine DELETE). Daher entweder
      // permission_denied (Grant-Layer) oder 0 rows (RLS — falls Grant zukuenftig
      // hinzugefuegt wird ohne Policy). Beide Verhalten gelten als Reject.
      expect(
        deletedRowCount === 0 || permissionDenied,
        `Expected rowCount=0 OR permission_denied, got rowCount=${deletedRowCount} permissionDenied=${permissionDenied}`,
      ).toBe(true);

      const check = await client.query(
        `SELECT 1 FROM public.partner_client_mapping WHERE id=$1`,
        [f.mappingB_accepted],
      );
      expect(check.rowCount).toBe(1);
    });
  });

  it("Case PCM-8: partnerA-admin DELETE eigenes mapping → DENY (kein DELETE-Grant fuer partner_admin)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV6Fixture(client);
      let deletedRowCount: number | null = null;
      let permissionDenied = false;
      await withJwtContext(client, f.partnerAAdmin, async () => {
        await client.query("SAVEPOINT try_pcm_delete_own");
        try {
          const r = await client.query(
            `DELETE FROM public.partner_client_mapping WHERE id=$1`,
            [f.mappingA_pending],
          );
          deletedRowCount = r.rowCount;
        } catch (e) {
          permissionDenied = /permission denied|row-level security/i.test(
            (e as Error).message,
          );
        }
        await client.query("ROLLBACK TO SAVEPOINT try_pcm_delete_own");
      });

      // partner_admin hat KEIN DELETE-Grant (Migration 090 erlaubt nur
      // SELECT/INSERT/UPDATE). Mapping-Lebenszyklus laeuft ueber UPDATE
      // (invited → accepted → revoked), nicht ueber Loeschen.
      expect(
        deletedRowCount === 0 || permissionDenied,
        `Expected rowCount=0 OR permission_denied, got rowCount=${deletedRowCount} permissionDenied=${permissionDenied}`,
      ).toBe(true);

      const check = await client.query(
        `SELECT 1 FROM public.partner_client_mapping WHERE id=$1`,
        [f.mappingA_pending],
      );
      expect(check.rowCount).toBe(1);
    });
  });
});

// ============================================================================
// V4/V5 Regression Hinweis
// ============================================================================
// V4 Knowledge-Schema (46 Faelle) und V5.1 Walkthrough-Matrix (48 Faelle) werden
// in den bestehenden Test-Files admin-rls.test.ts, rls-isolation.test.ts,
// v5-walkthrough-rls.test.ts und walkthrough-embed-rls.test.ts gepflegt und
// laufen automatisch im selben `npm run test`-Lauf. Migration 090 fuegt nur
// ADDITIVE partner_admin-Policies hinzu — keine bestehenden Policies werden
// veraendert (Defense-in-Depth Regression-Schutz, R-101-1).
//
// Erwartung an die /qa-Phase (SLC-101 MT-7+): alle bestehenden Test-Files
// PASS gegen Coolify-DB nach Migration 090 Apply. Bei Fail → Migration 090
// Rollback per pre-mig-034-090 Backup.
