// V10.3 SLC-186 MT-3 — Vitest fuer requestPasswordReset Server-Action.
//
// Strategie: vi.mock fuer supabase/admin, rate-limit, logger, email,
// next/headers. Wir verifizieren die Enumeration-Sicherheit (byte-identisches
// Ergebnis), die URL-Konstruktion (NEXT_PUBLIC_APP_URL-basiert) und die
// beiden Rate-Limit-Buckets — NICHT den echten GoTrue-/SMTP-Pfad.
//
// Test-Faelle:
//   1. existierende E-Mail          -> ok:true + sendPasswordResetEmail(korrekte URL)
//   2. user_not_found               -> ok:true + sendPasswordResetEmail NICHT aufgerufen (byte-identisch zu 1)
//   3. IP-Limit ueberschritten      -> error generisch
//   4. Account-Limit ueberschritten -> error generisch
//   5. ungueltige E-Mail            -> error
//   6. sendMail wirft               -> ok:true

import { describe, it, expect, vi, beforeEach } from "vitest";

interface RateCheck {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
  error?: string;
}

const mocks = vi.hoisted(() => ({
  generateLinkMock: vi.fn(),
  ipCheckMock: vi.fn<(id: string) => RateCheck>(() => ({
    allowed: true,
    remaining: 4,
  })),
  accountCheckMock: vi.fn<(id: string) => RateCheck>(() => ({
    allowed: true,
    remaining: 2,
  })),
  captureInfoMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  sendPasswordResetEmailMock: vi.fn<
    (args: { to: string; verifyUrl: string }) => Promise<void>
  >(async () => {}),
  headersMock: vi.fn(async () => new Map([["x-forwarded-for", "1.2.3.4"]])),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { generateLink: mocks.generateLinkMock } },
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  passwordResetIpLimiter: { check: mocks.ipCheckMock },
  passwordResetAccountLimiter: { check: mocks.accountCheckMock },
}));
vi.mock("@/lib/logger", () => ({
  captureInfo: mocks.captureInfoMock,
  captureException: mocks.captureExceptionMock,
  captureWarning: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmailMock,
}));
vi.mock("next/headers", () => ({
  headers: () => mocks.headersMock(),
}));

import { requestPasswordReset } from "../actions";

const APP_URL = "https://app.strategaize.de";

function makeFormData(email: string | null): FormData {
  const fd = new FormData();
  if (email !== null) fd.set("email", email);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
  mocks.ipCheckMock.mockReturnValue({ allowed: true, remaining: 4 });
  mocks.accountCheckMock.mockReturnValue({ allowed: true, remaining: 2 });
  mocks.headersMock.mockResolvedValue(
    new Map([["x-forwarded-for", "1.2.3.4"]])
  );
});

describe("requestPasswordReset (V10.3 SLC-186 MT-3)", () => {
  it("case 1: existing email -> ok:true and sends email with NEXT_PUBLIC_APP_URL-based recovery URL", async () => {
    mocks.generateLinkMock.mockResolvedValue({
      data: { properties: { hashed_token: "HASHED_ABC" } },
      error: null,
    });

    const result = await requestPasswordReset(makeFormData("User@Example.com"));

    expect(result).toEqual({ ok: true });
    expect(mocks.sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
    const arg = mocks.sendPasswordResetEmailMock.mock.calls[0]![0];
    expect(arg.to).toBe("user@example.com");
    expect(arg.verifyUrl).toContain(APP_URL);
    expect(arg.verifyUrl).toContain("token_hash=HASHED_ABC");
    expect(arg.verifyUrl).toContain("type=recovery");
    // generateLink must be called with the lowercased email
    expect(mocks.generateLinkMock).toHaveBeenCalledWith({
      type: "recovery",
      email: "user@example.com",
    });
  });

  it("case 2: user_not_found -> ok:true, sendPasswordResetEmail NOT called (byte-identical to case 1)", async () => {
    mocks.generateLinkMock.mockResolvedValue({
      data: null,
      error: { message: "user_not_found", status: 404 },
    });

    const result = await requestPasswordReset(
      makeFormData("unknown@example.com")
    );

    expect(result).toEqual({ ok: true });
    expect(mocks.sendPasswordResetEmailMock).not.toHaveBeenCalled();
    // Enumeration-Schutz: Info-Log ohne Token/E-Mail im Klartext
    expect(mocks.captureInfoMock).toHaveBeenCalledTimes(1);
  });

  it("case 3: IP limit exceeded -> generic error, no generateLink", async () => {
    mocks.ipCheckMock.mockReturnValue({
      allowed: false,
      remaining: 0,
      error: "internal",
    });

    const result = await requestPasswordReset(makeFormData("user@example.com"));

    expect(result).toEqual({
      error: "Zu viele Anfragen. Bitte später erneut versuchen.",
    });
    expect(mocks.generateLinkMock).not.toHaveBeenCalled();
    expect(mocks.sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it("case 4: account limit exceeded -> generic error, no generateLink", async () => {
    mocks.accountCheckMock.mockReturnValue({
      allowed: false,
      remaining: 0,
      error: "internal",
    });

    const result = await requestPasswordReset(makeFormData("user@example.com"));

    expect(result).toEqual({
      error: "Zu viele Anfragen. Bitte später erneut versuchen.",
    });
    expect(mocks.generateLinkMock).not.toHaveBeenCalled();
    expect(mocks.sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it("case 5: invalid email -> error, no rate-limit / generateLink", async () => {
    const result = await requestPasswordReset(makeFormData("not-an-email"));

    expect(result).toEqual({
      error: "Bitte eine gültige E-Mail-Adresse eingeben",
    });
    expect(mocks.ipCheckMock).not.toHaveBeenCalled();
    expect(mocks.generateLinkMock).not.toHaveBeenCalled();
  });

  it("case 6: sendMail throws -> still ok:true (byte-identical)", async () => {
    mocks.generateLinkMock.mockResolvedValue({
      data: { properties: { hashed_token: "HASHED_ABC" } },
      error: null,
    });
    mocks.sendPasswordResetEmailMock.mockRejectedValueOnce(
      new Error("SMTP down")
    );

    const result = await requestPasswordReset(makeFormData("user@example.com"));

    expect(result).toEqual({ ok: true });
    expect(mocks.captureExceptionMock).toHaveBeenCalledTimes(1);
  });
});
