/**
 * V7 SLC-134 MT-2 — Pen-Test 11 Cases gegen `POST /api/public/signup`.
 *
 * Test-Layout-Pattern: Co-located unter `src/app/api/public/signup/__tests__/`
 * analog V6-Pen-Test `src/lib/db/__tests__/v6-partner-rls.test.ts`.
 *
 * Tests laufen gegen die Coolify-Postgres-DB im node:20-Container
 * (per `.claude/rules/coolify-test-setup.md`). Email-Send ist gemockt,
 * logger schreibt echte error_log-Rows.
 *
 * Pflicht-ENV im Test-Container:
 *   - TEST_DATABASE_URL (direkt zur DB, fuer fixture + Audit-Lookup)
 *   - SUPABASE_URL (Kong-internal-URL fuer logger + admin-Client)
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - NEXT_PUBLIC_APP_URL (fuer Verify-Link-Bau im email-template)
 *   - PUBLIC_SIGNUP_SERVICE_KEY wird pro Test via setupTestServiceKey ueberschrieben
 *
 * Pen-Test-Akteur: `unauthenticated_public_signup_caller` mit 4 Sub-Varianten
 * (noKey / wrongKey / validKey / validKey+rate_limited).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { vi } from "vitest";

// sendMail mocken (kein echter SMTP-Versand). renderSignupVerifyTemplate
// bleibt echt — der Route-Handler ruft es VOR sendMail.
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

import { POST } from "../route";
import {
  cleanupAllPentestArtifacts,
  cleanupTestPartner,
  containsPlaintextPII,
  fetchAuditLogRows,
  openTestDbClient,
  setupTestPartner,
  setupTestPendingSignup,
  setupTestServiceKey,
  setupVerifiedClientMandant,
  type TestPartner,
} from "@/test/v7-signup-fixture";

interface BuildOptions {
  serviceKey?: string | null | undefined;
  xff?: string;
  body?: Record<string, unknown>;
}

/**
 * Erzeugt einen NextRequest fuer den Route-Handler. `serviceKey: null`
 * laesst den Header weg. `serviceKey: undefined` setzt den Default-Test-Key.
 */
function buildRequest(
  body: Record<string, unknown>,
  options: BuildOptions = {}
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.xff) {
    headers["x-forwarded-for"] = options.xff;
  }
  if (options.serviceKey !== null) {
    if (options.serviceKey !== undefined) {
      headers["x-strategaize-service-key"] = options.serviceKey;
    }
  }

  return new NextRequest("http://localhost/api/public/signup", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** Default-Body fuer einen gueltigen Signup-Request (Schema-Field-Name = partner_slug). */
function makeBody(
  partner: TestPartner,
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  const email = `${randomBytes(4).toString("hex")}@example.test`;
  return {
    partner_slug: partner.slug,
    email,
    first_name: "Test",
    last_name: "Pentest",
    company_name: "Test Co",
    dsgvo_consent_accepted: true,
    dsgvo_consent_text_version: "v1-2026-05",
    ...overrides,
  };
}

/** Liefert eine eindeutige IP pro Test-Case, damit Rate-Limiter nicht poolen. */
function uniqueIp(): string {
  const a = Math.floor(Math.random() * 200) + 20;
  const b = Math.floor(Math.random() * 200) + 20;
  return `10.${a}.${b}.${Math.floor(Math.random() * 250) + 1}`;
}

describe("V7 SLC-134 MT-2 — POST /api/public/signup Pen-Test (11 Cases)", () => {
  let partner: TestPartner;
  let keyHandle: { key: string; restore: () => void };
  let testRunStart: Date;

  beforeAll(async () => {
    await cleanupAllPentestArtifacts();
    partner = await setupTestPartner();
    keyHandle = setupTestServiceKey();
    // blocked email domain via ENV gesetzt — falls vorhanden bleibt es,
    // ansonsten setzen wir es explizit fuer Case 10.
    if (!process.env.PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS) {
      process.env.PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS = "mailinator.com,tempmail.io";
    }
    testRunStart = new Date();
  });

  afterAll(async () => {
    keyHandle.restore();
    await cleanupTestPartner(partner.tenant_id);
  });

  // ── Case 1 — kein Service-Key-Header → 401 ──────────────────────────────
  it("Case 1: ohne x-strategaize-service-key Header → 401 invalid_service_key", async () => {
    const req = buildRequest(makeBody(partner), {
      serviceKey: null,
      xff: uniqueIp(),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_service_key");
  });

  // ── Case 2 — falscher Service-Key (gleiche Laenge) → 401 ────────────────
  it("Case 2: falscher Service-Key → 401 invalid_service_key", async () => {
    const wrong = "X".repeat(keyHandle.key.length); // gleiche Laenge, alle Bytes anders
    const req = buildRequest(makeBody(partner), {
      serviceKey: wrong,
      xff: uniqueIp(),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_service_key");
  });

  // ── Case 3 — Valid Key + Slug + neue Email → 202 + pending_signup-Row ───
  it("Case 3: validKey + bekannter Slug + neue Email → 202 + pending_signup row", async () => {
    const email = `${randomBytes(6).toString("hex")}@example.test`;
    const req = buildRequest(makeBody(partner, { email }), {
      serviceKey: keyHandle.key,
      xff: uniqueIp(),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);
    const json = (await res.json()) as {
      status: string;
      expires_at: string;
    };
    expect(json.status).toBe("pending_email_verify");
    expect(json.expires_at).toBeDefined();

    // Direct-DB-Verify: pending_signup-Row existiert.
    const client = await openTestDbClient();
    try {
      const r = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM pending_signup
         WHERE partner_tenant_id = $1 AND email_lower = $2`,
        [partner.tenant_id, email.toLowerCase()]
      );
      expect(r.rows.length).toBe(1);
      expect(r.rows[0].status).toBe("pending");
    } finally {
      await client.end();
    }
  });

  // ── Case 4 — Unbekannter Slug → 404 ─────────────────────────────────────
  it("Case 4: validKey + unbekannter Slug → 404 unknown_partner", async () => {
    const req = buildRequest(
      makeBody(partner, { partner_slug: `nonexistent-${randomBytes(4).toString("hex")}` }),
      { serviceKey: keyHandle.key, xff: uniqueIp() }
    );
    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("unknown_partner");
  });

  // ── Case 5 — Bereits-verifizierter Email-Mandant → 409 ──────────────────
  it("Case 5: validKey + bekannter Slug + bereits-verifizierter Email → 409 email_already_signed_up", async () => {
    const verifiedEmail = `${randomBytes(6).toString("hex")}@example.test`;
    await setupVerifiedClientMandant(partner.tenant_id, verifiedEmail);

    const req = buildRequest(makeBody(partner, { email: verifiedEmail }), {
      serviceKey: keyHandle.key,
      xff: uniqueIp(),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("email_already_signed_up");
  });

  // ── Case 6 — Bereits-pending Email → 409 ────────────────────────────────
  it("Case 6: validKey + bekannter Slug + bereits-pending Email → 409 email_already_signed_up", async () => {
    const pendingEmail = `${randomBytes(6).toString("hex")}@example.test`;
    await setupTestPendingSignup(partner.tenant_id, pendingEmail);

    const req = buildRequest(makeBody(partner, { email: pendingEmail }), {
      serviceKey: keyHandle.key,
      xff: uniqueIp(),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("email_already_signed_up");
  });

  // ── Case 7 — Leere Email → 422 ──────────────────────────────────────────
  it("Case 7: validKey + bekannter Slug + leere Email → 422 validation_failed", async () => {
    const req = buildRequest(makeBody(partner, { email: "" }), {
      serviceKey: keyHandle.key,
      xff: uniqueIp(),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("validation_failed");
  });

  // ── Case 8 — Ungueltige Email-Syntax → 422 ──────────────────────────────
  it("Case 8: validKey + bekannter Slug + ungueltige Email-Syntax → 422 validation_failed", async () => {
    const req = buildRequest(makeBody(partner, { email: "not-an-email-at-all" }), {
      serviceKey: keyHandle.key,
      xff: uniqueIp(),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("validation_failed");
  });

  // ── Case 9 — DSGVO consent_accepted=false → 422 ─────────────────────────
  it("Case 9: validKey + bekannter Slug + dsgvo_consent_accepted=false → 422 validation_failed", async () => {
    const req = buildRequest(
      makeBody(partner, {
        email: `${randomBytes(4).toString("hex")}@example.test`,
        dsgvo_consent_accepted: false,
      }),
      { serviceKey: keyHandle.key, xff: uniqueIp() }
    );
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("validation_failed");
  });

  // ── Case 10 — Blocked-Domain (mailinator.com) → 422 mit details ─────────
  it("Case 10: validKey + bekannter Slug + Email aus blocked-Domain → 422 mit disposable_email_domain", async () => {
    const req = buildRequest(
      makeBody(partner, {
        email: `pentest-${randomBytes(4).toString("hex")}@mailinator.com`,
      }),
      { serviceKey: keyHandle.key, xff: uniqueIp() }
    );
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = (await res.json()) as {
      error: string;
      details?: string[];
    };
    expect(json.error).toBe("validation_failed");
    expect(json.details).toContain("disposable_email_domain");
  });

  // ── Case 11 — 4. POST vom selben IP innerhalb 1h → 429 ──────────────────
  it("Case 11: 4. POST signup vom selben IP innerhalb 1h → 429 rate_limit_exceeded", async () => {
    // Unique IP nur fuer Rate-Limit-Test
    const rateIp = `10.99.99.${Math.floor(Math.random() * 200) + 1}`;

    // Calls 1-3 = OK (validKey + neue Email)
    for (let i = 0; i < 3; i++) {
      const req = buildRequest(
        makeBody(partner, {
          email: `rl-${i}-${randomBytes(3).toString("hex")}@example.test`,
        }),
        { serviceKey: keyHandle.key, xff: rateIp }
      );
      const res = await POST(req);
      expect(res.status).toBe(202);
    }

    // Call 4 = 429
    const req4 = buildRequest(
      makeBody(partner, {
        email: `rl-4-${randomBytes(3).toString("hex")}@example.test`,
      }),
      { serviceKey: keyHandle.key, xff: rateIp }
    );
    const res4 = await POST(req4);
    expect(res4.status).toBe(429);
    const json4 = (await res4.json()) as {
      error: string;
      retry_after_seconds: number;
    };
    expect(json4.error).toBe("rate_limit_exceeded");
    expect(json4.retry_after_seconds).toBeGreaterThan(0);
    expect(res4.headers.get("retry-after")).toBeTruthy();
  });

  // ── Audit-Log-Probe ──────────────────────────────────────────────────────
  it("Audit-Log: alle 11 Cases haben Audit-Eintraege mit category=public_signup und KEINEN Klartext-PII", async () => {
    // Ein paar Millisekunden warten — captureInfo schreibt asynchron (`.catch(() => {})`)
    await new Promise((resolve) => setTimeout(resolve, 500));

    const rows = await fetchAuditLogRows("public_signup", testRunStart);

    // Mindestens 11 Eintraege erwartet (jeder Case + ggf. zusaetzliche
    // accepted_pending_verify-Eintraege bei Case 3 + 11).
    expect(rows.length).toBeGreaterThanOrEqual(11);

    // DSGVO-Probe: kein Klartext-Email, keine Klartext-IP in irgendeinem Eintrag.
    for (const r of rows) {
      const probe = containsPlaintextPII(r.metadata);
      expect(probe.hasEmail, `Audit row ${r.id} contains plaintext email: ${probe.rawText}`).toBe(
        false
      );
      expect(probe.hasIp, `Audit row ${r.id} contains plaintext IP: ${probe.rawText}`).toBe(
        false
      );
    }

    // Status-Code-Kreuzprobe: erwartete Status-Codes muessen alle abgedeckt sein
    const statuses = new Set(
      rows
        .map((r) => (r.metadata as { status?: number } | null)?.status)
        .filter((s): s is number => typeof s === "number")
    );
    // 401, 404, 409, 422, 429, 202 — alle erwarteten Status-Codes
    expect(statuses.has(401)).toBe(true);
    expect(statuses.has(404)).toBe(true);
    expect(statuses.has(409)).toBe(true);
    expect(statuses.has(422)).toBe(true);
    expect(statuses.has(429)).toBe(true);
    expect(statuses.has(202)).toBe(true);
  });
});
