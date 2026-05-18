import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// ── Mocks — set up BEFORE importing the SUT ─────────────────────────────

const redirectCalls: string[] = [];

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    redirectCalls.push(url);
    // Mirror Next.js: redirect() throws NEXT_REDIRECT internally.
    const err = new Error("NEXT_REDIRECT");
    (err as Error & { digest: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

vi.mock("@/lib/signup/pending-signup-repo", () => ({
  findByTokenHashAnyStatus: vi.fn(),
}));

vi.mock("@/lib/signup/auto-provision", () => ({
  provisionSelfSignupTenant: vi.fn(),
}));

vi.mock("@/lib/signup/magic-link", () => ({
  generateMagicLinkSession: vi.fn(),
}));

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

import VerifySignupPage from "../page";
import { findByTokenHashAnyStatus } from "@/lib/signup/pending-signup-repo";
import { provisionSelfSignupTenant } from "@/lib/signup/auto-provision";
import { generateMagicLinkSession } from "@/lib/signup/magic-link";
import { InvalidLinkPage } from "../_components/InvalidLinkPage";
import { ExpiredLinkPage } from "../_components/ExpiredLinkPage";
import { ErrorPage } from "../_components/ErrorPage";

const VALID_TOKEN = "a".repeat(64);
const VALID_TOKEN_HASH = createHash("sha256").update(VALID_TOKEN, "utf8").digest("hex");

function mkPending(overrides: Partial<{
  id: string;
  partner_tenant_id: string;
  email_lower: string;
  status: "pending" | "verified" | "expired";
  expires_at: string;
  verified_at: string | null;
}>) {
  return {
    id: "pending-1",
    partner_tenant_id: "partner-1",
    email_lower: "alice@example.com",
    first_name: "Alice",
    last_name: "Mueller",
    company_name: "Acme",
    dsgvo_consent_text_version: "v1-2026-05",
    dsgvo_consent_accepted_at: "2026-05-18T10:00:00.000Z",
    verify_token_hash: VALID_TOKEN_HASH,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: "pending" as const,
    verified_at: null,
    created_at: "2026-05-18T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  redirectCalls.length = 0;
  capturedLogs.length = 0;
});

describe("VerifySignupPage — V7 SLC-133 MT-4 endpoint 6 cases", () => {
  it("Test 1 — Token-Format ungueltig: returns InvalidLinkPage, audit-log reason='invalid_token_format'", async () => {
    const result = await VerifySignupPage({
      searchParams: Promise.resolve({ token: "not-hex" }),
    });

    expect(result.type).toBe(InvalidLinkPage);

    // Audit log: kein Klartext, kein email.
    const log = capturedLogs.find((l) => l.metadata.reason === "invalid_token_format");
    expect(log).toBeTruthy();
    expect(log?.level).toBe("info");
    expect(log?.metadata.status).toBe(400);

    // No DB lookup attempted.
    expect(findByTokenHashAnyStatus).not.toHaveBeenCalled();
  });

  it("Test 2 — Token-Hash unbekannt: lookup returns null → InvalidLinkPage, audit-log reason='token_not_found'", async () => {
    vi.mocked(findByTokenHashAnyStatus).mockResolvedValue(null);

    const result = await VerifySignupPage({
      searchParams: Promise.resolve({ token: VALID_TOKEN }),
    });

    expect(result.type).toBe(InvalidLinkPage);
    expect(findByTokenHashAnyStatus).toHaveBeenCalledWith(VALID_TOKEN_HASH);

    const log = capturedLogs.find((l) => l.metadata.reason === "token_not_found");
    expect(log).toBeTruthy();
    expect(log?.metadata.status).toBe(404);
  });

  it("Test 3 — Status='expired': returns ExpiredLinkPage, audit-log reason='expired'", async () => {
    vi.mocked(findByTokenHashAnyStatus).mockResolvedValue(
      mkPending({ status: "expired" })
    );

    const result = await VerifySignupPage({
      searchParams: Promise.resolve({ token: VALID_TOKEN }),
    });

    expect(result.type).toBe(ExpiredLinkPage);

    const log = capturedLogs.find((l) => l.metadata.reason === "expired");
    expect(log).toBeTruthy();
    expect(log?.metadata.status).toBe(410);

    // DSGVO-Probe: kein Klartext-Email im Audit-Log.
    expect(JSON.stringify(log?.metadata)).not.toMatch(/[a-z0-9._-]+@/i);
  });

  it("Test 4 — Status='verified' (Doppel-Klick): redirects to /login?info=already_verified, audit-log reason='already_verified'", async () => {
    vi.mocked(findByTokenHashAnyStatus).mockResolvedValue(
      mkPending({ status: "verified", verified_at: "2026-05-18T11:00:00.000Z" })
    );

    await expect(
      VerifySignupPage({
        searchParams: Promise.resolve({ token: VALID_TOKEN }),
      })
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(redirectCalls).toEqual(["/login?info=already_verified"]);

    // No auto-provisioning fired.
    expect(provisionSelfSignupTenant).not.toHaveBeenCalled();

    const log = capturedLogs.find((l) => l.metadata.reason === "already_verified");
    expect(log).toBeTruthy();
    expect(log?.metadata.status).toBe(200);
    // DSGVO-Probe.
    expect(JSON.stringify(log?.metadata)).not.toMatch(/[a-z0-9._-]+@/i);
  });

  it("Test 5 — Status='pending' + valid → Auto-Provisioning + Magic-Link → redirect /auth/callback URL", async () => {
    vi.mocked(findByTokenHashAnyStatus).mockResolvedValue(mkPending({}));
    vi.mocked(provisionSelfSignupTenant).mockResolvedValue({
      ok: true,
      new_tenant_id: "tenant-X",
      new_user_id: "user-X",
      pending_already_verified: false,
    });
    vi.mocked(generateMagicLinkSession).mockResolvedValue({
      ok: true,
      verify_url: "https://onboarding.example.com/auth/callback?token_hash=abc&type=magiclink&locale=de",
    });

    await expect(
      VerifySignupPage({
        searchParams: Promise.resolve({ token: VALID_TOKEN }),
      })
    ).rejects.toThrow(/NEXT_REDIRECT/);

    expect(redirectCalls).toEqual([
      "https://onboarding.example.com/auth/callback?token_hash=abc&type=magiclink&locale=de",
    ]);

    // Auto-Provisioning called with the right payload.
    expect(provisionSelfSignupTenant).toHaveBeenCalledTimes(1);
    expect(provisionSelfSignupTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        pending_signup_id: "pending-1",
        partner_tenant_id: "partner-1",
        email_lower: "alice@example.com",
        first_name: "Alice",
        last_name: "Mueller",
      })
    );

    // Magic-Link called with the email.
    expect(generateMagicLinkSession).toHaveBeenCalledWith({
      email: "alice@example.com",
    });

    // Success audit-log fired.
    const successLog = capturedLogs.find((l) => l.metadata.reason === "success");
    expect(successLog).toBeTruthy();
    expect(successLog?.metadata.status).toBe(200);
    expect(successLog?.metadata.new_tenant_id).toBe("tenant-X");
    expect(successLog?.metadata.new_user_id).toBe("user-X");

    // DSGVO-Probe across all logs: kein Klartext-Email.
    const allLogStr = JSON.stringify(capturedLogs.map((l) => l.metadata));
    expect(allLogStr).not.toMatch(/alice@example/i);
  });

  it("Test 6 — Auto-Provisioning Email-Konflikt: ErrorPage with reason='email_conflict_cross_partner', audit-log captureException", async () => {
    vi.mocked(findByTokenHashAnyStatus).mockResolvedValue(mkPending({}));
    vi.mocked(provisionSelfSignupTenant).mockResolvedValue({
      ok: false,
      error: "email_conflict_cross_partner",
    });

    const result = await VerifySignupPage({
      searchParams: Promise.resolve({ token: VALID_TOKEN }),
    });

    expect(result.type).toBe(ErrorPage);
    expect(result.props.reason).toBe("email_conflict_cross_partner");

    // Magic-Link NOT called (provisioning failed first).
    expect(generateMagicLinkSession).not.toHaveBeenCalled();

    // captureException fired with reason.
    const errLog = capturedLogs.find(
      (l) => l.level === "error" && l.metadata.reason === "email_conflict_cross_partner"
    );
    expect(errLog).toBeTruthy();
    expect(errLog?.metadata.status).toBe(500);
  });
});
