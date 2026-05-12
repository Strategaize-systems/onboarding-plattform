// SLC-104 MT-7 — Tests fuer /api/partner-branding/[partner_tenant_id]/logo Storage-Proxy.
// Deterministisch via Mock fuer createClient (SSR + RPC) + createAdminClient
// (service-role storage) + Logger. Pattern-Reuse aus SLC-091 embed-Route-Test.

import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const downloadMock = vi.fn();
const captureExceptionMock = vi.fn();

vi.mock("@/lib/logger", () => ({
  captureException: captureExceptionMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
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

const PARTNER_TENANT_ID = "00000000-0000-0000-0000-000000000abc";

function makeRequest(): Request {
  return new Request(
    `http://localhost/api/partner-branding/${PARTNER_TENANT_ID}/logo`,
    { method: "GET" },
  );
}

function makeImageBlob(size: number, type: string): Blob {
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i++) buf[i] = i % 256;
  return new Blob([buf], { type });
}

describe("GET /api/partner-branding/[partner_tenant_id]/logo", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    downloadMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("400 wenn partner_tenant_id leer", async () => {
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ partner_tenant_id: "" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("400 wenn partner_tenant_id kein valides UUID-Format hat (Pre-Validate-Guard)", async () => {
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ partner_tenant_id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_REQUEST");
    // RPC darf gar nicht aufgerufen werden — Validation bricht vorher ab.
    expect(rpcMock).not.toHaveBeenCalled();
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("404 wenn RPC null zurueckliefert (Branding nicht gefunden)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ partner_tenant_id: PARTNER_TENANT_ID }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("404 wenn RPC liefert Branding ohne Logo (logo_url=null, Direct-Client-Default)", async () => {
    rpcMock.mockResolvedValue({
      data: {
        logo_url: null,
        primary_color: "#4454b8",
        secondary_color: null,
        display_name: "Strategaize",
      },
      error: null,
    });
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ partner_tenant_id: PARTNER_TENANT_ID }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("500 wenn RPC einen Fehler signalisiert (Logger captureException)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "rpc execution failed" },
    });
    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ partner_tenant_id: PARTNER_TENANT_ID }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("500 wenn Storage-Download fehlschlaegt obwohl Branding+logo_url vorhanden", async () => {
    rpcMock.mockResolvedValue({
      data: {
        logo_url: "tenant-abc/logo.png",
        primary_color: "#ff0000",
        secondary_color: null,
        display_name: "Test-Partner",
      },
      error: null,
    });
    downloadMock.mockResolvedValue({ data: null, error: { message: "blob_missing" } });

    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ partner_tenant_id: PARTNER_TENANT_ID }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("200 Happy Path PNG: gibt Bytes mit korrektem Content-Type + Cache-Control zurueck", async () => {
    rpcMock.mockResolvedValue({
      data: {
        logo_url: "tenant-abc/logo.png",
        primary_color: "#ff0000",
        secondary_color: null,
        display_name: "Test-Partner",
      },
      error: null,
    });
    const blob = makeImageBlob(2048, "image/png");
    downloadMock.mockResolvedValue({ data: blob, error: null });

    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ partner_tenant_id: PARTNER_TENANT_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Length")).toBe("2048");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(2048);
  });

  it("200 Happy Path SVG: Content-Type=image/svg+xml", async () => {
    rpcMock.mockResolvedValue({
      data: {
        logo_url: "tenant-abc/logo.svg",
        primary_color: "#00ff00",
        secondary_color: null,
        display_name: "SVG-Partner",
      },
      error: null,
    });
    const blob = makeImageBlob(512, "image/svg+xml");
    downloadMock.mockResolvedValue({ data: blob, error: null });

    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ partner_tenant_id: PARTNER_TENANT_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
  });

  it("200 Happy Path JPEG (.jpg): Content-Type=image/jpeg", async () => {
    rpcMock.mockResolvedValue({
      data: {
        logo_url: "tenant-abc/logo.jpg",
        primary_color: "#0000ff",
        secondary_color: null,
        display_name: "JPG-Partner",
      },
      error: null,
    });
    const blob = makeImageBlob(1024, "image/jpeg");
    downloadMock.mockResolvedValue({ data: blob, error: null });

    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ partner_tenant_id: PARTNER_TENANT_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("200 Happy Path JPEG (.jpeg): Content-Type=image/jpeg (Extension-Variant)", async () => {
    rpcMock.mockResolvedValue({
      data: {
        logo_url: "tenant-abc/logo.jpeg",
        primary_color: "#abcdef",
        secondary_color: null,
        display_name: "JPEG-Partner",
      },
      error: null,
    });
    const blob = makeImageBlob(1024, "image/jpeg");
    downloadMock.mockResolvedValue({ data: blob, error: null });

    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ partner_tenant_id: PARTNER_TENANT_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("200 Happy Path mit unbekannter Extension: Content-Type=application/octet-stream (Fallback)", async () => {
    rpcMock.mockResolvedValue({
      data: {
        logo_url: "tenant-abc/logo.bin",
        primary_color: "#123456",
        secondary_color: null,
        display_name: "Edge-Case-Partner",
      },
      error: null,
    });
    const blob = makeImageBlob(256, "application/octet-stream");
    downloadMock.mockResolvedValue({ data: blob, error: null });

    const res = await GET(makeRequest() as never, {
      params: Promise.resolve({ partner_tenant_id: PARTNER_TENANT_ID }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });
});
