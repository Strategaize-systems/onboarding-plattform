/**
 * V7 SLC-135 MT-1 — Vitest 5 Cases gegen `GET /api/cron/pending-signup-cleanup`.
 *
 * Tests laufen gegen die Coolify-Postgres-DB im node:20-Container
 * (per `.claude/rules/coolify-test-setup.md`). Email-Send ist gemockt (Audit-
 * Logger schreibt echte error_log-Rows ueber captureInfo → DB).
 *
 * Pflicht-ENV im Test-Container:
 *   - TEST_DATABASE_URL    — direkte Postgres-Connection (fixture + assert)
 *   - SUPABASE_URL         — Kong-internal-URL fuer createAdminClient
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - CRON_SECRET wird im Test gesetzt + am Ende restored
 *
 * Cleanup-Strategie: jeder Test legt seine eigenen `v7-pentest-...`-Partner
 * an und ruft `cleanupAllPentestArtifacts()` in afterAll. pending_signup-Rows
 * sind via partner_tenant_id FK + ON DELETE CASCADE auto-aufgeraeumt.
 */

import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { GET } from "../route";
import {
  cleanupAllPentestArtifacts,
  fetchAuditLogRows,
  openTestDbClient,
  setupTestPartner,
  type TestPartner,
} from "@/test/v7-signup-fixture";

const CRON_TEST_SECRET = "cleanup-test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function withCronSecret(value?: string): {
  restore: () => void;
} {
  const previous = process.env.CRON_SECRET;
  if (value === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = value;
  }
  return {
    restore: () => {
      if (previous === undefined) {
        delete process.env.CRON_SECRET;
      } else {
        process.env.CRON_SECRET = previous;
      }
    },
  };
}

function buildRequest(secretHeader?: string | null): Request {
  const headers: Record<string, string> = {};
  if (secretHeader !== null && secretHeader !== undefined) {
    headers["x-cron-secret"] = secretHeader;
  }
  return new Request(
    "http://localhost/api/cron/pending-signup-cleanup",
    { method: "GET", headers }
  );
}

/**
 * Schreibt eine pending_signup-Row direkt mit voll kontrolliertem Timing.
 * Erlaubt es, sowohl `expires_at` als auch `created_at` in die Vergangenheit
 * zu setzen (setupTestPendingSignup-Helper kann nur ttlHours).
 */
async function insertPendingSignup(
  client: Client,
  args: {
    partner_tenant_id: string;
    email_lower: string;
    expires_at_iso: string;
    created_at_iso?: string;
    status?: "pending" | "verified" | "expired";
    verified_at_iso?: string | null;
  }
): Promise<string> {
  const status = args.status ?? "pending";
  const token_hash = randomBytes(32).toString("hex");

  if (args.created_at_iso) {
    const res = await client.query<{ id: string }>(
      `INSERT INTO pending_signup
         (partner_tenant_id, email_lower, first_name, last_name, company_name,
          dsgvo_consent_text_version, verify_token_hash, expires_at, status,
          verified_at, created_at)
       VALUES ($1, $2, 'V7', 'CleanupTest', NULL, 'v1-2026-05', $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        args.partner_tenant_id,
        args.email_lower.toLowerCase(),
        token_hash,
        args.expires_at_iso,
        status,
        args.verified_at_iso ?? null,
        args.created_at_iso,
      ]
    );
    return res.rows[0].id;
  }

  const res = await client.query<{ id: string }>(
    `INSERT INTO pending_signup
       (partner_tenant_id, email_lower, first_name, last_name, company_name,
        dsgvo_consent_text_version, verify_token_hash, expires_at, status,
        verified_at)
     VALUES ($1, $2, 'V7', 'CleanupTest', NULL, 'v1-2026-05', $3, $4, $5, $6)
     RETURNING id`,
    [
      args.partner_tenant_id,
      args.email_lower.toLowerCase(),
      token_hash,
      args.expires_at_iso,
      status,
      args.verified_at_iso ?? null,
    ]
  );
  return res.rows[0].id;
}

async function fetchPendingSignupStatus(
  client: Client,
  id: string
): Promise<string | null> {
  const res = await client.query<{ status: string }>(
    `SELECT status FROM pending_signup WHERE id = $1`,
    [id]
  );
  return res.rows[0]?.status ?? null;
}

async function fetchPendingSignupExists(
  client: Client,
  id: string
): Promise<boolean> {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM pending_signup WHERE id = $1`,
    [id]
  );
  return res.rows.length > 0;
}

describe("V7 SLC-135 MT-1 — GET /api/cron/pending-signup-cleanup (5 Cases)", () => {
  let partner: TestPartner;
  let secretHandle: { restore: () => void };

  beforeAll(async () => {
    await cleanupAllPentestArtifacts();
    partner = await setupTestPartner();
    secretHandle = withCronSecret(CRON_TEST_SECRET);
  });

  afterEach(async () => {
    // Nach jedem Test: Pending-Rows fuer diesen Partner wegputzen,
    // damit nachfolgende Tests deterministische Counts haben.
    const db = await openTestDbClient();
    try {
      await db.query(
        `DELETE FROM pending_signup WHERE partner_tenant_id = $1`,
        [partner.tenant_id]
      );
    } finally {
      await db.end();
    }
  });

  afterAll(async () => {
    secretHandle.restore();
    await cleanupAllPentestArtifacts();
  });

  it("Case 1 — ohne CRON_SECRET-Header → 403", async () => {
    const res = await GET(buildRequest());
    expect(res.status).toBe(403);
  });

  it("Case 2 — Pending mit expires_at < now() → status='expired', expired_count > 0", async () => {
    const db = await openTestDbClient();
    let pendingId: string;
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      pendingId = await insertPendingSignup(db, {
        partner_tenant_id: partner.tenant_id,
        email_lower: `cleanup-expire-${randomBytes(4).toString("hex")}@example.test`,
        expires_at_iso: oneHourAgo,
        status: "pending",
      });
    } finally {
      await db.end();
    }

    const res = await GET(buildRequest(CRON_TEST_SECRET));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      expired_count: number;
      deleted_count: number;
    };
    expect(body.ok).toBe(true);
    expect(body.expired_count).toBeGreaterThanOrEqual(1);

    const assertDb = await openTestDbClient();
    try {
      const status = await fetchPendingSignupStatus(assertDb, pendingId);
      expect(status).toBe("expired");
    } finally {
      await assertDb.end();
    }
  });

  it("Case 3 — Expired + verified_at NULL + created_at > 7d → DELETE", async () => {
    const db = await openTestDbClient();
    let oldExpiredId: string;
    let recentExpiredId: string;
    try {
      const eightDaysAgo = new Date(
        Date.now() - 8 * 24 * 60 * 60 * 1000
      ).toISOString();
      const twoDaysAgo = new Date(
        Date.now() - 2 * 24 * 60 * 60 * 1000
      ).toISOString();

      // Old row: muss geloescht werden.
      oldExpiredId = await insertPendingSignup(db, {
        partner_tenant_id: partner.tenant_id,
        email_lower: `cleanup-old-${randomBytes(4).toString("hex")}@example.test`,
        expires_at_iso: eightDaysAgo,
        created_at_iso: eightDaysAgo,
        status: "expired",
        verified_at_iso: null,
      });

      // Recent row: bleibt (created_at < 7d).
      recentExpiredId = await insertPendingSignup(db, {
        partner_tenant_id: partner.tenant_id,
        email_lower: `cleanup-recent-${randomBytes(4).toString("hex")}@example.test`,
        expires_at_iso: twoDaysAgo,
        created_at_iso: twoDaysAgo,
        status: "expired",
        verified_at_iso: null,
      });
    } finally {
      await db.end();
    }

    const res = await GET(buildRequest(CRON_TEST_SECRET));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      expired_count: number;
      deleted_count: number;
    };
    expect(body.deleted_count).toBeGreaterThanOrEqual(1);

    const assertDb = await openTestDbClient();
    try {
      expect(await fetchPendingSignupExists(assertDb, oldExpiredId)).toBe(false);
      expect(await fetchPendingSignupExists(assertDb, recentExpiredId)).toBe(true);
    } finally {
      await assertDb.end();
    }
  });

  it("Case 4 — Idempotent: zweiter Aufruf ohne neue Daten → counts=0", async () => {
    const db = await openTestDbClient();
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await insertPendingSignup(db, {
        partner_tenant_id: partner.tenant_id,
        email_lower: `cleanup-idem-${randomBytes(4).toString("hex")}@example.test`,
        expires_at_iso: oneHourAgo,
        status: "pending",
      });
    } finally {
      await db.end();
    }

    // Erster Run: expired_count >= 1
    const firstRes = await GET(buildRequest(CRON_TEST_SECRET));
    const firstBody = (await firstRes.json()) as {
      expired_count: number;
      deleted_count: number;
    };
    expect(firstBody.expired_count).toBeGreaterThanOrEqual(1);

    // Zweiter Run: counts=0 (alle pending bereits 'expired', kein neuer
    // expire-Kandidat. DELETE-Pfad findet nichts > 7d alt.)
    const secondRes = await GET(buildRequest(CRON_TEST_SECRET));
    expect(secondRes.status).toBe(200);
    const secondBody = (await secondRes.json()) as {
      expired_count: number;
      deleted_count: number;
    };
    expect(secondBody.expired_count).toBe(0);
    expect(secondBody.deleted_count).toBe(0);
  });

  it("Case 5 — Audit-Log error_log Eintrag mit category='pending_signup_cleanup'", async () => {
    const since = new Date();

    // Klein-Test ohne Daten: Counts=0, aber Audit-Log-Insert findet trotzdem statt.
    const res = await GET(buildRequest(CRON_TEST_SECRET));
    expect(res.status).toBe(200);

    // logToDb ist non-blocking (.catch(() => {})), kurz warten bis Insert sichtbar.
    await new Promise((r) => setTimeout(r, 500));

    const rows = await fetchAuditLogRows("pending_signup_cleanup", since);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const latest = rows[rows.length - 1];
    expect(latest.level).toBe("info");
    expect(latest.source).toBe("cron:pending-signup-cleanup");
    expect(latest.metadata).toMatchObject({
      category: "pending_signup_cleanup",
      expired_count: expect.any(Number),
      deleted_count: expect.any(Number),
    });
  });
});
