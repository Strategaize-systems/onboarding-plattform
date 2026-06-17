// V9.75 SLC-V9.75-B MT-4 — Tests fuer die Fahrplan-Report-Route (Auth + Tier-Gate).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/pdf/fahrplan-report", () => ({
  loadFahrplanInput: vi.fn(async () => ({
    sessionId: "s", blocks: [], todos: [], missingSubtopics: [],
    counts: { blocks: 0, requiredGaps: 0, niceToHaveGaps: 0, missingSubtopics: 0 },
  })),
  renderFahrplanReportPdf: vi.fn(async () => Buffer.from("%PDF-1.4 fake-pdf-bytes")),
}));

import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderFahrplanReportPdf } from "@/lib/pdf/fahrplan-report";

// chain-Stub fuer .select().eq().single() → {data}
function single(value: unknown) {
  return { select: () => ({ eq: () => ({ single: async () => ({ data: value }) }) }) };
}

interface Setup {
  user: { id: string } | null;
  profile: { tenant_id: string; role: string } | null;
  session: { tenant_id: string; tier: string } | null;
  rank: number | null;
}

function wire(s: Setup) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: s.user } }) },
    from: () => single(s.profile),
  } as never);
  vi.mocked(createAdminClient).mockReturnValue({
    from: () => single(s.session),
    rpc: async () => ({ data: s.rank }),
  } as never);
}

const params = Promise.resolve({ sessionId: "sess-1" });
const req = new Request("http://localhost/admin/debrief/sess-1/fahrplan-report");

beforeEach(() => vi.clearAllMocks());

describe("GET fahrplan-report — Auth + Tier-Gate", () => {
  it("401 ohne User", async () => {
    wire({ user: null, profile: null, session: null, rank: null });
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
    expect(renderFahrplanReportPdf).not.toHaveBeenCalled();
  });

  it("403 + tier_gate_denied bei free-Session (Rang 0 < blueprint), KEIN Render", async () => {
    wire({
      user: { id: "u1" },
      profile: { tenant_id: "t1", role: "tenant_admin" },
      session: { tenant_id: "t1", tier: "free" },
      rank: 0,
    });
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("tier_gate_denied");
    expect(renderFahrplanReportPdf).not.toHaveBeenCalled();
  });

  it("200 application/pdf bei blueprint-Session (Rang 1)", async () => {
    wire({
      user: { id: "u1" },
      profile: { tenant_id: "t1", role: "tenant_admin" },
      session: { tenant_id: "t1", tier: "blueprint" },
      rank: 1,
    });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(renderFahrplanReportPdf).toHaveBeenCalledOnce();
  });

  it("200 bei handbook-Session (Rang 2)", async () => {
    wire({
      user: { id: "u1" },
      profile: { tenant_id: "t1", role: "tenant_admin" },
      session: { tenant_id: "t1", tier: "handbook" },
      rank: 2,
    });
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
  });

  it("403 bei Cross-Tenant ohne strategaize_admin (vor dem Tier-Gate)", async () => {
    wire({
      user: { id: "u1" },
      profile: { tenant_id: "t-other", role: "tenant_admin" },
      session: { tenant_id: "t1", tier: "handbook" },
      rank: 2,
    });
    const res = await GET(req, { params });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(renderFahrplanReportPdf).not.toHaveBeenCalled();
  });

  it("404 bei fehlender Session", async () => {
    wire({
      user: { id: "u1" },
      profile: { tenant_id: "t1", role: "strategaize_admin" },
      session: null,
      rank: null,
    });
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });
});
