import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks — set up BEFORE importing the route ───────────────────────────

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/signup/pending-signup-repo", () => ({
  insertPendingSignup: vi.fn(),
  findActivePendingSignup: vi.fn(),
  findPendingByTokenHash: vi.fn(),
}));

vi.mock("@/lib/email", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
  return {
    ...actual,
    sendMail: vi.fn().mockResolvedValue(undefined),
  };
});

const capturedLogs: Array<{
  level: "info" | "error";
  message: string;
  metadata: Record<string, unknown>;
}> = [];

vi.mock("@/lib/logger", () => ({
  captureInfo: vi.fn((message: string, ctx?: { metadata?: Record<string, unknown> }) => {
    capturedLogs.push({
      level: "info",
      message,
      metadata: ctx?.metadata ?? {},
    });
  }),
  captureException: vi.fn(
    (err: unknown, ctx?: { metadata?: Record<string, unknown> }) => {
      capturedLogs.push({
        level: "error",
        message: err instanceof Error ? err.message : String(err),
        metadata: ctx?.metadata ?? {},
      });
    }
  ),
  captureWarning: vi.fn(),
}));

import { POST } from "../route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  insertPendingSignup,
  findActivePendingSignup,
} from "@/lib/signup/pending-signup-repo";
import { sendMail } from "@/lib/email";

const VALID_SERVICE_KEY = "test-service-key-32-bytes-hex-XXXX";

type AdminMock = {
  from: ReturnType<typeof vi.fn>;
};

interface AdminSetup {
  partner?: { data: unknown; error: unknown };
  profiles?: { data: unknown; error: unknown };
  mapping?: { data: unknown; error: unknown };
}

function buildAdmin(setup: AdminSetup): AdminMock {
  return {
    from: vi.fn((table: string) => {
      if (table === "partner_organization") {
        return {
          select: vi.fn().mockReturnThis(),
          ilike: vi.fn().mockReturnThis(),
          maybeSingle: vi
            .fn()
            .mockResolvedValue(setup.partner ?? { data: null, error: null }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi
            .fn()
            .mockResolvedValue(setup.profiles ?? { data: [], error: null }),
        };
      }
      if (table === "partner_client_mapping") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi
            .fn()
            .mockResolvedValue(setup.mapping ?? { data: [], error: null }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

function buildRequest(
  body: unknown,
  options: {
    serviceKey?: string | null;
    xff?: string | null;
  } = {}
): import("next/server").NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.serviceKey !== null && options.serviceKey !== undefined) {
    headers["x-strategaize-service-key"] = options.serviceKey;
  } else if (options.serviceKey === undefined) {
    headers["x-strategaize-service-key"] = VALID_SERVICE_KEY;
  }
  if (options.xff) {
    headers["x-forwarded-for"] = options.xff;
  }
  return new Request("https://onboarding.strategaizetransition.com/api/public/signup", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function happyBody(overrides: Record<string, unknown> = {}) {
  return {
    partner_slug: "kanzlei-mueller",
    email: "Alice@Example.com",
    first_name: "Alice",
    last_name: "Mueller",
    company_name: "Acme GmbH",
    dsgvo_consent_accepted: true,
    dsgvo_consent_text_version: "v1-2026-05",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedLogs.length = 0;
  process.env.PUBLIC_SIGNUP_SERVICE_KEY = VALID_SERVICE_KEY;
  process.env.PUBLIC_SIGNUP_BLOCKED_EMAIL_DOMAINS =
    "mailinator.com,guerrillamail.com,tempmail.io";
  process.env.NEXT_PUBLIC_APP_URL =
    "https://onboarding.strategaizetransition.com";
});

// ── 1. Happy-Path: 202 + pending_signup row + sendMail call ────────────────
describe("POST /api/public/signup — happy path", () => {
  it("returns 202 with pending_email_verify and triggers sendMail", async () => {
    const admin = buildAdmin({
      partner: {
        data: {
          tenant_id: "11111111-1111-1111-1111-111111111111",
          display_name: "Kanzlei Mueller & Partner",
          contact_email: "kontakt@kanzlei.de",
        },
        error: null,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findActivePendingSignup).mockResolvedValue(null);
    vi.mocked(insertPendingSignup).mockResolvedValue({
      id: "pending-id-1",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const res = await POST(
      buildRequest(happyBody(), { xff: `1.2.3.${Math.floor(Math.random() * 250)}` })
    );
    expect(res.status).toBe(202);
    const json = (await res.json()) as { status: string; expires_at: string };
    expect(json.status).toBe("pending_email_verify");
    expect(json.expires_at).toMatch(/T/); // ISO 8601

    expect(insertPendingSignup).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        replyTo: "kontakt@kanzlei.de",
        subject: expect.stringContaining("Kanzlei Mueller & Partner"),
      })
    );
  });
});

// ── 2 & 3. Service-Key auth failures ───────────────────────────────────────
describe("POST /api/public/signup — service-key auth", () => {
  it("returns 401 when the service-key header is missing", async () => {
    const res = await POST(
      buildRequest(happyBody(), { serviceKey: null, xff: "9.9.9.1" })
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_service_key");
    expect(insertPendingSignup).not.toHaveBeenCalled();
  });

  it("returns 401 when the service-key header does not match", async () => {
    const res = await POST(
      buildRequest(happyBody(), { serviceKey: "wrong-key", xff: "9.9.9.2" })
    );
    expect(res.status).toBe(401);
    expect(insertPendingSignup).not.toHaveBeenCalled();
  });
});

// ── 4. Rate-limit hit ─────────────────────────────────────────────────────
describe("POST /api/public/signup — rate limit", () => {
  it("returns 429 on the 4th request from the same IP within the window", async () => {
    const admin = buildAdmin({
      partner: {
        data: {
          tenant_id: "22222222-2222-2222-2222-222222222222",
          display_name: "Kanzlei A",
          contact_email: null,
        },
        error: null,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findActivePendingSignup).mockResolvedValue(null);
    vi.mocked(insertPendingSignup).mockResolvedValue({
      id: "x",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    const ip = `7.7.7.${Math.floor(Math.random() * 250)}`;
    // Use distinct emails so doppel-pending-check (mock returns null) does not
    // collide on something else and we isolate the rate-limit path.
    for (let i = 0; i < 3; i++) {
      const r = await POST(
        buildRequest(happyBody({ email: `user${i}@example.com` }), { xff: ip })
      );
      expect(r.status).toBe(202);
    }
    const fourth = await POST(
      buildRequest(happyBody({ email: "user4@example.com" }), { xff: ip })
    );
    expect(fourth.status).toBe(429);
    const json = (await fourth.json()) as {
      error: string;
      retry_after_seconds: number;
    };
    expect(json.error).toBe("rate_limit_exceeded");
    expect(json.retry_after_seconds).toBeGreaterThan(0);
    expect(fourth.headers.get("Retry-After")).toBeTruthy();
  });
});

// ── 5, 6, 7, 8. Zod-Validation + domain-block ──────────────────────────────
describe("POST /api/public/signup — validation", () => {
  it("returns 422 when a required field is missing (first_name)", async () => {
    const body = happyBody();
    delete (body as Record<string, unknown>).first_name;
    const res = await POST(buildRequest(body, { xff: "8.1.1.1" }));
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("validation_failed");
  });

  it("returns 422 when email syntax is invalid", async () => {
    const res = await POST(
      buildRequest(happyBody({ email: "not-an-email" }), { xff: "8.1.1.2" })
    );
    expect(res.status).toBe(422);
    expect(insertPendingSignup).not.toHaveBeenCalled();
  });

  it("returns 422 when dsgvo_consent_accepted is false", async () => {
    const res = await POST(
      buildRequest(happyBody({ dsgvo_consent_accepted: false }), {
        xff: "8.1.1.3",
      })
    );
    expect(res.status).toBe(422);
    expect(insertPendingSignup).not.toHaveBeenCalled();
  });

  it("returns 422 with disposable_email_domain detail when domain is blocked", async () => {
    const res = await POST(
      buildRequest(happyBody({ email: "spam@mailinator.com" }), {
        xff: "8.1.1.4",
      })
    );
    expect(res.status).toBe(422);
    const json = (await res.json()) as { error: string; details: string[] };
    expect(json.error).toBe("validation_failed");
    expect(json.details).toContain("disposable_email_domain");
    expect(insertPendingSignup).not.toHaveBeenCalled();
  });
});

// ── 9. Unknown slug ────────────────────────────────────────────────────────
describe("POST /api/public/signup — unknown partner", () => {
  it("returns 404 when partner_slug does not match any partner_organization", async () => {
    const admin = buildAdmin({
      partner: { data: null, error: null },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );

    const res = await POST(
      buildRequest(happyBody({ partner_slug: "unknown-slug" }), {
        xff: "8.2.0.1",
      })
    );
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("unknown_partner");
    expect(insertPendingSignup).not.toHaveBeenCalled();
  });
});

// ── 10. Already pending ────────────────────────────────────────────────────
describe("POST /api/public/signup — already pending", () => {
  it("returns 409 when an active pending row already exists for partner+email", async () => {
    const admin = buildAdmin({
      partner: {
        data: {
          tenant_id: "33333333-3333-3333-3333-333333333333",
          display_name: "Kanzlei B",
          contact_email: null,
        },
        error: null,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findActivePendingSignup).mockResolvedValue({
      id: "existing",
      partner_tenant_id: "33333333-3333-3333-3333-333333333333",
      email_lower: "alice@example.com",
      first_name: "Alice",
      last_name: "Mueller",
      company_name: null,
      dsgvo_consent_text_version: "v1-2026-05",
      dsgvo_consent_accepted_at: new Date().toISOString(),
      verify_token_hash: "x".repeat(64),
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      status: "pending",
      verified_at: null,
      created_at: new Date().toISOString(),
    });

    const res = await POST(
      buildRequest(happyBody(), { xff: "8.3.0.1" })
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("email_already_signed_up");
    expect(insertPendingSignup).not.toHaveBeenCalled();
  });
});

// ── 11. Cross-partner mapping = ALLOWED (V7 rule, 1 email = 1 mandant pro partner) ──
describe("POST /api/public/signup — cross-partner mapping is allowed", () => {
  it("accepts a signup when the email exists at a DIFFERENT partner (no mapping match)", async () => {
    // Profile exists with tenant_id X. partner_client_mapping for partner-A with
    // client_tenant_id=X exists. Caller signs up at partner-B (different
    // tenant_id) — the cross-check returns empty for partner-B, so the signup
    // proceeds to 202.
    const admin = buildAdmin({
      partner: {
        data: {
          tenant_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          display_name: "Kanzlei B",
          contact_email: "b@kanzlei.de",
        },
        error: null,
      },
      // Profile lookup finds the email under a tenant that is mapped at
      // partner-A.
      profiles: {
        data: [
          {
            id: "user-1",
            tenant_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          },
        ],
        error: null,
      },
      // partner_client_mapping query for partner-B + client_tenant_id=C
      // returns empty — no mapping at partner-B.
      mapping: { data: [], error: null },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findActivePendingSignup).mockResolvedValue(null);
    vi.mocked(insertPendingSignup).mockResolvedValue({
      id: "pending-cross",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    const res = await POST(
      buildRequest(happyBody({ email: "shared@example.com" }), {
        xff: `8.4.0.${Math.floor(Math.random() * 250)}`,
      })
    );
    expect(res.status).toBe(202);
    expect(insertPendingSignup).toHaveBeenCalledTimes(1);
  });
});

// ── 12. DSGVO RegEx-Probe on audit-log metadata ────────────────────────────
describe("POST /api/public/signup — DSGVO audit-log datasparsamkeit", () => {
  it("never logs the plaintext email (no '@' in metadata stringified)", async () => {
    const admin = buildAdmin({
      partner: {
        data: {
          tenant_id: "55555555-5555-5555-5555-555555555555",
          display_name: "Kanzlei C",
          contact_email: null,
        },
        error: null,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );
    vi.mocked(findActivePendingSignup).mockResolvedValue(null);
    vi.mocked(insertPendingSignup).mockResolvedValue({
      id: "pending-dsgvo",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });

    const sensitiveEmail = "personal.identifiable@somecompany.com";
    const sensitiveIp = `8.5.0.${Math.floor(Math.random() * 250)}`;
    const res = await POST(
      buildRequest(happyBody({ email: sensitiveEmail }), { xff: sensitiveIp })
    );
    expect(res.status).toBe(202);

    // Every captured log entry must have metadata that does NOT contain
    // the plaintext email or IP. Stringify-Probe is the rule per Slice
    // AC-13.
    expect(capturedLogs.length).toBeGreaterThan(0);
    for (const log of capturedLogs) {
      const stringified = JSON.stringify(log.metadata);
      // No '@' character anywhere (which would be a plaintext email).
      expect(stringified).not.toMatch(/[a-z0-9._-]+@/i);
      // No IPv4 pattern.
      expect(stringified).not.toContain(sensitiveIp);
      // No literal email substring.
      expect(stringified).not.toContain(sensitiveEmail);
    }
  });
});
