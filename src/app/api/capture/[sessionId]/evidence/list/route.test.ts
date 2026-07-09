// V20 SLC-193 MT-3 — Tests fuer die evidence/list-Route (Cross-Tenant-Ownership,
// ISSUE-124 IDOR). Prueft, dass der gespiegelte upload-Ownership-Check VOR dem
// admin-Read der evidence-Daten greift.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Chainable + awaitable PostgREST-Builder-Stub. select/eq/order geben sich selbst
// zurueck; single() und await liefern beide { data }.
function builder(data: unknown) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.order = () => b;
  b.single = async () => ({ data });
  b.then = (resolve: (v: { data: unknown }) => unknown) => resolve({ data });
  return b;
}

interface Setup {
  user: { id: string } | null;
  profile: { tenant_id: string; role: string } | null;
  session: { id: string; tenant_id: string } | null;
  files?: unknown[];
  events?: unknown[];
}

function wire(s: Setup) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: s.user } }) },
    // User-Client fragt nur profiles ab.
    from: () => builder(s.profile),
  } as never);
  vi.mocked(createAdminClient).mockReturnValue({
    from: (t: string) => {
      if (t === "capture_session") return builder(s.session);
      if (t === "evidence_file") return builder(s.files ?? []);
      if (t === "capture_events") return builder(s.events ?? []);
      return builder(null);
    },
  } as never);
}

const params = Promise.resolve({ sessionId: "sess-1" });
const req = new Request("http://localhost/api/capture/sess-1/evidence/list");

beforeEach(() => vi.clearAllMocks());

describe("GET evidence/list — Cross-Tenant-Ownership (ISSUE-124)", () => {
  it("401 ohne User", async () => {
    wire({ user: null, profile: null, session: null });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(401);
  });

  it("401 ohne Profil", async () => {
    wire({ user: { id: "u1" }, profile: null, session: null });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(401);
  });

  it("404 bei fehlender Session", async () => {
    wire({
      user: { id: "u1" },
      profile: { tenant_id: "t1", role: "tenant_admin" },
      session: null,
    });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(404);
  });

  it("403 bei Cross-Tenant ohne strategaize_admin (IDOR-Block)", async () => {
    wire({
      user: { id: "u1" },
      profile: { tenant_id: "t-other", role: "tenant_admin" },
      session: { id: "sess-1", tenant_id: "t1" },
    });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(403);
  });

  it("200 bei eigenem Tenant", async () => {
    wire({
      user: { id: "u1" },
      profile: { tenant_id: "t1", role: "tenant_admin" },
      session: { id: "sess-1", tenant_id: "t1" },
      files: [],
      events: [],
    });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("files");
    expect(body).toHaveProperty("analyses");
  });

  it("200 fuer strategaize_admin Cross-Tenant", async () => {
    wire({
      user: { id: "u1" },
      profile: { tenant_id: "t-other", role: "strategaize_admin" },
      session: { id: "sess-1", tenant_id: "t1" },
      files: [],
      events: [],
    });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(200);
  });
});
