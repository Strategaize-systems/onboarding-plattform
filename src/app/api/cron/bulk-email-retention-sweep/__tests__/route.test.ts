// V9.1 SLC-V9.1-C MT-3 — POST /api/cron/bulk-email-retention-sweep Auth + Wiring.
//
// Unit-Test: runRetentionSweep + store-factory + admin + logger gemockt (kein
// DB-Roundtrip). Prueft 503 (kein CRON_SECRET) / 403 (Mismatch) / 200 (Pass) /
// 500 (Throw).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/workers/retention/handle-bulk-email-retention-sweep", () => ({
  runRetentionSweep: vi.fn(),
  createRetentionStoreFromSupabase: vi.fn(() => ({})),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));
vi.mock("@/lib/logger", () => ({
  captureWarning: vi.fn(),
  captureInfo: vi.fn(),
  captureException: vi.fn(),
}));

import { POST } from "../route";
import { runRetentionSweep } from "@/workers/retention/handle-bulk-email-retention-sweep";

function buildRequest(secretHeader?: string | null): Request {
  const headers: Record<string, string> = {};
  if (secretHeader !== null && secretHeader !== undefined) {
    headers["x-cron-secret"] = secretHeader;
  }
  return new Request("http://localhost/api/cron/bulk-email-retention-sweep", {
    method: "POST",
    headers,
  });
}

const SUMMARY = {
  runs_evaluated: 0,
  soft_deleted_runs: 0,
  hard_deleted_runs: 0,
  skipped_imported: 0,
  deleted_storage_objects: 0,
  storage_errors: 0,
  duration_ms: 4,
};

describe("POST /api/cron/bulk-email-retention-sweep", () => {
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.CRON_SECRET;
    vi.mocked(runRetentionSweep).mockReset();
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  it("returns 503 when CRON_SECRET ENV is missing", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(buildRequest("anything"));
    expect(res.status).toBe(503);
    expect(runRetentionSweep).not.toHaveBeenCalled();
  });

  it("returns 403 when x-cron-secret is missing or wrong", async () => {
    process.env.CRON_SECRET = "test-secret";
    expect((await POST(buildRequest("wrong"))).status).toBe(403);
    expect((await POST(buildRequest(null))).status).toBe(403);
    expect(runRetentionSweep).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns 200 + summary on a valid secret", async () => {
    process.env.CRON_SECRET = "test-secret";
    vi.mocked(runRetentionSweep).mockResolvedValue(SUMMARY);

    const res = await POST(buildRequest("test-secret"));
    expect(res.status).toBe(200);
    expect(runRetentionSweep).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body).toEqual({ success: true, ...SUMMARY });
  });

  it("returns 500 when the sweep throws", async () => {
    process.env.CRON_SECRET = "test-secret";
    vi.mocked(runRetentionSweep).mockRejectedValue(new Error("boom"));
    const res = await POST(buildRequest("test-secret"));
    expect(res.status).toBe(500);
  });
});
