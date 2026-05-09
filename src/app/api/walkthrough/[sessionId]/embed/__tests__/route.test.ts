// SLC-091 MT-5 — Tests fuer /api/walkthrough/[sessionId]/embed Storage-Proxy.
// Deterministisch via Mock fuer createClient (SSR), createAdminClient
// (service-role storage), und Logger.

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock-Setup ---
const getUserMock = vi.fn();
const rpcMock = vi.fn();
const downloadMock = vi.fn();

vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: getUserMock,
    },
    rpc: rpcMock,
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        download: downloadMock,
      }),
    },
  }),
}));

import { GET } from "../route";

const SESSION_ID = "75098a5d-1234-5678-9abc-def012345678";
const TENANT_A = "00000000-0000-0000-0000-00000000000a";

function makeRequest(rangeHeader?: string): Request {
  const headers = new Headers();
  if (rangeHeader) headers.set("range", rangeHeader);
  return new Request(`http://localhost/api/walkthrough/${SESSION_ID}/embed`, {
    method: "GET",
    headers,
  });
}

function makeBlob(size: number): Blob {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) buf[i] = i % 256;
  return new Blob([buf], { type: "video/webm" });
}

describe("GET /api/walkthrough/[sessionId]/embed", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    rpcMock.mockReset();
    downloadMock.mockReset();
  });

  it("400 wenn sessionId leer", async () => {
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ sessionId: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("401 wenn nicht authentifiziert", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("403 wenn RPC forbidden zurueckliefert", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({ data: { error: "forbidden" }, error: null });
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("404 wenn RPC not_found zurueckliefert", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({ data: { error: "not_found" }, error: null });
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("409 wenn RPC not_approved zurueckliefert", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({
      data: { error: "not_approved", status: "pending_review" },
      error: null,
    });
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });
    expect(res.status).toBe(409);
  });

  it("200 + Full Body ohne Range-Header", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({
      data: {
        storage_path: `${TENANT_A}/${SESSION_ID}/recording.webm`,
        created_at: "2026-05-08T09:00:00Z",
      },
      error: null,
    });
    downloadMock.mockResolvedValue({ data: makeBlob(1024), error: null });

    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/webm");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Length")).toBe("1024");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("206 + Content-Range mit Range-Header", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({
      data: {
        storage_path: `${TENANT_A}/${SESSION_ID}/recording.webm`,
        created_at: "2026-05-08T09:00:00Z",
      },
      error: null,
    });
    downloadMock.mockResolvedValue({ data: makeBlob(2048), error: null });

    const res = await GET(makeRequest("bytes=0-1023") as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-1023/2048");
    expect(res.headers.get("Content-Length")).toBe("1024");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("206 mit offenem Range-End (bytes=N-) liefert bis EOF", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({
      data: {
        storage_path: `${TENANT_A}/${SESSION_ID}/recording.webm`,
        created_at: "2026-05-08T09:00:00Z",
      },
      error: null,
    });
    downloadMock.mockResolvedValue({ data: makeBlob(1000), error: null });

    const res = await GET(makeRequest("bytes=500-") as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 500-999/1000");
    expect(res.headers.get("Content-Length")).toBe("500");
  });

  it("416 bei out-of-bounds Range", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({
      data: {
        storage_path: `${TENANT_A}/${SESSION_ID}/recording.webm`,
        created_at: "2026-05-08T09:00:00Z",
      },
      error: null,
    });
    downloadMock.mockResolvedValue({ data: makeBlob(100), error: null });

    const res = await GET(makeRequest("bytes=200-300") as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */100");
  });

  it("416 bei malformed Range-Header", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({
      data: {
        storage_path: `${TENANT_A}/${SESSION_ID}/recording.webm`,
        created_at: "2026-05-08T09:00:00Z",
      },
      error: null,
    });
    downloadMock.mockResolvedValue({ data: makeBlob(100), error: null });

    const res = await GET(makeRequest("invalid-range") as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });
    expect(res.status).toBe(416);
  });

  it("500 bei RPC-Error", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({ data: null, error: { message: "db down" } });
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });
    expect(res.status).toBe(500);
  });

  it("500 bei Storage-Download-Error", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    rpcMock.mockResolvedValue({
      data: {
        storage_path: `${TENANT_A}/${SESSION_ID}/recording.webm`,
        created_at: "2026-05-08T09:00:00Z",
      },
      error: null,
    });
    downloadMock.mockResolvedValue({ data: null, error: { message: "missing" } });

    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ sessionId: SESSION_ID }),
    });
    expect(res.status).toBe(500);
  });
});
