// SLC-195 MT-4 — Route-Seam-Test fuer recording-ready. AC-195-4: timing-safe
// Secret (falscher Secret → 401) + Path-Traversal-Guard (`../` → 400, non-mp4 →
// 400, ausserhalb Base → 400). verifyServiceKey ist REAL (echtes timingSafeEqual).
// Alle geprueften Pfade returnen VOR readFile → kein fs-Mock noetig.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Session-Lookup gibt null → 404 (beweist: Auth + Path-Guard passiert).
const singleMock = vi.fn(async () => ({ data: null, error: { message: "not found" } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: singleMock }) }),
    }),
  }),
}));
vi.mock("@/lib/auth/assert-session-tier", () => ({
  assertSessionTierAllows: vi.fn(async () => ({ allowed: true, tier: "handbook" })),
}));

import { POST } from "./route";

const SECRET = "recording-webhook-secret-value";
const BASE = "/recordings";

function req(auth: string | null, body: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth !== null) headers.authorization = auth;
  return new Request("http://localhost/api/dialogue/recording-ready", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  singleMock.mockClear();
  process.env.RECORDING_WEBHOOK_SECRET = SECRET;
  process.env.JIBRI_RECORDINGS_DIR = BASE;
});

describe("POST /api/dialogue/recording-ready (SLC-195 MT-4)", () => {
  it("401 when the bearer secret is wrong (timing-safe)", async () => {
    const res = await POST(req(`Bearer ${SECRET}-WRONG`, { room_name: "r", file_path: `${BASE}/r/rec.mp4` }));
    expect(res.status).toBe(401);
    expect(singleMock).not.toHaveBeenCalled();
  });

  it("401 when the authorization header is missing", async () => {
    const res = await POST(req(null, { room_name: "r", file_path: `${BASE}/r/rec.mp4` }));
    expect(res.status).toBe(401);
  });

  it("400 on path traversal (`..`)", async () => {
    const res = await POST(req(`Bearer ${SECRET}`, { room_name: "r", file_path: `${BASE}/../etc/passwd.mp4` }));
    expect(res.status).toBe(400);
    expect(singleMock).not.toHaveBeenCalled();
  });

  it("400 on a non-.mp4 file", async () => {
    const res = await POST(req(`Bearer ${SECRET}`, { room_name: "r", file_path: `${BASE}/r/rec.txt` }));
    expect(res.status).toBe(400);
  });

  it("400 on a path outside the recordings base", async () => {
    const res = await POST(req(`Bearer ${SECRET}`, { room_name: "r", file_path: "/etc/shadow.mp4" }));
    expect(res.status).toBe(400);
  });

  it("400 fail-closed when JIBRI_RECORDINGS_DIR is unset", async () => {
    delete process.env.JIBRI_RECORDINGS_DIR;
    const res = await POST(req(`Bearer ${SECRET}`, { room_name: "r", file_path: `${BASE}/r/rec.mp4` }));
    expect(res.status).toBe(400);
  });

  it("passes auth + guard for a valid path (404 because session not found)", async () => {
    const res = await POST(req(`Bearer ${SECRET}`, { room_name: "r", file_path: `${BASE}/r/rec.mp4` }));
    expect(res.status).toBe(404);
    expect(singleMock).toHaveBeenCalledTimes(1);
  });
});
