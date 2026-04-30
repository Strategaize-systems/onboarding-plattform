import { describe, it, expect, vi } from "vitest";

const updateMock = vi.fn();

vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          select: updateMock,
        }),
      }),
    }),
  }),
}));

import { GET } from "../route";

const validToken =
  "a".repeat(64); // matches /^[a-f0-9]{16,128}$/

describe("GET /api/unsubscribe/[token]", () => {
  it("returns 200 + success page when token matches a row", async () => {
    updateMock.mockResolvedValueOnce({
      data: [{ user_id: "u1" }],
      error: null,
    });
    const req = new Request(
      `http://localhost/api/unsubscribe/${validToken}`
    );
    const res = await GET(req, {
      params: Promise.resolve({ token: validToken }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("Du wirst keine weiteren Erinnerungen erhalten");
  });

  it("returns 404 + neutral page when token does not match (no existence leak)", async () => {
    updateMock.mockResolvedValueOnce({ data: [], error: null });
    const req = new Request(
      `http://localhost/api/unsubscribe/${validToken}`
    );
    const res = await GET(req, {
      params: Promise.resolve({ token: validToken }),
    });
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain("nicht gueltig");
    // Existence leak guard: must not say "user not found", "no such token", etc.
    expect(body.toLowerCase()).not.toContain("user");
    expect(body.toLowerCase()).not.toContain("token");
  });

  it("returns 404 for malformed token without hitting the DB", async () => {
    updateMock.mockClear();
    const req = new Request("http://localhost/api/unsubscribe/notatoken");
    const res = await GET(req, {
      params: Promise.resolve({ token: "notatoken" }),
    });
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
