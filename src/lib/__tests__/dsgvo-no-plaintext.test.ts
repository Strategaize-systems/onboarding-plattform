/**
 * V7 SLC-134 MT-6 — DSGVO-Compliance-Test mit Negativ-Probe.
 *
 * Verifiziert:
 *   1. Positiv: Kompletter Signup-Flow durch, error_log enthaelt keinen
 *      Klartext-Email/IP — Hash-Only-Metadata-Disziplin haelt.
 *   2. Negativ-Probe: Wenn ein Bug Klartext-Email/IP in metadata schreiben
 *      wuerde, MUSS containsPlaintextPII das detektieren. Geprueft durch
 *      direkten INSERT in error_log mit Klartext-Email.
 *
 * Die Negativ-Probe ist KEIN dauerhafter Stub, sondern ein deterministischer
 * Test der die Detection-Faehigkeit bestaetigt (sonst koennte Test 1 falsch-
 * positiv "alles sauber" liefern wenn die RegEx-Helper kaputt sind).
 *
 * Pattern-Reuse: containsPlaintextPII aus `@/test/v7-signup-fixture`.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// sendMail mocken — kein SMTP, kein Test-Email-Versand.
vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>(
    "@/lib/email"
  );
  return {
    ...actual,
    sendMail: vi.fn().mockResolvedValue(undefined),
    sendErrorNotification: vi.fn().mockResolvedValue(undefined),
  };
});

import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

import { POST } from "@/app/api/public/signup/route";
import {
  cleanupAllPentestArtifacts,
  cleanupTestPartner,
  containsPlaintextPII,
  fetchAuditLogRows,
  openTestDbClient,
  setupTestPartner,
  setupTestServiceKey,
  type TestPartner,
} from "@/test/v7-signup-fixture";

function makeBody(slug: string, email: string): Record<string, unknown> {
  return {
    slug,
    email,
    first_name: "Test",
    last_name: "DSGVO",
    company_name: "Test Co",
    dsgvo_consent_accepted: true,
    dsgvo_consent_text_version: "v1-2026-05",
  };
}

function buildRequest(
  body: Record<string, unknown>,
  serviceKey: string,
  xff: string
): NextRequest {
  return new NextRequest("http://localhost/api/public/signup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-strategaize-service-key": serviceKey,
      "x-forwarded-for": xff,
    },
    body: JSON.stringify(body),
  });
}

describe("V7 SLC-134 MT-6 — DSGVO Hash-Only Audit-Log Compliance + Negativ-Probe", () => {
  let partner: TestPartner;
  let keyHandle: { key: string; restore: () => void };
  let testRunStart: Date;

  beforeAll(async () => {
    await cleanupAllPentestArtifacts();
    partner = await setupTestPartner();
    keyHandle = setupTestServiceKey();
    if (!process.env.PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS) {
      process.env.PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS = "mailinator.com,tempmail.io";
    }
    testRunStart = new Date();
  });

  afterAll(async () => {
    keyHandle.restore();
    await cleanupTestPartner(partner.tenant_id);
  });

  it("Positiv: Vollstaendiger Signup-Flow + error_log enthaelt KEINEN Klartext-Email/IP", async () => {
    const email = `dsgvo-${randomBytes(4).toString("hex")}@example.test`;
    const ip = "10.42.42.42";

    const req = buildRequest(makeBody(partner.slug, email), keyHandle.key, ip);
    const res = await POST(req);
    expect(res.status).toBe(202);

    // Async log-Write: kurz warten
    await new Promise((resolve) => setTimeout(resolve, 500));

    const rows = await fetchAuditLogRows("public_signup", testRunStart);
    expect(rows.length).toBeGreaterThan(0);

    let hasAnyPlaintext = false;
    for (const r of rows) {
      const probe = containsPlaintextPII(r.metadata);
      if (probe.hasEmail || probe.hasIp) {
        hasAnyPlaintext = true;
        console.error(
          `[MT-6 LEAK] row=${r.id} hasEmail=${probe.hasEmail} hasIp=${probe.hasIp} raw=${probe.rawText.slice(0, 300)}`
        );
      }
    }
    expect(hasAnyPlaintext, "error_log contains plaintext PII").toBe(false);
  });

  it("Negativ-Probe: Direct-INSERT mit Klartext-Email + Klartext-IP wird von containsPlaintextPII detektiert", async () => {
    // Direct-INSERT eines simulierten "Bug"-Log-Eintrags
    const client = await openTestDbClient();
    let insertedId: string;
    try {
      const r = await client.query<{ id: string }>(
        `INSERT INTO error_log (level, source, message, metadata)
         VALUES ('info', 'pentest/dsgvo-probe', 'simulated bug',
                 '{"category":"public_signup_test","email":"bug@example.com","client_ip":"192.168.0.42"}'::jsonb)
         RETURNING id`
      );
      insertedId = r.rows[0].id;
    } finally {
      await client.end();
    }

    // Lookup + Detection
    const cleanup = await openTestDbClient();
    try {
      const lookup = await cleanup.query<{
        metadata: Record<string, unknown>;
      }>(`SELECT metadata FROM error_log WHERE id = $1`, [insertedId]);
      expect(lookup.rows.length).toBe(1);

      const probe = containsPlaintextPII(lookup.rows[0].metadata);
      expect(probe.hasEmail).toBe(true);
      expect(probe.hasIp).toBe(true);

      // Cleanup
      await cleanup.query(`DELETE FROM error_log WHERE id = $1`, [insertedId]);
    } finally {
      await cleanup.end();
    }
  });

  it("RegEx-Helper isolierte Smoke-Tests (gegen False-Positives)", () => {
    // Email-Detection
    expect(containsPlaintextPII({ msg: "alice@bob.de" }).hasEmail).toBe(true);
    expect(containsPlaintextPII({ msg: "user.name+tag@sub.domain.com" }).hasEmail).toBe(true);

    // SHA-256-Hash (64 hex) sollte NICHT als Email erkannt werden
    const hashOnly = "a".repeat(64);
    expect(containsPlaintextPII({ email_hash: hashOnly }).hasEmail).toBe(false);

    // IP-Detection
    expect(containsPlaintextPII({ ip: "192.168.1.1" }).hasIp).toBe(true);
    expect(containsPlaintextPII({ ip_hash: hashOnly }).hasIp).toBe(false);

    // null/empty
    expect(containsPlaintextPII(null).hasEmail).toBe(false);
    expect(containsPlaintextPII({}).hasIp).toBe(false);
  });
});
