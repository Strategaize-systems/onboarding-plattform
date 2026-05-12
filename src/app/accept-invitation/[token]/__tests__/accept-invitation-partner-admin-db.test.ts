import { describe, it, expect } from "vitest";
import type { Client } from "pg";

import { withTestDb } from "@/test/db";

/**
 * V6 SLC-102 MT-6 — DB-Integration-Tests fuer den Accept-Invitation-Flow mit
 * `role_hint`-Branch in `src/app/accept-invitation/[token]/actions.ts`.
 *
 * Diese Tests pruefen die DB-Seite des Pfads (Schema + Trigger + RPC), den die
 * Server Action mit dem Supabase-Admin-Client absetzt. Die eigentliche
 * `acceptEmployeeInvitation`-Action braucht Next-Headers/Cookies und den
 * GoTrue-REST-Endpoint (auth.admin.createUser) — beides wird hier nicht
 * gerufen. Stattdessen simulieren wir den Pfad strikt parallel:
 *   - SELECT auf `employee_invitation` mit dem Token (inkl. role_hint)
 *   - INSERT in `auth.users` mit `raw_user_meta_data = { role, tenant_id }`
 *     (das ist genau, was admin.auth.admin.createUser an die DB schickt —
 *     `handle_new_user`-Trigger uebernimmt es 1:1)
 *   - RPC `rpc_accept_employee_invitation_finalize`
 *   - SELECT auf `employee_invitation` und `profiles` zur Verifikation
 *
 * 4 Faelle:
 *   1. Happy partner_admin — role_hint='partner_admin' → profile.role='partner_admin'
 *   2. Default employee  — role_hint=NULL → profile.role='employee' (V4-Regression)
 *   3. Token-invalid     — SELECT findet nichts → action retourniert Fehler
 *   4. Token-expired     — finalize-RPC retourniert {error: 'expired'}
 */

const HEX_TOKEN_A = "a".repeat(64);
const HEX_TOKEN_B = "b".repeat(64);
const HEX_TOKEN_C = "c".repeat(64);

interface SeededAdmin {
  userId: string;
}

async function seedStrategaizeAdmin(client: Client): Promise<SeededAdmin> {
  const email = `mt6-sa-${Math.random().toString(36).slice(2)}@v6.test`;
  const res = await client.query<{ id: string }>(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     )
     VALUES (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated', $1, '',
       '{}'::jsonb, $2::jsonb, now(), now()
     )
     RETURNING id`,
    [email, JSON.stringify({ role: "strategaize_admin" })],
  );
  const userId = res.rows[0].id;
  await client.query(
    `INSERT INTO public.profiles (id, email, role, tenant_id)
       VALUES ($1, $2, 'strategaize_admin', NULL)
       ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, email = EXCLUDED.email`,
    [userId, email],
  );
  return { userId };
}

async function seedPartnerOrgTenant(
  client: Client,
  adminUserId: string,
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, created_by)
       VALUES ('MT6 Kanzlei', 'de', 'partner_organization', $1)
       RETURNING id`,
    [adminUserId],
  );
  const tenantId = res.rows[0].id;
  await client.query(
    `INSERT INTO public.partner_organization
       (tenant_id, legal_name, display_name, partner_kind, contact_email,
        country, created_by_admin_user_id)
       VALUES ($1, 'MT6 Kanzlei Legal', 'MT6 Kanzlei', 'tax_advisor',
               'mt6@kanzlei.local', 'DE', $2)`,
    [tenantId, adminUserId],
  );
  return tenantId;
}

async function seedDirectClientTenant(
  client: Client,
  adminUserId: string,
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, created_by)
       VALUES ('MT6 DirectClient', 'de', $1)
       RETURNING id`,
    [adminUserId],
  );
  return res.rows[0].id;
}

interface SeedInvitationParams {
  tenantId: string;
  invitedByUserId: string;
  token: string;
  roleHint: string | null;
  email: string;
  expiresInDays?: number;
  status?: "pending" | "accepted" | "revoked" | "expired";
}

async function seedInvitation(
  client: Client,
  p: SeedInvitationParams,
): Promise<string> {
  const expiresInDays = p.expiresInDays ?? 7;
  const status = p.status ?? "pending";
  const res = await client.query<{ id: string }>(
    `INSERT INTO public.employee_invitation
       (tenant_id, email, display_name, role_hint, invitation_token,
        invited_by_user_id, status, expires_at)
       VALUES ($1, $2, NULL, $3, $4, $5, $6,
               now() + ($7 || ' days')::interval)
       RETURNING id`,
    [
      p.tenantId,
      p.email,
      p.roleHint,
      p.token,
      p.invitedByUserId,
      status,
      expiresInDays.toString(),
    ],
  );
  return res.rows[0].id;
}

async function simulateAdminCreateUser(
  client: Client,
  params: { email: string; role: "employee" | "partner_admin"; tenantId: string },
): Promise<string> {
  // Genau, was admin.auth.admin.createUser an die DB schickt:
  // auth.users-INSERT mit raw_user_meta_data={role, tenant_id}.
  // handle_new_user-Trigger legt profile mit dieser role/tenant_id an.
  const res = await client.query<{ id: string }>(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, email_confirmed_at,
       created_at, updated_at
     )
     VALUES (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated', $1, 'x',
       '{}'::jsonb, $2::jsonb, now(),
       now(), now()
     )
     RETURNING id`,
    [
      params.email,
      JSON.stringify({ role: params.role, tenant_id: params.tenantId }),
    ],
  );
  return res.rows[0].id;
}

describe("acceptEmployeeInvitation — role_hint branch (V6 SLC-102 MT-6)", () => {
  it("happy partner_admin: SELECT findet role_hint, Trigger legt profile mit partner_admin an, RPC finalize setzt accepted", async () => {
    await withTestDb(async (client) => {
      const admin = await seedStrategaizeAdmin(client);
      const partnerTenantId = await seedPartnerOrgTenant(client, admin.userId);
      const inviteeEmail = `mt6-owner-${Math.random()
        .toString(36)
        .slice(2)}@kanzlei.local`;
      const invitationId = await seedInvitation(client, {
        tenantId: partnerTenantId,
        invitedByUserId: admin.userId,
        token: HEX_TOKEN_A,
        roleHint: "partner_admin",
        email: inviteeEmail,
      });

      // (1) Token-Lookup — exakt was actions.ts SELECT macht
      const inv = await client.query<{
        id: string;
        tenant_id: string;
        email: string;
        role_hint: string | null;
        status: string;
      }>(
        `SELECT id, tenant_id, email, role_hint, status
           FROM public.employee_invitation
          WHERE invitation_token = $1`,
        [HEX_TOKEN_A],
      );
      expect(inv.rowCount).toBe(1);
      expect(inv.rows[0].role_hint).toBe("partner_admin");
      expect(inv.rows[0].status).toBe("pending");

      // (2) Branch in actions.ts: acceptedRole = 'partner_admin'
      const newUserId = await simulateAdminCreateUser(client, {
        email: inviteeEmail,
        role: "partner_admin",
        tenantId: partnerTenantId,
      });

      // (3) handle_new_user-Trigger muss profile mit role+tenant_id angelegt haben
      const profile = await client.query<{ role: string; tenant_id: string }>(
        `SELECT role, tenant_id FROM public.profiles WHERE id = $1`,
        [newUserId],
      );
      expect(profile.rowCount).toBe(1);
      expect(profile.rows[0].role).toBe("partner_admin");
      expect(profile.rows[0].tenant_id).toBe(partnerTenantId);

      // (4) Finalize-RPC ist role-hint-agnostisch — setzt nur status+accepted_*
      const finalize = await client.query<{ finalize: Record<string, unknown> }>(
        `SELECT public.rpc_accept_employee_invitation_finalize($1, $2) AS finalize`,
        [invitationId, newUserId],
      );
      expect(finalize.rows[0].finalize).toEqual({ finalized: true });

      // (5) Invitation-Status nach finalize
      const finalInv = await client.query<{
        status: string;
        accepted_user_id: string | null;
      }>(
        `SELECT status, accepted_user_id FROM public.employee_invitation WHERE id = $1`,
        [invitationId],
      );
      expect(finalInv.rows[0].status).toBe("accepted");
      expect(finalInv.rows[0].accepted_user_id).toBe(newUserId);
    });
  });

  it("default employee (role_hint=NULL): Trigger legt profile mit role='employee' an — V4-Regression-Schutz", async () => {
    await withTestDb(async (client) => {
      const admin = await seedStrategaizeAdmin(client);
      const directTenantId = await seedDirectClientTenant(client, admin.userId);
      const inviteeEmail = `mt6-empl-${Math.random()
        .toString(36)
        .slice(2)}@firma.test`;
      const invitationId = await seedInvitation(client, {
        tenantId: directTenantId,
        invitedByUserId: admin.userId,
        token: HEX_TOKEN_B,
        roleHint: null,
        email: inviteeEmail,
      });

      // Token-Lookup: role_hint=NULL
      const inv = await client.query<{
        role_hint: string | null;
        status: string;
      }>(
        `SELECT role_hint, status
           FROM public.employee_invitation
          WHERE invitation_token = $1`,
        [HEX_TOKEN_B],
      );
      expect(inv.rowCount).toBe(1);
      expect(inv.rows[0].role_hint).toBeNull();

      // Branch: acceptedRole = 'employee'
      const newUserId = await simulateAdminCreateUser(client, {
        email: inviteeEmail,
        role: "employee",
        tenantId: directTenantId,
      });

      // Trigger legt profile mit role='employee' an
      const profile = await client.query<{ role: string; tenant_id: string }>(
        `SELECT role, tenant_id FROM public.profiles WHERE id = $1`,
        [newUserId],
      );
      expect(profile.rowCount).toBe(1);
      expect(profile.rows[0].role).toBe("employee");
      expect(profile.rows[0].tenant_id).toBe(directTenantId);

      // Finalize PASS (gleicher RPC fuer beide Pfade)
      const finalize = await client.query<{ finalize: Record<string, unknown> }>(
        `SELECT public.rpc_accept_employee_invitation_finalize($1, $2) AS finalize`,
        [invitationId, newUserId],
      );
      expect(finalize.rows[0].finalize).toEqual({ finalized: true });
    });
  });

  it("token-invalid: SELECT mit unbekanntem Token liefert rowCount=0 — Action liefert 'ungueltig oder bereits verwendet'", async () => {
    await withTestDb(async (client) => {
      const unknownToken = "f".repeat(64);
      const res = await client.query(
        `SELECT id FROM public.employee_invitation WHERE invitation_token = $1`,
        [unknownToken],
      );
      expect(res.rowCount).toBe(0);
    });
  });

  it("token-expired: finalize-RPC liefert {error: 'expired'} bei expires_at in der Vergangenheit", async () => {
    await withTestDb(async (client) => {
      const admin = await seedStrategaizeAdmin(client);
      const partnerTenantId = await seedPartnerOrgTenant(client, admin.userId);
      const inviteeEmail = `mt6-exp-${Math.random()
        .toString(36)
        .slice(2)}@kanzlei.local`;
      const invitationId = await seedInvitation(client, {
        tenantId: partnerTenantId,
        invitedByUserId: admin.userId,
        token: HEX_TOKEN_C,
        roleHint: "partner_admin",
        email: inviteeEmail,
        expiresInDays: -1, // bereits abgelaufen
      });

      // Bestaetigung der Setup-Bedingung: invitation ist in der Vergangenheit
      const inv = await client.query<{ status: string; expires_at: Date }>(
        `SELECT status, expires_at FROM public.employee_invitation WHERE id = $1`,
        [invitationId],
      );
      expect(inv.rows[0].status).toBe("pending"); // status noch pending
      expect(new Date(inv.rows[0].expires_at).getTime()).toBeLessThan(Date.now());

      // Wir simulieren KEIN auth.users-INSERT — ein realistischer Action-Pfad
      // wuerde an der expires_at-Pruefung (line 95-97 in actions.ts) bereits
      // mit Error abbrechen. Aber: falls dieser Check je entfernt wird, soll
      // die RPC als zweiter Layer den expired-Fall blocken. Wir verifizieren
      // hier den RPC-Layer mit einer beliebigen user_id (gleicher
      // strategaize_admin, beliebig).
      const finalize = await client.query<{ finalize: Record<string, unknown> }>(
        `SELECT public.rpc_accept_employee_invitation_finalize($1, $2) AS finalize`,
        [invitationId, admin.userId],
      );
      expect(finalize.rows[0].finalize).toEqual({ error: "expired" });

      // Invitation bleibt unveraendert
      const after = await client.query<{ status: string; accepted_user_id: string | null }>(
        `SELECT status, accepted_user_id FROM public.employee_invitation WHERE id = $1`,
        [invitationId],
      );
      expect(after.rows[0].status).toBe("pending");
      expect(after.rows[0].accepted_user_id).toBeNull();
    });
  });
});
