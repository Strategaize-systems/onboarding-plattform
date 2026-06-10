// V9.1 SLC-V9.1-A MT-R6 — POST /api/cron/inbound-email-imap-sync Auth + Wiring.
//
// Unit-Test: syncInboundEmails + logger gemockt (kein DB-/IMAP-Roundtrip).
// Prueft 503 (kein CRON_SECRET) / 403 (Mismatch) / 200 (Pass -> sync aufgerufen)
// / 500 (Throw).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/inbound-email/imap-sync", () => ({
  syncInboundEmails: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  captureWarning: vi.fn(),
  captureInfo: vi.fn(),
  captureException: vi.fn(),
}));

import { POST } from "../route";
import { syncInboundEmails } from "@/lib/inbound-email/imap-sync";

function buildRequest(secretHeader?: string | null): Request {
  const headers: Record<string, string> = {};
  if (secretHeader !== null && secretHeader !== undefined) {
    headers["x-cron-secret"] = secretHeader;
  }
  return new Request("http://localhost/api/cron/inbound-email-imap-sync", {
    method: "POST",
    headers,
  });
}

describe("POST /api/cron/inbound-email-imap-sync", () => {
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.CRON_SECRET;
    vi.mocked(syncInboundEmails).mockReset();
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  it("returns 503 when CRON_SECRET ENV is missing", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(buildRequest("anything"));
    expect(res.status).toBe(503);
    expect(syncInboundEmails).not.toHaveBeenCalled();
  });

  it("returns 403 when x-cron-secret is missing or wrong", async () => {
    process.env.CRON_SECRET = "test-secret";
    expect((await POST(buildRequest("wrong"))).status).toBe(403);
    expect((await POST(buildRequest(null))).status).toBe(403);
    expect(syncInboundEmails).not.toHaveBeenCalled();
  });

  it("runs the sync and returns 200 + stats on a valid secret", async () => {
    process.env.CRON_SECRET = "test-secret";
    vi.mocked(syncInboundEmails).mockResolvedValue({
      synced: 3,
      skipped: 1,
      errors: 0,
      lastUid: 42,
    });

    const res = await POST(buildRequest("test-secret"));
    expect(res.status).toBe(200);
    expect(syncInboundEmails).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      synced: 3,
      skipped: 1,
      errors: 0,
      lastUid: 42,
    });
  });

  it("returns 500 when the sync throws", async () => {
    process.env.CRON_SECRET = "test-secret";
    vi.mocked(syncInboundEmails).mockRejectedValue(new Error("boom"));

    const res = await POST(buildRequest("test-secret"));
    expect(res.status).toBe(500);
  });
});
