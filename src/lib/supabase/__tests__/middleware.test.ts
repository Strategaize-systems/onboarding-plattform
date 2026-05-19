// BL-111 (V7 ISSUE-078) — updateSession() Whitelist-Smoke
//
// Verifiziert dass /api/public/* und /auth/verify-signup von der
// updateSession-Whitelist nicht zu /login umgeleitet werden, wenn der
// User nicht eingeloggt ist. Diese Routen haben eigene Auth-Logik
// (x-strategaize-service-key Header bzw. Token-Hash-Lookup) und muessen
// die Session-Middleware umgehen.
//
// Pre-Fix Bug: /api/public/signup wurde mit HTTP 307 -> /login redirected
// bevor der Route-Handler den Service-Key validieren konnte. Slice-/qa
// (SLC-131..135) hat das nicht gefunden weil Vitest die Route-Handler
// direkt importierte (POST(request)) und den Proxy-Layer komplett
// umging. Dieser Test ruft updateSession() direkt auf und faengt die
// Whitelist-Regression ab.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUserMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: getUserMock,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null }),
        }),
      }),
    }),
  }),
}));

import { updateSession } from "../middleware";

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`));
}

describe("updateSession — V7 Public-Route-Whitelist (ISSUE-078)", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: null } });
  });

  it("durchlaesst /api/public/signup ohne Redirect zu /login", async () => {
    const response = await updateSession(makeRequest("/api/public/signup"));

    expect(response.status).not.toBe(307);
    expect(response.headers.get("location")).toBeNull();
  });

  it("durchlaesst /api/public/partner/:slug ohne Redirect", async () => {
    const response = await updateSession(
      makeRequest("/api/public/partner/qa-steuerberater-demo")
    );

    expect(response.status).not.toBe(307);
    expect(response.headers.get("location")).toBeNull();
  });

  it("durchlaesst /auth/verify-signup ohne Redirect", async () => {
    const response = await updateSession(
      makeRequest("/auth/verify-signup?token=abcdef")
    );

    expect(response.status).not.toBe(307);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirected geschuetzte Route zu /login wenn User null", async () => {
    const response = await updateSession(makeRequest("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("redirected /api/protected/* zu /login wenn User null", async () => {
    const response = await updateSession(makeRequest("/api/jobs/list"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
  });
});
