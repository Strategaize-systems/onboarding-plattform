import { describe, it, expect } from "vitest";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";

// V7.1 SLC-136 MT-5 — Pen-Test-Suite text_override + text_override_history RLS.
//
// Pattern-Reuse: v6-partner-rls.test.ts (withTestDb fuer BEGIN/ROLLBACK pro Test,
// withJwtContext fuer Role+Tenant-Switch, SAVEPOINT-Wrapper fuer expected
// RLS-Rejections). Bestaetigt durch MIG-044-Live-Apply via RPT-314.
//
// Test-Blocks (gemaess Slice-Spec):
//   - Schema-Smoke (3 Faelle: text_override + history + 4 Helper-Objekte)
//   - strategaize_admin Happy-Path (3 Faelle: global+template+partner)
//   - partner_admin Happy-Path (2 Faelle: own-partner INSERT + UPDATE)
//   - partner_admin Cross-Partner-Write-Block (2 Faelle: other-partner INSERT + UPDATE)
//   - partner_admin Global+Template-Write-Block (2 Faelle)
//   - tenant_member Write-Block (2 Faelle: global+partner)
//   - tenant_member Read-Visibility (1 Fall: global+template+own-partner sichtbar)
//   - History Audit + Cross-Partner-History-Block (2 Faelle)
//
// Total: 17 Pen-Test-Cases (8+ aus Slice-Spec).

// ============================================================
// Test-Fixture: 2 Partners + Direct-Tenant + 4 User-Rollen
// ============================================================

interface PenFixture {
  partnerOrgA: string;
  partnerOrgB: string;
  partnerATenantId: string;
  partnerBTenantId: string;
  clientATenantId: string;       // partner_client unter partnerA
  directTenantId: string;
  strategaizeAdmin: string;
  partnerAAdmin: string;
  partnerBAdmin: string;
  tenantMemberA: string;          // tenant_member von clientA (Partner A's client)
}

async function seedPenFixture(client: Client): Promise<PenFixture> {
  // --- Tenants ---
  const tA = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind)
     VALUES ('SLC-136 PartnerA Pen', 'de', 'partner_organization')
     RETURNING id`,
  );
  const partnerATenantId = tA.rows[0].id;

  const tB = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind)
     VALUES ('SLC-136 PartnerB Pen', 'de', 'partner_organization')
     RETURNING id`,
  );
  const partnerBTenantId = tB.rows[0].id;

  const tCA = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
     VALUES ('SLC-136 ClientA Pen', 'de', 'partner_client', $1)
     RETURNING id`,
    [partnerATenantId],
  );
  const clientATenantId = tCA.rows[0].id;

  const tD = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language)
     VALUES ('SLC-136 Direct Pen', 'de')
     RETURNING id`,
  );
  const directTenantId = tD.rows[0].id;

  // --- partner_organization (FK 1:1 auf partner-Tenant) ---
  const poA = await client.query<{ id: string }>(
    `INSERT INTO public.partner_organization
       (tenant_id, legal_name, display_name, contact_email, country, created_by_admin_user_id)
     VALUES ($1, 'SLC-136 KanzleiA', 'KanzleiA', 'a@slc136.test', 'DE', NULL)
     RETURNING id`,
    [partnerATenantId],
  );
  const partnerOrgA = poA.rows[0].id;

  const poB = await client.query<{ id: string }>(
    `INSERT INTO public.partner_organization
       (tenant_id, legal_name, display_name, contact_email, country, created_by_admin_user_id)
     VALUES ($1, 'SLC-136 KanzleiB', 'KanzleiB', 'b@slc136.test', 'DE', NULL)
     RETURNING id`,
    [partnerBTenantId],
  );
  const partnerOrgB = poB.rows[0].id;

  // --- Users (handle_new_user-Trigger erzeugt profiles) ---
  async function mkUser(
    label: string,
    role: "strategaize_admin" | "tenant_admin" | "tenant_member" | "partner_admin",
    tenantId: string | null,
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
         $1 || '-' || substr(gen_random_uuid()::text, 1, 8) || '@slc136.test', '',
         '{}'::jsonb, $2::jsonb,
         now(), now()
       )
       RETURNING id`,
      [label, JSON.stringify(metadata)],
    );
    return res.rows[0].id;
  }

  const strategaizeAdmin = await mkUser("slc136-sa", "strategaize_admin", null);
  // strategaize_admin braucht tenant_id=NULL aber handle_new_user setzt es nicht
  // bei dieser Rolle. Defensive Korrektur via Direct-UPDATE.
  await client.query(
    `UPDATE public.profiles SET role='strategaize_admin', tenant_id=NULL WHERE id=$1`,
    [strategaizeAdmin],
  );

  const partnerAAdmin = await mkUser("slc136-pa-a", "partner_admin", partnerATenantId);
  const partnerBAdmin = await mkUser("slc136-pa-b", "partner_admin", partnerBTenantId);
  const tenantMemberA = await mkUser("slc136-tm-a", "tenant_member", clientATenantId);

  return {
    partnerOrgA,
    partnerOrgB,
    partnerATenantId,
    partnerBTenantId,
    clientATenantId,
    directTenantId,
    strategaizeAdmin,
    partnerAAdmin,
    partnerBAdmin,
    tenantMemberA,
  };
}

// ============================================================
// SAVEPOINT-Wrapper fuer expected RLS-Rejections (siehe
// coolify-test-setup.md rule, [[reference-coolify-test-setup]])
// ============================================================

async function tryDml(
  client: Client,
  sql: string,
  params: unknown[],
): Promise<string | null> {
  await client.query("SAVEPOINT pen_dml");
  try {
    await client.query(sql, params);
    await client.query("RELEASE SAVEPOINT pen_dml");
    return null;
  } catch (e) {
    try {
      await client.query("ROLLBACK TO SAVEPOINT pen_dml");
    } catch {
      // Bereits zurueckgerollt — ignorieren.
    }
    return (e as Error).message;
  }
}

// ============================================================
// Schema-Smoke — Migration 101 vollstaendig appliziert
// ============================================================

describe("V7.1 SLC-136 — Migration 101 Schema-Smoke", () => {
  it("text_override + text_override_history Tabellen existieren mit RLS aktiviert", async () => {
    await withTestDb(async (client) => {
      const r = await client.query<{ relname: string; relrowsecurity: boolean }>(
        `SELECT relname, relrowsecurity
           FROM pg_class
          WHERE relname IN ('text_override','text_override_history')`,
      );
      expect(r.rowCount).toBe(2);
      for (const row of r.rows) {
        expect(row.relrowsecurity).toBe(true);
      }
    });
  });

  it("Helper-Objekte aus Praeambel sind angelegt (DEC-149)", async () => {
    await withTestDb(async (client) => {
      const fnCheck = await client.query<{ proname: string }>(
        `SELECT proname FROM pg_proc
          WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname='public')
            AND proname IN ('is_strategaize_admin','current_tenant_id')`,
      );
      expect(fnCheck.rowCount).toBe(2);

      const viewCheck = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.views
          WHERE table_schema='public'
            AND table_name IN ('partner_admin_view','tenant_to_partner_view')`,
      );
      expect(viewCheck.rowCount).toBe(2);
    });
  });

  it("text_override CHECK-Constraint scope_id_matches_scope verbietet inkonsistente Rows", async () => {
    await withTestDb(async (client) => {
      const { strategaizeAdmin } = await seedPenFixture(client);
      // Direct-Postgres-Pfad (umgeht RLS) — testet nur den CHECK.
      const errGlobalWithScopeId = await tryDml(
        client,
        `INSERT INTO public.text_override
           (scope, scope_id, text_key, text_value, locale, updated_by)
         VALUES ('global', gen_random_uuid(), 'a.b', 'v', 'de', $1)`,
        [strategaizeAdmin],
      );
      expect(errGlobalWithScopeId).toMatch(/scope_id_matches_scope/i);

      const errPartnerWithoutScopeId = await tryDml(
        client,
        `INSERT INTO public.text_override
           (scope, scope_id, text_key, text_value, locale, updated_by)
         VALUES ('partner', NULL, 'a.b', 'v', 'de', $1)`,
        [strategaizeAdmin],
      );
      expect(errPartnerWithoutScopeId).toMatch(/scope_id_matches_scope/i);
    });
  });
});

// ============================================================
// strategaize_admin Happy-Path (3 Faelle)
// ============================================================

describe("V7.1 SLC-136 — strategaize_admin darf alles", () => {
  it("strategaize_admin INSERT scope='global' PASS", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      await withJwtContext(client, f.strategaizeAdmin, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.text_override
             (scope, scope_id, text_key, text_value, locale, updated_by)
           VALUES ('global', NULL, 'header.title', 'Globaler Titel', 'de', $1)`,
          [f.strategaizeAdmin],
        );
        expect(err).toBeNull();
      });
    });
  });

  it("strategaize_admin INSERT scope='template' mit beliebigem scope_id PASS", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      const tplId = (
        await client.query<{ id: string }>(
          `INSERT INTO public.template (slug, name, version, blocks)
           VALUES ('slc136-rls-' || substr(gen_random_uuid()::text,1,8), 'SLC-136 RLS Tpl', '1', '[]'::jsonb)
           RETURNING id`,
        )
      ).rows[0].id;

      await withJwtContext(client, f.strategaizeAdmin, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.text_override
             (scope, scope_id, text_key, text_value, locale, updated_by)
           VALUES ('template', $1, 'intro.text', 'Template Intro', 'de', $2)`,
          [tplId, f.strategaizeAdmin],
        );
        expect(err).toBeNull();
      });
    });
  });

  it("strategaize_admin INSERT scope='partner' fuer Partner B PASS (Cross-Partner-Schreibrecht)", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      await withJwtContext(client, f.strategaizeAdmin, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.text_override
             (scope, scope_id, text_key, text_value, locale, updated_by)
           VALUES ('partner', $1, 'footer.legal', 'Partner B Legal', 'de', $2)`,
          [f.partnerOrgB, f.strategaizeAdmin],
        );
        expect(err).toBeNull();
      });
    });
  });
});

// ============================================================
// partner_admin Happy-Path (2 Faelle: own-partner INSERT + UPDATE)
// ============================================================

describe("V7.1 SLC-136 — partner_admin own-partner Happy-Path", () => {
  it("partner_admin INSERT scope='partner' fuer eigene Partner-Org PASS", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.text_override
             (scope, scope_id, text_key, text_value, locale, updated_by)
           VALUES ('partner', $1, 'cta.text', 'Eigener Partner-CTA', 'de', $2)`,
          [f.partnerOrgA, f.partnerAAdmin],
        );
        expect(err).toBeNull();
      });
    });
  });

  it("partner_admin UPDATE eigener Partner-Row PASS", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      // Vorab als strategaize_admin anlegen (RLS-bypass via SECURITY DEFINER waere
      // Overhead; einfacher: kein JWT-Context, direkter postgres-Pfad).
      const ovr = await client.query<{ id: string }>(
        `INSERT INTO public.text_override
           (scope, scope_id, text_key, text_value, locale, updated_by)
         VALUES ('partner', $1, 'k.upd', 'OldText', 'de', $2)
         RETURNING id`,
        [f.partnerOrgA, f.strategaizeAdmin],
      );

      await withJwtContext(client, f.partnerAAdmin, async () => {
        const err = await tryDml(
          client,
          `UPDATE public.text_override SET text_value=$1, updated_by=$2
             WHERE id=$3`,
          ["NewText", f.partnerAAdmin, ovr.rows[0].id],
        );
        expect(err).toBeNull();
      });

      // Verifikation: Wert tatsaechlich aktualisiert
      const r = await client.query<{ text_value: string }>(
        `SELECT text_value FROM public.text_override WHERE id=$1`,
        [ovr.rows[0].id],
      );
      expect(r.rows[0].text_value).toBe("NewText");
    });
  });
});

// ============================================================
// partner_admin Cross-Partner Write-Block (2 Faelle)
// ============================================================

describe("V7.1 SLC-136 — partner_admin Cross-Partner Write-Block", () => {
  it("partner_admin Partner A INSERT scope='partner', scope_id=Partner B → RLS-Reject", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.text_override
             (scope, scope_id, text_key, text_value, locale, updated_by)
           VALUES ('partner', $1, 'evil.text', 'Hack', 'de', $2)`,
          [f.partnerOrgB, f.partnerAAdmin],
        );
        expect(err).toMatch(/row-level security/i);
      });
    });
  });

  it("partner_admin Partner A UPDATE Partner-B-Row → RLS-Reject (Row-not-found, weil SELECT-RLS schon greift)", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      // Partner-B-Row als strategaize_admin anlegen
      const ovr = await client.query<{ id: string }>(
        `INSERT INTO public.text_override
           (scope, scope_id, text_key, text_value, locale, updated_by)
         VALUES ('partner', $1, 'b.target', 'BText', 'de', $2)
         RETURNING id`,
        [f.partnerOrgB, f.strategaizeAdmin],
      );

      await withJwtContext(client, f.partnerAAdmin, async () => {
        // UPDATE WHERE id=B-Row — Row ist fuer partner_admin A nicht sichtbar
        // (Read-Policy filtert) und nicht schreibbar (Write-Policy filtert).
        // Resultat: UPDATE betrifft 0 Rows. Kein direkter row-level-security-
        // Throw, weil der UPDATE-USING-Filter eine harte WHERE-Clause wird.
        const res = await client.query(
          `UPDATE public.text_override SET text_value='Hacked'
             WHERE id=$1
             RETURNING id`,
          [ovr.rows[0].id],
        );
        expect(res.rowCount).toBe(0);
      });

      // Verifikation: Wert UNVERAENDERT
      const r = await client.query<{ text_value: string }>(
        `SELECT text_value FROM public.text_override WHERE id=$1`,
        [ovr.rows[0].id],
      );
      expect(r.rows[0].text_value).toBe("BText");
    });
  });
});

// ============================================================
// partner_admin Global+Template Write-Block (2 Faelle)
// ============================================================

describe("V7.1 SLC-136 — partner_admin Global+Template Write-Block", () => {
  it("partner_admin INSERT scope='global' → RLS-Reject", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.text_override
             (scope, scope_id, text_key, text_value, locale, updated_by)
           VALUES ('global', NULL, 'try.global', 'No', 'de', $1)`,
          [f.partnerAAdmin],
        );
        expect(err).toMatch(/row-level security/i);
      });
    });
  });

  it("partner_admin INSERT scope='template' → RLS-Reject", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      const tplId = (
        await client.query<{ id: string }>(
          `INSERT INTO public.template (slug, name, version, blocks)
           VALUES ('slc136-rls-2-' || substr(gen_random_uuid()::text,1,8), 'tpl2', '1', '[]'::jsonb)
           RETURNING id`,
        )
      ).rows[0].id;
      await withJwtContext(client, f.partnerAAdmin, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.text_override
             (scope, scope_id, text_key, text_value, locale, updated_by)
           VALUES ('template', $1, 'try.tpl', 'No', 'de', $2)`,
          [tplId, f.partnerAAdmin],
        );
        expect(err).toMatch(/row-level security/i);
      });
    });
  });
});

// ============================================================
// tenant_member Write-Block (2 Faelle)
// ============================================================

describe("V7.1 SLC-136 — tenant_member Write-Block", () => {
  it("tenant_member INSERT scope='global' → RLS-Reject", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      await withJwtContext(client, f.tenantMemberA, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.text_override
             (scope, scope_id, text_key, text_value, locale, updated_by)
           VALUES ('global', NULL, 'tm.try', 'No', 'de', $1)`,
          [f.tenantMemberA],
        );
        expect(err).toMatch(/row-level security/i);
      });
    });
  });

  it("tenant_member INSERT scope='partner' (own-partner) → RLS-Reject (read-only)", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      await withJwtContext(client, f.tenantMemberA, async () => {
        const err = await tryDml(
          client,
          `INSERT INTO public.text_override
             (scope, scope_id, text_key, text_value, locale, updated_by)
           VALUES ('partner', $1, 'tm.try.partner', 'No', 'de', $2)`,
          [f.partnerOrgA, f.tenantMemberA],
        );
        expect(err).toMatch(/row-level security/i);
      });
    });
  });
});

// ============================================================
// tenant_member Read-Visibility (1 Fall, Matrix-Sicht)
// ============================================================

describe("V7.1 SLC-136 — tenant_member Read-Visibility", () => {
  it("tenant_member sieht global + template + own-partner, NICHT other-partner", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      const tplId = (
        await client.query<{ id: string }>(
          `INSERT INTO public.template (slug, name, version, blocks)
           VALUES ('slc136-vis-' || substr(gen_random_uuid()::text,1,8), 'tplVis', '1', '[]'::jsonb)
           RETURNING id`,
        )
      ).rows[0].id;

      // Seed 4 Override-Rows: global, template, partner=A (own), partner=B (other).
      // text_key MUSS regex [a-z0-9._]{1,200} matchen (CHECK), daher alle lowercase.
      await client.query(
        `INSERT INTO public.text_override
           (scope, scope_id, text_key, text_value, locale, updated_by)
         VALUES
           ('global', NULL, 'vis.global', 'G', 'de', $1),
           ('template', $2, 'vis.tpl', 'T', 'de', $1),
           ('partner', $3, 'vis.a', 'A', 'de', $1),
           ('partner', $4, 'vis.b', 'B', 'de', $1)`,
        [f.strategaizeAdmin, tplId, f.partnerOrgA, f.partnerOrgB],
      );

      await withJwtContext(client, f.tenantMemberA, async () => {
        const r = await client.query<{ text_key: string }>(
          `SELECT text_key FROM public.text_override
            WHERE text_key LIKE 'vis.%'
            ORDER BY text_key`,
        );
        const keys = r.rows.map((x) => x.text_key);
        // tenant_member von clientA (parent_partner=partnerA) sieht:
        // - global + template (immer)
        // - partner=partnerOrgA (own-partner via tenant_to_partner_view)
        // NICHT vis.b (partnerOrgB → kein Match in tenant_to_partner_view)
        expect(keys).toEqual(["vis.a", "vis.global", "vis.tpl"]);
      });
    });
  });
});

// ============================================================
// History Audit + Cross-Partner-History-Block (2 Faelle)
// ============================================================

describe("V7.1 SLC-136 — History-Audit RLS", () => {
  it("partner_admin sieht NUR History-Rows seines eigenen Partners (Cross-Partner-Block)", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      // Two history rows: one for partnerOrgA (PA's), one for partnerOrgB (cross)
      await client.query(
        `INSERT INTO public.text_override_history
           (text_override_id, scope, scope_id, text_key, locale,
            old_value, new_value, editor_id, editor_role, action)
         VALUES
           (NULL, 'partner', $1, 'h.A', 'de', NULL, 'A', $2, 'strategaize_admin', 'create'),
           (NULL, 'partner', $3, 'h.B', 'de', NULL, 'B', $2, 'strategaize_admin', 'create')`,
        [f.partnerOrgA, f.strategaizeAdmin, f.partnerOrgB],
      );

      await withJwtContext(client, f.partnerAAdmin, async () => {
        const r = await client.query<{ text_key: string }>(
          `SELECT text_key FROM public.text_override_history
            WHERE text_key IN ('h.A','h.B')
            ORDER BY text_key`,
        );
        const keys = r.rows.map((x) => x.text_key);
        expect(keys).toEqual(["h.A"]);
      });
    });
  });

  it("History INSERT mit editor_id ≠ auth.uid() → RLS-Reject (insert_self-Policy)", async () => {
    await withTestDb(async (client) => {
      const f = await seedPenFixture(client);
      await withJwtContext(client, f.partnerAAdmin, async () => {
        // partner_admin A versucht Audit-Row im Namen des strategaize_admin zu schreiben.
        const err = await tryDml(
          client,
          `INSERT INTO public.text_override_history
             (text_override_id, scope, scope_id, text_key, locale,
              old_value, new_value, editor_id, editor_role, action)
           VALUES (NULL, 'partner', $1, 'h.spoof', 'de', NULL, 'Spoof', $2, 'strategaize_admin', 'create')`,
          [f.partnerOrgA, f.strategaizeAdmin],
        );
        expect(err).toMatch(/row-level security/i);
      });
    });
  });
});
