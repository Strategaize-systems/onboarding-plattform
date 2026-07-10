// V20 Review-Fix — Tests fuer die evidence-download-Route (ISSUE-124 IDOR).
// Wie list/route: Zugriff wird ueber die RLS des user-scoped Clients gegated
// (capture_session sichtbar => erlaubt), der admin-Client (BYPASSRLS) erst danach
// fuer evidence_file + Signed-URL.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { GET } from "./route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function builder(data: unknown) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.single = async () => ({ data });
  b.maybeSingle = async () => ({ data });
  b.then = (resolve: (v: { data: unknown }) => unknown) => resolve({ data });
  return b;
}

interface Setup {
  user: { id: string } | null;
  session: { id: string } | null;
  file?: { id: string; storage_path: string; original_filename: string } | null;
  signedUrl?: { signedUrl: string } | null;
  signedUrlError?: boolean;
}

function wire(s: Setup) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: s.user } }) },
    from: (t: string) =>
      t === "capture_session" ? builder(s.session) : builder(null),
  } as never);
  vi.mocked(createAdminClient).mockReturnValue({
    from: (t: string) =>
      t === "evidence_file" ? builder(s.file ?? null) : builder(null),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: s.signedUrlError ? null : s.signedUrl ?? { signedUrl: "https://signed/url" },
          error: s.signedUrlError ? { message: "fail" } : null,
        }),
      }),
    },
  } as never);
}

const params = Promise.resolve({ sessionId: "sess-1", fileId: "file-1" });
const req = new Request("http://localhost/api/capture/sess-1/evidence/file-1/download");

beforeEach(() => vi.clearAllMocks());

describe("GET evidence/download — RLS-Zugriffs-Gate (ISSUE-124)", () => {
  it("401 ohne User", async () => {
    wire({ user: null, session: null });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(401);
  });

  it("404 wenn RLS die Session filtert (kein Zugriff)", async () => {
    wire({ user: { id: "u1" }, session: null });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(404);
  });

  it("404 wenn die Datei nicht existiert (Session erlaubt)", async () => {
    wire({ user: { id: "u1" }, session: { id: "sess-1" }, file: null });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(404);
  });

  it("200 + signed URL bei RLS-erlaubtem Zugriff", async () => {
    wire({
      user: { id: "u1" },
      session: { id: "sess-1" },
      file: { id: "file-1", storage_path: "t1/f.pdf", original_filename: "f.pdf" },
    });
    const res = await GET(req as never, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.download_url).toBe("https://signed/url");
    expect(body.file_name).toBe("f.pdf");
  });
});
