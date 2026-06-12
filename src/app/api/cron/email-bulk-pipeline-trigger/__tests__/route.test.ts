// V9.1 SLC-V9.1-B MT-2 — POST /api/cron/email-bulk-pipeline-trigger Auth + Wiring.
//
// Unit-Test: runPipelineTrigger + admin + logger gemockt (kein DB-Roundtrip).
// Prueft 503 (kein CRON_SECRET) / 403 (Mismatch) / 200 (Pass) / 500 (Throw).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/bulk-email/pipeline-trigger", () => ({
  runPipelineTrigger: vi.fn(),
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
import { runPipelineTrigger } from "@/lib/bulk-email/pipeline-trigger";

function buildRequest(secretHeader?: string | null): Request {
  const headers: Record<string, string> = {};
  if (secretHeader !== null && secretHeader !== undefined) {
    headers["x-cron-secret"] = secretHeader;
  }
  return new Request("http://localhost/api/cron/email-bulk-pipeline-trigger", {
    method: "POST",
    headers,
  });
}

const EMPTY_SUMMARY = {
  runs_evaluated: 2,
  runs_triggered: 1,
  runs_advanced: 0,
  runs_skipped_cap: 1,
  runs_skipped_threshold: 0,
};

describe("POST /api/cron/email-bulk-pipeline-trigger", () => {
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.CRON_SECRET;
    vi.mocked(runPipelineTrigger).mockReset();
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  it("returns 503 when CRON_SECRET ENV is missing", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(buildRequest("anything"));
    expect(res.status).toBe(503);
    expect(runPipelineTrigger).not.toHaveBeenCalled();
  });

  it("returns 403 when x-cron-secret is missing or wrong", async () => {
    process.env.CRON_SECRET = "test-secret";
    expect((await POST(buildRequest("wrong"))).status).toBe(403);
    expect((await POST(buildRequest(null))).status).toBe(403);
    expect(runPipelineTrigger).not.toHaveBeenCalled();
  });

  it("runs the trigger and returns 200 + summary on a valid secret", async () => {
    process.env.CRON_SECRET = "test-secret";
    vi.mocked(runPipelineTrigger).mockResolvedValue(EMPTY_SUMMARY);

    const res = await POST(buildRequest("test-secret"));
    expect(res.status).toBe(200);
    expect(runPipelineTrigger).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body).toEqual({ success: true, ...EMPTY_SUMMARY });
  });

  it("returns 500 when the trigger throws", async () => {
    process.env.CRON_SECRET = "test-secret";
    vi.mocked(runPipelineTrigger).mockRejectedValue(new Error("boom"));
    const res = await POST(buildRequest("test-secret"));
    expect(res.status).toBe(500);
  });
});
