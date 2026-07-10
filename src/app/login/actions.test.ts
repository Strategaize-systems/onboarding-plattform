// SLC-195 MT-1 — Login-Action-Test. AC-195-1: account-scoped Lockout,
// IP-Rotation wirkungslos, generische Fehlermeldung (kein Enumeration-Leak).
// Reale rate-limit-Singletons (unique emails/IPs pro Test → keine Kollision);
// createClient/redirect/headers/logger gemockt.

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  ip: "10.0.0.1",
  signInResult: { error: null } as { error: null | { message: string; status?: number } },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (k: string) => (k === "x-forwarded-for" ? h.ip : null),
  })),
}));

const signInMock = vi.fn(async () => h.signInResult);
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithPassword: signInMock },
  })),
}));

vi.mock("@/lib/logger", () => ({ captureException: vi.fn() }));

import { login } from "./actions";

function fd(email: string, password: string): FormData {
  const f = new FormData();
  f.set("email", email);
  f.set("password", password);
  return f;
}

const GENERIC = "E-Mail oder Passwort ungültig";

beforeEach(() => {
  signInMock.mockClear();
  h.signInResult = { error: null };
  h.ip = "10.0.0.1";
});

describe("login (SLC-195 MT-1)", () => {
  it("returns a generic error on bad credentials (no enumeration leak)", async () => {
    h.signInResult = { error: { message: "Invalid login credentials", status: 400 } };
    const r = await login(fd("user1@example.com", "wrong"));
    expect(r).toEqual({ error: GENERIC });
    // Kein verbatim GoTrue-Wortlaut.
    expect(r?.error).not.toContain("Invalid login");
  });

  it("locks the account after 5 failures and blocks the 6th even from a fresh IP (GoTrue untouched)", async () => {
    h.signInResult = { error: { message: "Invalid login credentials", status: 400 } };
    const email = "lockme@example.com";
    for (let i = 0; i < 5; i++) {
      h.ip = `10.1.0.${i}`; // rotierende IPs
      await login(fd(email, "wrong"));
    }
    expect(signInMock).toHaveBeenCalledTimes(5);

    h.ip = "10.1.0.250"; // komplett neue IP
    const r6 = await login(fd(email, "wrong"));
    expect(r6).toEqual({ error: GENERIC });
    // peek-before-signin blockte → signInWithPassword NICHT erneut aufgerufen.
    expect(signInMock).toHaveBeenCalledTimes(5);
  });

  it("successful login clears the lockout and redirects", async () => {
    h.signInResult = { error: null };
    await expect(login(fd("good@example.com", "right"))).rejects.toThrow("NEXT_REDIRECT");
    expect(signInMock).toHaveBeenCalledTimes(1);
  });

  it("still validates required fields before touching the limiter", async () => {
    const r = await login(fd("", ""));
    expect(r).toEqual({ error: "E-Mail und Passwort sind erforderlich" });
    expect(signInMock).not.toHaveBeenCalled();
  });
});
