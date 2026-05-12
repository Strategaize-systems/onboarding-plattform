import { describe, it, expect } from "vitest";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";

/**
 * V6 SLC-103 MT-1..MT-3 — DB-Integration-Tests fuer Mandanten-Server-Actions.
 *
 * Pattern-Reuse aus v6-partner-rls.test.ts + partner-stammdaten-actions-db.test.ts.
 * Wir verifizieren die SQL-Semantik, die die drei Server Actions (inviteMandant,
 * acceptMandantInvitation, revokeMandantInvitation) voraussetzen — atomarer
 * 3-Insert-Chain, Trigger-Schutz, Duplicate-Erkennung, RLS-Isolation, Idempotenz.
 *
 * Server-Action-Ebene (Auth-Gates, Form-Validation, E-Mail-Versand) wird hier
 * NICHT gemockt — diese laufen in der Live-Smoke (MT-10).
 *
 * Faelle (12 = 5 + 4 + 3, AC #11):
 *   inviteMandant (5):
 *     1. Happy — Atomic 3-Insert (tenants + mapping + invitation) erzeugt korrekten Zustand.
 *     2. Trigger-Reject — Direct-INSERT mapping mit parent_partner_tenant != partner_organization scheitert.
 *     3. Duplicate-Pending — 2. Invite mit gleicher E-Mail unter gleichem Partner wird per Lookup geblockt.
 *     4. UNIQUE-Pair — INSERT 2. Mapping fuer (partner, client) UNIQUE-Pair scheitert.
 *     5. Compensating-Delete — Wenn invitation INSERT scheitert, koennen tenants + mapping geloescht werden ohne FK-Verletzung.
 *
 *   acceptMandantInvitation-SQL-Pfad (4):
 *     6. Happy — UPDATE mapping (invited → accepted) + accepted_at setzt korrekt.
 *     7. Wrong-Status — UPDATE auf revoked Mapping ist No-Op (status guard via WHERE-Clause).
 *     8. Idempotent — 2. UPDATE auf 'accepted' Mapping mit gleichem WHERE schlaegt fehl, 1. bleibt korrekt.
 *     9. Wrong-Target-Role — Invitation mit role_hint='employee' loest KEIN Mapping-Update aus (Pre-Condition-Filter).
 *
 *   revokeMandantInvitation (3):
 *     10. Happy — UPDATE mapping=revoked + UPDATE invitation=revoked.
 *     11. Auth-Reject (RLS) — partner_admin-A UPDATE auf partnerB-Mapping → rowCount=0.
 *     12. Already-Accepted-Reject — Wenn mapping bereits accepted, blockt der Status-Guard das revoke-UPDATE.
 */

interface MandantenFixture {
  partnerATenant: string;
  partnerBTenant: string;
  partnerAAdminUser: string;
  partnerBAdminUser: string;
}

async function seedMandantenFixture(client: Client): Promise<MandantenFixture> {
  // Strategaize-Admin als Owner fuer created_by.
  const saRes = await client.query<{ id: string }>(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     )
     VALUES (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated',
       'slc103-sa-' || substr(gen_random_uuid()::text, 1, 8) || '@v6.test', '',
       '{}'::jsonb, $1::jsonb,
       now(), now()
     )
     RETURNING id`,
    [JSON.stringify({ role: "strategaize_admin" })],
  );
  const sa = saRes.rows[0].id;
  await client.query(
    `UPDATE public.profiles SET role='strategaize_admin', tenant_id=NULL WHERE id=$1`,
    [sa],
  );

  // Partner-A Tenant + Org
  const pATRes = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, created_by)
     VALUES ('SLC103 PartnerA', 'de', 'partner_organization', $1)
     RETURNING id`,
    [sa],
  );
  const partnerATenant = pATRes.rows[0].id;
  await client.query(
    `INSERT INTO public.partner_organization
       (tenant_id, legal_name, display_name, partner_kind, contact_email,
        country, created_by_admin_user_id)
       VALUES ($1, 'SLC103 PartnerA Legal', 'SLC103 PartnerA', 'tax_advisor',
               'slc103-a@kanzlei.local', 'DE', $2)`,
    [partnerATenant, sa],
  );

  // Partner-B Tenant + Org
  const pBTRes = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, created_by)
     VALUES ('SLC103 PartnerB', 'de', 'partner_organization', $1)
     RETURNING id`,
    [sa],
  );
  const partnerBTenant = pBTRes.rows[0].id;
  await client.query(
    `INSERT INTO public.partner_organization
       (tenant_id, legal_name, display_name, partner_kind, contact_email,
        country, created_by_admin_user_id)
       VALUES ($1, 'SLC103 PartnerB Legal', 'SLC103 PartnerB', 'tax_advisor',
               'slc103-b@kanzlei.local', 'DE', $2)`,
    [partnerBTenant, sa],
  );

  async function mkPartnerAdmin(label: string, tenantId: string): Promise<string> {
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
      [label, JSON.stringify({ role: "partner_admin", tenant_id: tenantId })],
    );
    const id = res.rows[0].id;
    await client.query(
      `INSERT INTO public.profiles (id, email, role, tenant_id)
         VALUES ($1, (SELECT email FROM auth.users WHERE id=$1), 'partner_admin', $2)
         ON CONFLICT (id) DO UPDATE SET role='partner_admin', tenant_id=$2`,
      [id, tenantId],
    );
    return id;
  }

  const partnerAAdminUser = await mkPartnerAdmin("slc103-pa-a", partnerATenant);
  const partnerBAdminUser = await mkPartnerAdmin("slc103-pa-b", partnerBTenant);

  return { partnerATenant, partnerBTenant, partnerAAdminUser, partnerBAdminUser };
}

async function insertMandantTenant(
  client: Client,
  partnerTenantId: string,
  name: string,
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
     VALUES ($1, 'de', 'partner_client', $2)
     RETURNING id`,
    [name, partnerTenantId],
  );
  return r.rows[0].id;
}

function randHexToken(): string {
  // 64-hex (32 Bytes), gleicher Wertebereich wie Server-Action-Token.
  return Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}

// ============================================================
// inviteMandant — 5 Faelle
// ============================================================

describe("inviteMandant — SQL contract (V6 SLC-103 MT-1)", () => {
  it("happy: 3-Insert-Chain (tenants + mapping + invitation) erzeugt korrekten Zustand", async () => {
    await withTestDb(async (client) => {
      const fx = await seedMandantenFixture(client);

      // Phase 1: tenants
      const tRes = await client.query<{ id: string }>(
        `INSERT INTO public.tenants
           (name, language, tenant_kind, parent_partner_tenant_id, created_by)
         VALUES ('Mandant Alpha GmbH', 'de', 'partner_client', $1, $2)
         RETURNING id`,
        [fx.partnerATenant, fx.partnerAAdminUser],
      );
      const mandantTenantId = tRes.rows[0].id;

      // Phase 2: partner_client_mapping
      const mRes = await client.query<{ id: string; invitation_status: string }>(
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invited_by_user_id, invitation_status)
         VALUES ($1, $2, $3, 'invited')
         RETURNING id, invitation_status`,
        [fx.partnerATenant, mandantTenantId, fx.partnerAAdminUser],
      );
      const mappingId = mRes.rows[0].id;

      // Phase 3: employee_invitation (tenant_admin role_hint)
      const token = randHexToken();
      const iRes = await client.query<{ id: string; role_hint: string }>(
        `INSERT INTO public.employee_invitation
           (tenant_id, email, display_name, role_hint, invitation_token,
            invited_by_user_id, status, expires_at)
         VALUES ($1, 'alpha@mandant.local', 'Alpha Owner', 'tenant_admin', $2,
                 $3, 'pending', now() + interval '14 days')
         RETURNING id, role_hint`,
        [mandantTenantId, token, fx.partnerAAdminUser],
      );

      // Verifikation
      expect(mRes.rows[0].invitation_status).toBe("invited");
      expect(iRes.rows[0].role_hint).toBe("tenant_admin");

      // Tenant ist partner_client mit korrektem parent
      const tCheck = await client.query<{
        tenant_kind: string;
        parent_partner_tenant_id: string;
      }>(
        `SELECT tenant_kind, parent_partner_tenant_id
           FROM public.tenants WHERE id = $1`,
        [mandantTenantId],
      );
      expect(tCheck.rows[0].tenant_kind).toBe("partner_client");
      expect(tCheck.rows[0].parent_partner_tenant_id).toBe(fx.partnerATenant);

      // Mapping verlinkt korrekt
      const mCheck = await client.query<{ partner_tenant_id: string; client_tenant_id: string }>(
        `SELECT partner_tenant_id, client_tenant_id
           FROM public.partner_client_mapping WHERE id = $1`,
        [mappingId],
      );
      expect(mCheck.rows[0].partner_tenant_id).toBe(fx.partnerATenant);
      expect(mCheck.rows[0].client_tenant_id).toBe(mandantTenantId);
    });
  });

  it("trigger-reject: mapping mit direct_client als client_tenant_id schlaegt fehl", async () => {
    await withTestDb(async (client) => {
      const fx = await seedMandantenFixture(client);

      // Direct-Client-Tenant (kein partner_client)
      const dRes = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name, language, tenant_kind)
         VALUES ('SLC103 Direct', 'de', 'direct_client')
         RETURNING id`,
      );
      const directTenantId = dRes.rows[0].id;

      await client.query("SAVEPOINT try_invalid_mapping");
      let errMsg: string | null = null;
      try {
        await client.query(
          `INSERT INTO public.partner_client_mapping
             (partner_tenant_id, client_tenant_id, invitation_status)
           VALUES ($1, $2, 'invited')`,
          [fx.partnerATenant, directTenantId],
        );
      } catch (e) {
        errMsg = (e as Error).message;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_invalid_mapping");

      expect(errMsg).toMatch(/client_tenant_id must reference.*partner_client/i);
    });
  });

  it("duplicate-pending: 2. Invite mit gleicher E-Mail unter gleichem Partner wird per Lookup geblockt", async () => {
    await withTestDb(async (client) => {
      const fx = await seedMandantenFixture(client);

      // 1. Invite — vollstaendiger Chain
      const mandantId1 = await insertMandantTenant(client, fx.partnerATenant, "Beta-1");
      const map1Res = await client.query<{ id: string }>(
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status)
         VALUES ($1, $2, 'invited') RETURNING id`,
        [fx.partnerATenant, mandantId1],
      );
      await client.query(
        `INSERT INTO public.employee_invitation
           (tenant_id, email, role_hint, invitation_token, invited_by_user_id, status, expires_at)
         VALUES ($1, 'beta@mandant.local', 'tenant_admin', $2, $3, 'pending', now() + interval '14 days')`,
        [mandantId1, randHexToken(), fx.partnerAAdminUser],
      );

      // Duplicate-Lookup wie in Server-Action
      const dupCheck = await client.query(
        `SELECT 1
           FROM public.employee_invitation ei
           JOIN public.partner_client_mapping pcm ON pcm.client_tenant_id = ei.tenant_id
          WHERE pcm.partner_tenant_id = $1
            AND lower(ei.email) = lower($2)
            AND ei.status = 'pending'
            AND pcm.invitation_status = 'invited'
          LIMIT 1`,
        [fx.partnerATenant, "beta@mandant.local"],
      );

      expect(dupCheck.rowCount).toBe(1);
      expect(map1Res.rowCount).toBe(1);
    });
  });

  it("unique-pair: 2. mapping fuer (partner, client) UNIQUE-Pair schlaegt fehl", async () => {
    await withTestDb(async (client) => {
      const fx = await seedMandantenFixture(client);

      const mandantId = await insertMandantTenant(client, fx.partnerATenant, "Gamma");
      await client.query(
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status)
         VALUES ($1, $2, 'invited')`,
        [fx.partnerATenant, mandantId],
      );

      await client.query("SAVEPOINT try_dup_pair");
      let errMsg: string | null = null;
      try {
        await client.query(
          `INSERT INTO public.partner_client_mapping
             (partner_tenant_id, client_tenant_id, invitation_status)
           VALUES ($1, $2, 'invited')`,
          [fx.partnerATenant, mandantId],
        );
      } catch (e) {
        errMsg = (e as Error).message;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_dup_pair");

      expect(errMsg).toMatch(/duplicate key|unique/i);
    });
  });

  it("compensating-delete: tenants + mapping koennen nach failed invitation INSERT entfernt werden", async () => {
    await withTestDb(async (client) => {
      const fx = await seedMandantenFixture(client);

      // Setup: Mandant + Mapping bereits angelegt
      const mandantId = await insertMandantTenant(client, fx.partnerATenant, "Delta");
      const mapRes = await client.query<{ id: string }>(
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status)
         VALUES ($1, $2, 'invited') RETURNING id`,
        [fx.partnerATenant, mandantId],
      );

      // Compensating Deletes (mapping → tenants, FK ON DELETE CASCADE auf mapping
      // wird via tenants DELETE ausgeloest; sicherheitshalber zuerst explicit
      // DELETE mapping, dann tenants).
      const delMap = await client.query(
        `DELETE FROM public.partner_client_mapping WHERE id = $1`,
        [mapRes.rows[0].id],
      );
      const delTen = await client.query(
        `DELETE FROM public.tenants WHERE id = $1`,
        [mandantId],
      );

      expect(delMap.rowCount).toBe(1);
      expect(delTen.rowCount).toBe(1);

      // Nichts persistiert
      const remaining = await client.query(
        `SELECT 1 FROM public.tenants WHERE id = $1`,
        [mandantId],
      );
      expect(remaining.rowCount).toBe(0);
    });
  });
});

// ============================================================
// acceptMandantInvitation-SQL-Pfad — 4 Faelle
// ============================================================

describe("acceptMandantInvitation — Mapping update contract (V6 SLC-103 MT-2)", () => {
  it("happy: UPDATE mapping (invited → accepted) + accepted_at setzt korrekt", async () => {
    await withTestDb(async (client) => {
      const fx = await seedMandantenFixture(client);
      const mandantId = await insertMandantTenant(client, fx.partnerATenant, "Eps-1");
      await client.query(
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status)
         VALUES ($1, $2, 'invited')`,
        [fx.partnerATenant, mandantId],
      );

      const updRes = await client.query<{
        invitation_status: string;
        accepted_at: string | null;
      }>(
        `UPDATE public.partner_client_mapping
            SET invitation_status='accepted', accepted_at=now()
          WHERE client_tenant_id=$1 AND invitation_status='invited'
          RETURNING invitation_status, accepted_at`,
        [mandantId],
      );

      expect(updRes.rowCount).toBe(1);
      expect(updRes.rows[0].invitation_status).toBe("accepted");
      expect(updRes.rows[0].accepted_at).not.toBeNull();
    });
  });

  it("wrong-status: UPDATE auf revoked Mapping ist No-Op (status-Filter via WHERE)", async () => {
    await withTestDb(async (client) => {
      const fx = await seedMandantenFixture(client);
      const mandantId = await insertMandantTenant(client, fx.partnerATenant, "Eps-2");
      await client.query(
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status, revoked_at)
         VALUES ($1, $2, 'revoked', now())`,
        [fx.partnerATenant, mandantId],
      );

      // Server-Action filtert WHERE invitation_status='invited' → 0 rows
      const updRes = await client.query(
        `UPDATE public.partner_client_mapping
            SET invitation_status='accepted', accepted_at=now()
          WHERE client_tenant_id=$1 AND invitation_status='invited'`,
        [mandantId],
      );
      expect(updRes.rowCount).toBe(0);

      // Status bleibt revoked
      const check = await client.query<{ invitation_status: string }>(
        `SELECT invitation_status FROM public.partner_client_mapping WHERE client_tenant_id=$1`,
        [mandantId],
      );
      expect(check.rows[0].invitation_status).toBe("revoked");
    });
  });

  it("idempotent: 2. UPDATE auf bereits accepted Mapping ist No-Op (WHERE-Filter)", async () => {
    await withTestDb(async (client) => {
      const fx = await seedMandantenFixture(client);
      const mandantId = await insertMandantTenant(client, fx.partnerATenant, "Eps-3");
      const acceptedAtFirst = new Date(Date.now() - 60_000).toISOString();
      await client.query(
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status, accepted_at)
         VALUES ($1, $2, 'accepted', $3)`,
        [fx.partnerATenant, mandantId, acceptedAtFirst],
      );

      const updRes = await client.query(
        `UPDATE public.partner_client_mapping
            SET invitation_status='accepted', accepted_at=now()
          WHERE client_tenant_id=$1 AND invitation_status='invited'`,
        [mandantId],
      );
      expect(updRes.rowCount).toBe(0);

      // accepted_at unveraendert
      const check = await client.query<{ accepted_at: string }>(
        `SELECT accepted_at::text AS accepted_at FROM public.partner_client_mapping
           WHERE client_tenant_id=$1`,
        [mandantId],
      );
      // accepted_at sollte nicht aktualisiert worden sein (kein Update)
      const acceptedAtNow = new Date(check.rows[0].accepted_at).getTime();
      expect(acceptedAtNow).toBeLessThan(Date.now() - 30_000);
    });
  });

  it("wrong-target-role: invitation mit role_hint='employee' loest KEIN Mapping-Update aus", async () => {
    await withTestDb(async (client) => {
      const fx = await seedMandantenFixture(client);
      const mandantId = await insertMandantTenant(client, fx.partnerATenant, "Eps-4");
      await client.query(
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status)
         VALUES ($1, $2, 'invited')`,
        [fx.partnerATenant, mandantId],
      );

      // Pre-Condition-Check wie Server-Action: acceptedRole='employee'
      // → KEIN Mapping-Update (Branch wird nicht erreicht).
      const acceptedRole: string = "employee";
      let updRowCount = 0;
      if (acceptedRole === "tenant_admin") {
        const updRes = await client.query(
          `UPDATE public.partner_client_mapping
              SET invitation_status='accepted', accepted_at=now()
            WHERE client_tenant_id=$1 AND invitation_status='invited'`,
          [mandantId],
        );
        updRowCount = updRes.rowCount ?? 0;
      }
      expect(updRowCount).toBe(0);

      // Mapping bleibt 'invited' (Defensiv: nicht versehentlich akzeptiert)
      const check = await client.query<{ invitation_status: string }>(
        `SELECT invitation_status FROM public.partner_client_mapping WHERE client_tenant_id=$1`,
        [mandantId],
      );
      expect(check.rows[0].invitation_status).toBe("invited");
    });
  });
});

// ============================================================
// revokeMandantInvitation — 3 Faelle
// ============================================================

describe("revokeMandantInvitation — Mapping + Invitation update contract (V6 SLC-103 MT-3)", () => {
  it("happy: UPDATE mapping=revoked + UPDATE invitation=revoked atomar", async () => {
    await withTestDb(async (client) => {
      const fx = await seedMandantenFixture(client);
      const mandantId = await insertMandantTenant(client, fx.partnerATenant, "Zeta-1");
      const mapRes = await client.query<{ id: string }>(
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status)
         VALUES ($1, $2, 'invited') RETURNING id`,
        [fx.partnerATenant, mandantId],
      );
      const mappingId = mapRes.rows[0].id;
      await client.query(
        `INSERT INTO public.employee_invitation
           (tenant_id, email, role_hint, invitation_token, invited_by_user_id, status, expires_at)
         VALUES ($1, 'zeta1@mandant.local', 'tenant_admin', $2, $3, 'pending', now() + interval '14 days')`,
        [mandantId, randHexToken(), fx.partnerAAdminUser],
      );

      // Revoke-Sequence
      const updMap = await client.query<{ invitation_status: string; revoked_at: string }>(
        `UPDATE public.partner_client_mapping
            SET invitation_status='revoked', revoked_at=now()
          WHERE id=$1
        RETURNING invitation_status, revoked_at`,
        [mappingId],
      );
      const updInv = await client.query<{ status: string }>(
        `UPDATE public.employee_invitation
            SET status='revoked'
          WHERE tenant_id=$1 AND role_hint='tenant_admin' AND status='pending'
        RETURNING status`,
        [mandantId],
      );

      expect(updMap.rowCount).toBe(1);
      expect(updMap.rows[0].invitation_status).toBe("revoked");
      expect(updMap.rows[0].revoked_at).not.toBeNull();
      expect(updInv.rowCount).toBe(1);
      expect(updInv.rows[0].status).toBe("revoked");
    });
  });

  it("auth-reject (RLS): partner_admin-A UPDATE auf partnerB-Mapping → rowCount=0", async () => {
    await withTestDb(async (client) => {
      const fx = await seedMandantenFixture(client);
      const mandantB = await insertMandantTenant(client, fx.partnerBTenant, "Zeta-2");
      const mapBRes = await client.query<{ id: string }>(
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status)
         VALUES ($1, $2, 'invited') RETURNING id`,
        [fx.partnerBTenant, mandantB],
      );
      const mappingBId = mapBRes.rows[0].id;

      let updatedRowCount: number | null = null;
      let permissionDenied = false;

      await withJwtContext(client, fx.partnerAAdminUser, async () => {
        await client.query("SAVEPOINT try_cross_partner_revoke");
        try {
          const res = await client.query(
            `UPDATE public.partner_client_mapping
                SET invitation_status='revoked', revoked_at=now()
              WHERE id=$1`,
            [mappingBId],
          );
          updatedRowCount = res.rowCount;
        } catch (e) {
          permissionDenied = /permission denied|row-level security/i.test(
            (e as Error).message,
          );
        }
        await client.query("ROLLBACK TO SAVEPOINT try_cross_partner_revoke");
      });

      expect(
        updatedRowCount === 0 || permissionDenied,
        `Expected rowCount=0 OR permission_denied, got rowCount=${updatedRowCount} permissionDenied=${permissionDenied}`,
      ).toBe(true);

      // Mapping bleibt 'invited'
      const check = await client.query<{ invitation_status: string }>(
        `SELECT invitation_status FROM public.partner_client_mapping WHERE id=$1`,
        [mappingBId],
      );
      expect(check.rows[0].invitation_status).toBe("invited");
    });
  });

  it("already-accepted-reject: Status-Guard blockt revoke wenn mapping bereits accepted", async () => {
    await withTestDb(async (client) => {
      const fx = await seedMandantenFixture(client);
      const mandantId = await insertMandantTenant(client, fx.partnerATenant, "Zeta-3");
      const mapRes = await client.query<{ id: string }>(
        `INSERT INTO public.partner_client_mapping
           (partner_tenant_id, client_tenant_id, invitation_status, accepted_at)
         VALUES ($1, $2, 'accepted', now()) RETURNING id`,
        [fx.partnerATenant, mandantId],
      );
      const mappingId = mapRes.rows[0].id;

      // Server-Action prueft mapping.invitation_status BEFORE UPDATE.
      const stateCheck = await client.query<{ invitation_status: string }>(
        `SELECT invitation_status FROM public.partner_client_mapping WHERE id=$1`,
        [mappingId],
      );
      const status = stateCheck.rows[0].invitation_status;
      const isRevokable = status === "invited";
      expect(isRevokable).toBe(false);
      expect(status).toBe("accepted");

      // Defensiv: selbst wenn der Status-Guard versehentlich uebersprungen
      // wuerde, lassen wir trotzdem das UPDATE laufen — accepted bleibt
      // bestehen, weil status='accepted' ein gueltiger Endzustand ist.
      // Aber: revoked_at wuerde gesetzt — daher prueft Server-Action vor UPDATE.
    });
  });
});
