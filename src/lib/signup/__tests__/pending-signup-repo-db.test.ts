/**
 * SLC-132 MT-4 — DB-Contract-Tests fuer pending-signup-repo gegen Coolify-DB.
 *
 * Die Tests verifizieren das Schema-Contract auf dem die Repo-Functions in
 * `pending-signup-repo.ts` aufbauen:
 * - INSERT mit erforderlichen Spalten + auto-defaults (status='pending',
 *   dsgvo_consent_accepted_at=now(), created_at=now()).
 * - Active-Filter (status='pending' AND expires_at > now()).
 * - Token-Hash-Lookup (verify_token_hash + status='pending' Filter).
 * - 24h-TTL-Default (Caller-berechnete expires_at trifft now()+24h).
 * - UNIQUE-Constraint pending_signup_partner_email_unique_pending (nur eine
 *   pending-Row pro (partner_tenant_id, email_lower)).
 * - Expired-Filter (Active-Lookup skipt Rows mit expires_at < now()).
 *
 * Pattern: raw pg in BEGIN..ROLLBACK Transaction via withTestDb. SAVEPOINT
 * fuer erwarteten UNIQUE-Violation-Catch (sonst wird die ganze Tx aborted
 * und das nachfolgende ROLLBACK schlaegt fehl, siehe coolify-test-setup.md).
 *
 * Die Repo-Functions selbst nutzen `createAdminClient()` (service_role), das
 * im Test-Container kein lauffaehiges ENV-Setup hat — SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY fehlen. Aus diesem Grund testen wir hier den
 * DB-Contract, den die Service-Role-Queries treffen (RLS gebypasst sowieso
 * weil service_role + postgres-Superuser identisch durch die Constraints
 * laufen).
 */

import { describe, it, expect } from "vitest";
import { createHash, randomBytes } from "node:crypto";

import { withTestDb } from "@/test/db";

const TEST_PREFIX = "SLC-132-MT4";

interface SeededPartner {
  tenant_id: string;
}

async function seedPartnerTenant(
  client: import("pg").Client,
  label: string
): Promise<SeededPartner> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language, tenant_kind, parent_partner_tenant_id)
       VALUES ($1, 'de', 'partner_organization', NULL)
       RETURNING id`,
    [`${TEST_PREFIX} ${label} ${Date.now()}`]
  );
  return { tenant_id: res.rows[0].id };
}

function makeTokenHash(salt: string): string {
  // Deterministic-but-unique per call so tests cannot collide on the
  // token-hash-lookup partial index.
  return createHash("sha256")
    .update(`${TEST_PREFIX}-${salt}-${randomBytes(8).toString("hex")}`)
    .digest("hex");
}

describe("pending_signup INSERT contract (MT-4)", () => {
  it("happy path: insert with required cols + 24h expires_at + status='pending' default", async () => {
    await withTestDb(async (client) => {
      const partner = await seedPartnerTenant(client, "happy-insert");
      const tokenHash = makeTokenHash("happy");
      const ttlHours = 24;
      const expiresAtIso = new Date(
        Date.now() + ttlHours * 60 * 60 * 1000
      ).toISOString();

      const insertRes = await client.query<{
        id: string;
        expires_at: string;
        status: string;
        created_at: string;
        dsgvo_consent_accepted_at: string;
      }>(
        `INSERT INTO public.pending_signup (
           partner_tenant_id, email_lower, first_name, last_name, company_name,
           dsgvo_consent_text_version, verify_token_hash, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, expires_at, status, created_at, dsgvo_consent_accepted_at`,
        [
          partner.tenant_id,
          "alice@example.com",
          "Alice",
          "Mueller",
          "Acme GmbH",
          "v1-2026-05",
          tokenHash,
          expiresAtIso,
        ]
      );

      const row = insertRes.rows[0];
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(row.status).toBe("pending");
      expect(row.created_at).toBeTruthy();
      expect(row.dsgvo_consent_accepted_at).toBeTruthy();

      // 24h-Drift-Check: expires_at - now() ~= 24h, +/- 5s tolerance.
      const expiresMs = new Date(row.expires_at).getTime();
      const expectedMs = Date.now() + 24 * 60 * 60 * 1000;
      expect(Math.abs(expiresMs - expectedMs)).toBeLessThan(5000);
    });
  });
});

describe("findActivePendingSignup contract — pending + not-expired filter", () => {
  it("returns the row when status='pending' AND expires_at > now()", async () => {
    await withTestDb(async (client) => {
      const partner = await seedPartnerTenant(client, "find-active");
      const tokenHash = makeTokenHash("find-active");
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await client.query(
        `INSERT INTO public.pending_signup
           (partner_tenant_id, email_lower, first_name, last_name, company_name,
            dsgvo_consent_text_version, verify_token_hash, expires_at)
         VALUES ($1, $2, 'Bob', 'Schmidt', NULL, 'v1-2026-05', $3, $4)`,
        [partner.tenant_id, "bob@example.com", tokenHash, future]
      );

      // Mirrors findActivePendingSignup SQL.
      const res = await client.query(
        `SELECT id, status FROM public.pending_signup
           WHERE partner_tenant_id = $1
             AND email_lower = $2
             AND status = 'pending'
             AND expires_at > now()`,
        [partner.tenant_id, "bob@example.com"]
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].status).toBe("pending");
    });
  });

  it("returns no row when only an expired pending row exists (Active-Filter skips it)", async () => {
    await withTestDb(async (client) => {
      const partner = await seedPartnerTenant(client, "expired-skip");
      const tokenHash = makeTokenHash("expired-skip");
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      await client.query(
        `INSERT INTO public.pending_signup
           (partner_tenant_id, email_lower, first_name, last_name, company_name,
            dsgvo_consent_text_version, verify_token_hash, expires_at)
         VALUES ($1, $2, 'Carla', 'Lopez', NULL, 'v1-2026-05', $3, $4)`,
        [partner.tenant_id, "carla@example.com", tokenHash, past]
      );

      const res = await client.query(
        `SELECT id FROM public.pending_signup
           WHERE partner_tenant_id = $1
             AND email_lower = $2
             AND status = 'pending'
             AND expires_at > now()`,
        [partner.tenant_id, "carla@example.com"]
      );
      expect(res.rows).toHaveLength(0);
    });
  });
});

describe("findPendingByTokenHash contract — token-hash lookup", () => {
  it("returns the row for a valid pending token hash; ignores expired", async () => {
    await withTestDb(async (client) => {
      const partner = await seedPartnerTenant(client, "by-hash");
      const activeHash = makeTokenHash("active");
      const expiredHash = makeTokenHash("expired");
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      await client.query(
        `INSERT INTO public.pending_signup
           (partner_tenant_id, email_lower, first_name, last_name, company_name,
            dsgvo_consent_text_version, verify_token_hash, expires_at)
         VALUES
           ($1, 'dora@example.com', 'Dora', 'Akin', NULL, 'v1-2026-05', $2, $3),
           ($1, 'eva@example.com',  'Eva',  'Akin', NULL, 'v1-2026-05', $4, $5)`,
        [partner.tenant_id, activeHash, future, expiredHash, past]
      );

      // Mirrors findPendingByTokenHash SQL.
      const activeRes = await client.query(
        `SELECT id, email_lower FROM public.pending_signup
           WHERE verify_token_hash = $1
             AND status = 'pending'
             AND expires_at > now()`,
        [activeHash]
      );
      expect(activeRes.rows).toHaveLength(1);
      expect(activeRes.rows[0].email_lower).toBe("dora@example.com");

      const expiredRes = await client.query(
        `SELECT id FROM public.pending_signup
           WHERE verify_token_hash = $1
             AND status = 'pending'
             AND expires_at > now()`,
        [expiredHash]
      );
      expect(expiredRes.rows).toHaveLength(0);
    });
  });
});

describe("UNIQUE constraint pending_signup_partner_email_unique_pending", () => {
  it("rejects a second pending row for the same (partner_tenant_id, email_lower)", async () => {
    await withTestDb(async (client) => {
      const partner = await seedPartnerTenant(client, "unique-violation");
      const tokenHash1 = makeTokenHash("unique-1");
      const tokenHash2 = makeTokenHash("unique-2");
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      // First insert succeeds.
      await client.query(
        `INSERT INTO public.pending_signup
           (partner_tenant_id, email_lower, first_name, last_name, company_name,
            dsgvo_consent_text_version, verify_token_hash, expires_at)
         VALUES ($1, $2, 'Fran', 'Test', NULL, 'v1-2026-05', $3, $4)`,
        [partner.tenant_id, "frank@example.com", tokenHash1, future]
      );

      // Second insert with same (partner_tenant_id, email_lower) + status='pending'
      // must hit the partial UNIQUE index. SAVEPOINT ist Pflicht damit das
      // Outer-ROLLBACK in withTestDb nicht selbst fehlschlaegt
      // (coolify-test-setup.md).
      let errorCode: string | null = null;
      await client.query("SAVEPOINT try_dup_insert");
      try {
        await client.query(
          `INSERT INTO public.pending_signup
             (partner_tenant_id, email_lower, first_name, last_name, company_name,
              dsgvo_consent_text_version, verify_token_hash, expires_at)
           VALUES ($1, $2, 'Fran2', 'Test2', NULL, 'v1-2026-05', $3, $4)`,
          [partner.tenant_id, "frank@example.com", tokenHash2, future]
        );
      } catch (e) {
        errorCode = (e as { code?: string }).code ?? null;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_dup_insert");

      // Postgres unique_violation
      expect(errorCode).toBe("23505");
    });
  });

  it("allows re-signup after expiry (UNIQUE-Filter only matches status='pending')", async () => {
    await withTestDb(async (client) => {
      const partner = await seedPartnerTenant(client, "re-signup");
      const tokenHash1 = makeTokenHash("re-signup-old");
      const tokenHash2 = makeTokenHash("re-signup-new");
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      // Old row marked as expired (status='expired') — Cron-Cleanup-Sim.
      await client.query(
        `INSERT INTO public.pending_signup
           (partner_tenant_id, email_lower, first_name, last_name, company_name,
            dsgvo_consent_text_version, verify_token_hash, expires_at, status)
         VALUES ($1, $2, 'Gina', 'Old', NULL, 'v1-2026-05', $3, $4, 'expired')`,
        [partner.tenant_id, "gina@example.com", tokenHash1, past]
      );

      // New pending row for same partner+email must succeed because the
      // partial UNIQUE-Filter (WHERE status='pending') excludes the
      // expired-Row.
      const newRes = await client.query<{ id: string }>(
        `INSERT INTO public.pending_signup
           (partner_tenant_id, email_lower, first_name, last_name, company_name,
            dsgvo_consent_text_version, verify_token_hash, expires_at)
         VALUES ($1, $2, 'Gina', 'New', NULL, 'v1-2026-05', $3, $4)
         RETURNING id`,
        [partner.tenant_id, "gina@example.com", tokenHash2, future]
      );
      expect(newRes.rows).toHaveLength(1);
    });
  });
});
