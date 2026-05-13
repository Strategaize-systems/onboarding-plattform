import { describe, it, expect } from "vitest";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";

// V6 SLC-104 MT-10 — RPC rpc_get_branding_for_tenant gegen Live-Coolify-DB.
//
// Verifiziert:
//   1) Tenant-Kind-Logik (partner_organization / partner_client / direct_client / non-existent)
//   2) DEC-109-Tradeoff: alle 4 Auth-Konstellationen (anon, strategaize_admin,
//      partner_admin, tenant_admin) erhalten fuer denselben Tenant-Input dasselbe
//      Resultat (RPC ist SECURITY DEFINER ohne Auth-Check, GRANT EXECUTE auf anon).
//   3) Edge-Cases (NULL-Input, partner ohne branding-row, partner_client ohne parent)
//   4) R-091-4 Security-Properties (SECURITY DEFINER + SET search_path + STABLE)
//
// Pattern: BEGIN/ROLLBACK pro Test via withTestDb, withJwtContext fuer Role+JWT-Switch,
// SAVEPOINT-aequivalent (RESET ROLE/Claims im finally) — analog v5-walkthrough-rls.test.ts.

interface BrandingResult {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string | null;
  display_name: string | null;
}

interface BrandingFixture {
  partner: string;        // partner_organization mit custom branding
  client: string;         // partner_client unter `partner`
  direct: string;         // direct_client
  nonexistent: string;    // UUID die nicht in tenants existiert
  strategaizeAdmin: string;
  partnerAdmin: string;   // partner_admin von `partner`
  tenantAdmin: string;    // tenant_admin von `client`
  customColor: string;
  customDisplayName: string;
}

// Strategaize-Default-Branding fuer Direkt-Kunden / NULL / non-existent.
// primary_color = '#4454b8' nach Migration 091a (Style-Guide-V2-Alignment, MT-6).
// Migration 091-Original hatte '#2563eb' — 091a hat die RPC mit ALTER FUNCTION
// auf den korrekten Style-Guide-V2-Indigo-500 angepasst.
const STRATEGAIZE_DEFAULT: BrandingResult = {
  logo_url: null,
  primary_color: "#4454b8",
  secondary_color: null,
  display_name: "Strategaize",
};

async function seedBrandingFixture(client: Client): Promise<BrandingFixture> {
  // Partner-Tenant
  const tP = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind)
     VALUES ('RPC-Branding Partner ' || substr(gen_random_uuid()::text, 1, 8), 'de', 'partner_organization')
     RETURNING id`,
  );
  const partner = tP.rows[0].id;

  // Partner-Client unter Partner
  const tC = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
     VALUES ('RPC-Branding Client ' || substr(gen_random_uuid()::text, 1, 8), 'de', 'partner_client', $1)
     RETURNING id`,
    [partner],
  );
  const clientTenant = tC.rows[0].id;

  // Direkt-Kunde
  const tD = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind)
     VALUES ('RPC-Branding Direct ' || substr(gen_random_uuid()::text, 1, 8), 'de', 'direct_client')
     RETURNING id`,
  );
  const direct = tD.rows[0].id;

  // Nicht-existenter Tenant — random UUID, niemals inserted.
  const nonExistentRes = await client.query<{ id: string }>(`SELECT gen_random_uuid() AS id`);
  const nonexistent = nonExistentRes.rows[0].id;

  // User-Anlage (auth.users + handle_new_user-Trigger erzeugt profiles)
  async function mkUser(
    label: string,
    role: "strategaize_admin" | "partner_admin" | "tenant_admin",
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
         $1 || '-' || substr(gen_random_uuid()::text, 1, 8) || '@rpcbranding.test', '',
         '{}'::jsonb, $2::jsonb,
         now(), now()
       )
       RETURNING id`,
      [label, JSON.stringify(metadata)],
    );
    return res.rows[0].id;
  }

  const strategaizeAdmin = await mkUser("rpcbranding-sa", "strategaize_admin", null);
  await client.query(
    `UPDATE public.profiles SET role='strategaize_admin', tenant_id=NULL WHERE id=$1`,
    [strategaizeAdmin],
  );

  const partnerAdmin = await mkUser("rpcbranding-pa", "partner_admin", partner);
  const tenantAdmin = await mkUser("rpcbranding-ta", "tenant_admin", clientTenant);

  // Custom Branding fuer Partner. Da partner_branding_config-Backfill nur einmalig
  // beim Migration-Apply lief und NICHT als Trigger, hat dieser frisch erzeugte
  // Partner-Tenant noch keine Branding-Row. Wir INSERTen sie hier explizit.
  const customColor = "#10b981"; // emerald-500 — eindeutig anders als Strategaize-Default #2563eb
  const customDisplayName = "Custom RPC Partner";
  await client.query(
    `INSERT INTO public.partner_branding_config (partner_tenant_id, primary_color, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (partner_tenant_id) DO UPDATE
       SET primary_color = EXCLUDED.primary_color,
           display_name  = EXCLUDED.display_name`,
    [partner, customColor, customDisplayName],
  );

  return {
    partner,
    client: clientTenant,
    direct,
    nonexistent,
    strategaizeAdmin,
    partnerAdmin,
    tenantAdmin,
    customColor,
    customDisplayName,
  };
}

/**
 * Ruft die RPC im aktuellen Session-Kontext auf und liefert das JSONB-Ergebnis
 * als TypeScript-Objekt zurueck. pg-Driver dekodiert JSONB automatisch.
 */
async function callRpc(client: Client, tenantId: string | null): Promise<BrandingResult> {
  const r = await client.query<{ branding: BrandingResult }>(
    `SELECT public.rpc_get_branding_for_tenant($1::uuid) AS branding`,
    [tenantId],
  );
  return r.rows[0].branding;
}

/**
 * Setzt die Session-Rolle auf `anon` ohne JWT-Claims (Login-Page-Szenario).
 * Wird automatisch durch withTestDb-ROLLBACK zurueckgesetzt; RESET im finally
 * stellt Superuser-Kontext fuer Folge-Queries innerhalb desselben Tests wieder her.
 */
async function withAnonRole(client: Client, fn: () => Promise<void>): Promise<void> {
  await client.query(`SET LOCAL "request.jwt.claims" = '{}'`);
  await client.query(`SET LOCAL ROLE anon`);
  try {
    await fn();
  } finally {
    await client.query(`RESET ROLE`);
    await client.query(`RESET "request.jwt.claims"`);
  }
}

// ============================================================================
// 16-Faelle-Matrix: 4 Tenant-Kinds × 4 Auth-Konstellationen
// ============================================================================
// Erwartung:
//   - partner_organization  → custom branding (eigene Row)
//   - partner_client        → custom branding (Parent-Resolution)
//   - direct_client         → Strategaize default
//   - non-existent          → Strategaize default
//   - alle 4 Auth-Kontexte fuer denselben Input liefern dasselbe Ergebnis
//     (DEC-109: RPC ist best-effort lesbar, anon hat EXECUTE, kein Auth-Check)

type AuthMode = "anon" | "strategaize_admin" | "partner_admin" | "tenant_admin";
type TenantKind = "partner_organization" | "partner_client" | "direct_client" | "non_existent";
type ExpectedKind = "custom" | "default";

interface MatrixCase {
  tenantKind: TenantKind;
  auth: AuthMode;
  expected: ExpectedKind;
}

const MATRIX_CASES: MatrixCase[] = [
  // partner_organization → custom
  { tenantKind: "partner_organization", auth: "anon",              expected: "custom" },
  { tenantKind: "partner_organization", auth: "strategaize_admin", expected: "custom" },
  { tenantKind: "partner_organization", auth: "partner_admin",     expected: "custom" },
  { tenantKind: "partner_organization", auth: "tenant_admin",      expected: "custom" },
  // partner_client → custom (Parent-Resolution)
  { tenantKind: "partner_client",       auth: "anon",              expected: "custom" },
  { tenantKind: "partner_client",       auth: "strategaize_admin", expected: "custom" },
  { tenantKind: "partner_client",       auth: "partner_admin",     expected: "custom" },
  { tenantKind: "partner_client",       auth: "tenant_admin",      expected: "custom" },
  // direct_client → default
  { tenantKind: "direct_client",        auth: "anon",              expected: "default" },
  { tenantKind: "direct_client",        auth: "strategaize_admin", expected: "default" },
  { tenantKind: "direct_client",        auth: "partner_admin",     expected: "default" },
  { tenantKind: "direct_client",        auth: "tenant_admin",      expected: "default" },
  // non_existent → default
  { tenantKind: "non_existent",         auth: "anon",              expected: "default" },
  { tenantKind: "non_existent",         auth: "strategaize_admin", expected: "default" },
  { tenantKind: "non_existent",         auth: "partner_admin",     expected: "default" },
  { tenantKind: "non_existent",         auth: "tenant_admin",      expected: "default" },
];

function pickTenantId(fx: BrandingFixture, kind: TenantKind): string {
  switch (kind) {
    case "partner_organization": return fx.partner;
    case "partner_client":       return fx.client;
    case "direct_client":        return fx.direct;
    case "non_existent":         return fx.nonexistent;
  }
}

function pickUserId(fx: BrandingFixture, auth: Exclude<AuthMode, "anon">): string {
  switch (auth) {
    case "strategaize_admin": return fx.strategaizeAdmin;
    case "partner_admin":     return fx.partnerAdmin;
    case "tenant_admin":      return fx.tenantAdmin;
  }
}

describe("V6 SLC-104 MT-10 — rpc_get_branding_for_tenant (Tenant × Auth Matrix, 16 cases)", () => {
  it.each(MATRIX_CASES)(
    "tenant_kind=$tenantKind / auth=$auth → expects $expected branding",
    async ({ tenantKind, auth, expected }) => {
      await withTestDb(async (client) => {
        const fx = await seedBrandingFixture(client);
        const tenantId = pickTenantId(fx, tenantKind);

        const verify = async (): Promise<void> => {
          const result = await callRpc(client, tenantId);
          if (expected === "custom") {
            expect(result.primary_color).toBe(fx.customColor);
            expect(result.display_name).toBe(fx.customDisplayName);
            expect(result.logo_url).toBeNull();
            expect(result.secondary_color).toBeNull();
          } else {
            expect(result).toEqual(STRATEGAIZE_DEFAULT);
          }
        };

        if (auth === "anon") {
          await withAnonRole(client, verify);
        } else {
          await withJwtContext(client, pickUserId(fx, auth), verify);
        }
      });
    },
  );
});

// ============================================================================
// Edge Cases & Logik-Branches (zusaetzlich zur 16-Faelle-Matrix)
// ============================================================================

describe("V6 SLC-104 MT-10 — rpc_get_branding_for_tenant (Edge Cases)", () => {
  it("NULL-Input → Strategaize default (Branch a)", async () => {
    await withTestDb(async (client) => {
      const result = await callRpc(client, null);
      expect(result).toEqual(STRATEGAIZE_DEFAULT);
    });
  });

  it("partner_organization ohne partner_branding_config-Row → Strategaize default (Branch e, NOT FOUND)", async () => {
    await withTestDb(async (client) => {
      const tP = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name, language, tenant_kind)
         VALUES ('RPC-Branding NoConfig ' || substr(gen_random_uuid()::text, 1, 8), 'de', 'partner_organization')
         RETURNING id`,
      );
      const partnerNoBranding = tP.rows[0].id;
      // Bewusst KEIN INSERT in partner_branding_config — simuliert Backfill-Miss / Edge-Case.

      const result = await callRpc(client, partnerNoBranding);
      expect(result).toEqual(STRATEGAIZE_DEFAULT);
    });
  });

  it("partner_client ohne parent_partner_tenant_id ist per CHECK-Constraint verhindert (RPC-ELSE-Branch ist defensive Coverage)", async () => {
    // Die RPC enthaelt einen ELSE-Branch fuer den Fall, dass ein partner_client
    // einen NULL-parent hat. In Praxis ist diese Konstellation per CHECK-Constraint
    // `tenants_parent_partner_consistency` ausgeschlossen, d.h. die Defense-in-Depth
    // im RPC ist de-facto unreachable. Dieser Test verifiziert, dass der Constraint
    // greift — und dokumentiert die ungehaengte RPC-Branch als bewusste Defensive-Coding-
    // Massnahme.
    await withTestDb(async (client) => {
      await client.query("SAVEPOINT rls_dml");
      let errorMessage: string | null = null;
      try {
        await client.query(
          `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
           VALUES ('RPC-Branding Orphan ' || substr(gen_random_uuid()::text, 1, 8), 'de', 'partner_client', NULL)`,
        );
      } catch (e) {
        errorMessage = (e as Error).message;
      }
      try {
        await client.query("ROLLBACK TO SAVEPOINT rls_dml");
      } catch {
        // already rolled back
      }
      expect(errorMessage).not.toBeNull();
      expect(errorMessage).toMatch(/tenants_parent_partner_consistency/);
    });
  });

  it("partner_client mit Parent ohne branding-row → Strategaize default (Branch e, parent NOT FOUND)", async () => {
    await withTestDb(async (client) => {
      const tP = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name, language, tenant_kind)
         VALUES ('RPC-Branding ParentNoConfig ' || substr(gen_random_uuid()::text, 1, 8), 'de', 'partner_organization')
         RETURNING id`,
      );
      const parentNoBranding = tP.rows[0].id;

      const tC = await client.query<{ id: string }>(
        `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
         VALUES ('RPC-Branding ChildOfNoConfig ' || substr(gen_random_uuid()::text, 1, 8), 'de', 'partner_client', $1)
         RETURNING id`,
        [parentNoBranding],
      );
      const childOfNoBranding = tC.rows[0].id;

      const result = await callRpc(client, childOfNoBranding);
      expect(result).toEqual(STRATEGAIZE_DEFAULT);
    });
  });
});

// ============================================================================
// R-091-4: Search-Path-Attack-Mitigation + Security-Properties
// ============================================================================
// Verifiziert die Function-Definition-Properties via pg_proc/pg_catalog.
// Voller Attack-Simulationstest (eigene Schema-Definition + Pfad-Wechsel)
// ist Overkill — proconfig-Verifikation ist die akzeptierte Form (vgl. SLC-091).

describe("V6 SLC-104 MT-10 — rpc_get_branding_for_tenant (R-091-4 Security Properties)", () => {
  it("Function is SECURITY DEFINER (prosecdef = true)", async () => {
    await withTestDb(async (client) => {
      const r = await client.query<{ prosecdef: boolean }>(
        `SELECT p.prosecdef
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'rpc_get_branding_for_tenant'`,
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].prosecdef).toBe(true);
    });
  });

  it("Function has SET search_path = public, auth (proconfig)", async () => {
    await withTestDb(async (client) => {
      const r = await client.query<{ proconfig: string[] | null }>(
        `SELECT p.proconfig
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'rpc_get_branding_for_tenant'`,
      );
      expect(r.rowCount).toBe(1);
      // proconfig ist ein text[] mit Eintraegen wie "search_path=public, auth".
      // Wir akzeptieren beide Reihenfolgen + optionale Spaces, weil PG die Werte
      // beim CREATE normalisiert.
      expect(r.rows[0].proconfig).not.toBeNull();
      const searchPathEntry = (r.rows[0].proconfig ?? []).find((c) =>
        c.startsWith("search_path="),
      );
      expect(searchPathEntry).toBeDefined();
      expect(searchPathEntry).toMatch(/public/);
      expect(searchPathEntry).toMatch(/auth/);
    });
  });

  it("Function is STABLE (provolatile = 's')", async () => {
    await withTestDb(async (client) => {
      const r = await client.query<{ provolatile: string }>(
        `SELECT p.provolatile
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'rpc_get_branding_for_tenant'`,
      );
      expect(r.rowCount).toBe(1);
      // 'i' = IMMUTABLE, 's' = STABLE, 'v' = VOLATILE
      expect(r.rows[0].provolatile).toBe("s");
    });
  });

  it("Function has EXECUTE granted to anon, authenticated, service_role", async () => {
    await withTestDb(async (client) => {
      const r = await client.query<{ has: boolean; role: string }>(
        `SELECT has_function_privilege(rolname, 'public.rpc_get_branding_for_tenant(uuid)', 'EXECUTE') AS has,
                rolname AS role
           FROM pg_roles
          WHERE rolname IN ('anon', 'authenticated', 'service_role')
          ORDER BY rolname`,
      );
      expect(r.rowCount).toBe(3);
      for (const row of r.rows) {
        expect(row.has, `EXECUTE granted to ${row.role}`).toBe(true);
      }
    });
  });
});
