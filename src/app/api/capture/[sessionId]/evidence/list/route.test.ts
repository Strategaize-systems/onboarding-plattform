// V20 SLC-193 MT-3 + Review-Fix — Tests fuer die evidence/list-Route
// (Cross-Tenant-Ownership, ISSUE-124 IDOR). Der Zugriff wird ueber die RLS des
// user-scoped Clients gegated (capture_session sichtbar => Zugriff erlaubt), NICHT
// mehr ueber einen starren tenant_id-Vergleich — so bleibt der legitime
// partner-mapping-/berater-Lesezugriff erhalten. Der admin-Client (BYPASSRLS) wird
// erst NACH dem Gate fuer die evidence-Reads genutzt.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Chainable + awaitable PostgREST-Builder-Stub. select/eq/order geben sich selbst
// zurueck; single/maybeSingle und await liefern { data }.
function builder(data: unknown) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.order = () => b;
  b.single = async () => ({ data });
  b.maybeSingle = async () => ({ data });
  b.then = (resolve: (v: { data: unknown }) => unknown) => resolve({ data });
  return b;
}

interface Setup {
  user: { id: string } | null;
  // Was der user-scoped Client (RLS) fuer capture_session zurueckgibt:
  // ein Objekt => Zugriff erlaubt, null => RLS filtert (kein Zugriff).
  session: { id: string } | null;
  files?: unknown[];
  events?: unknown[];
}

function wire(s: Setup) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: s.user } }) },
    // User-Client: RLS-Gate ueber capture_session.
    from: (t: string) =>
      t === "capture_session" ? builder(s.session) : builder(null),
  } as never);
  vi.mocked(createAdminClient).mockReturnValue({
    from: (t: string) => {
      if (t === "evidence_file") return builder(s.files ?? []);
      if (t === "capture_events") return builder(s.events ?? []);
      return builder(null);
    },
  } as never);
}

const params = Promise.resolve({ sessionId: "sess-1" });
const req = new Request("http://localhost/api/capture/sess-1/evidence/list");

beforeEach(() => vi.clearAllMocks());

describe("GET evidence/list — RLS-Zugriffs-Gate (ISSUE-124)", () => {
  it("401 ohne User", async () => {
    wire({ user: null, session: null });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(401);
  });

  it("404 wenn RLS die Session filtert (kein Zugriff / nicht vorhanden)", async () => {
    wire({ user: { id: "u1" }, session: null });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(404);
  });

  it("200 bei RLS-erlaubtem Zugriff (eigener Tenant)", async () => {
    wire({ user: { id: "u1" }, session: { id: "sess-1" }, files: [], events: [] });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("files");
    expect(body).toHaveProperty("analyses");
  });

  it("200 bei RLS-erlaubtem Cross-Tenant-Zugriff (partner-mapping / berater / strategaize_admin)", async () => {
    // RLS gibt die Session zurueck => Zugriff erlaubt, unabhaengig vom eigenen Tenant.
    wire({ user: { id: "u1" }, session: { id: "sess-1" }, files: [], events: [] });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(200);
  });
});
