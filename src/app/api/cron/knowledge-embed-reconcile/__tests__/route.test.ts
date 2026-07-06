// V10.2.1 SLC-185 MT-3 — Hermetische Vitest-Cases gegen
// `GET /api/cron/knowledge-embed-reconcile`.
//
// Abweichend vom Coolify-DB-Test des Vorbilds (pending-signup-cleanup): PRD fordert
// explizit hermetische Tests — Orchestrator + Admin-Client + Logger via vi.mock,
// kein DB-Touch. ENV-Save/Restore-Pattern wie im Vorbild-Test.
//
// Cases (Spec SLC-185 MT-3, a–d):
//   a. 503 ohne CRON_SECRET-ENV, Orchestrator NICHT aufgerufen
//   b. 403 bei Secret-Mismatch, Orchestrator NICHT aufgerufen
//   c. 200 + Summary-JSON bei korrektem Secret
//   d. 500 bei Orchestrator-Throw

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../route";
import { reconcileEmbeddings } from "@/lib/workspace/reconcile-embeddings";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/workspace/reconcile-embeddings", () => ({
  reconcileEmbeddings: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({ __admin: true }),
}));

vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
  captureWarning: vi.fn(),
}));

const CRON_TEST_SECRET = "reconcile-test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const SUMMARY = {
  tenantsChecked: 3,
  tenantsWithGap: 1,
  chunksReembedded: 5,
  failures: 0,
  capped: false,
};

let previousSecret: string | undefined;

function setCronSecret(value?: string): void {
  if (value === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = value;
  }
}

function buildRequest(secretHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (secretHeader !== undefined) {
    headers["x-cron-secret"] = secretHeader;
  }
  return new Request("http://localhost/api/cron/knowledge-embed-reconcile", {
    method: "GET",
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(reconcileEmbeddings).mockResolvedValue(SUMMARY);
  previousSecret = process.env.CRON_SECRET;
});

afterEach(() => {
  setCronSecret(previousSecret);
});

describe("GET /api/cron/knowledge-embed-reconcile", () => {
  it("a) 503 ohne CRON_SECRET-ENV — Orchestrator NICHT aufgerufen (kein DB-Touch)", async () => {
    setCronSecret(undefined);

    const res = await GET(buildRequest(CRON_TEST_SECRET));

    expect(res.status).toBe(503);
    expect(reconcileEmbeddings).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("b) 403 bei Secret-Mismatch — Orchestrator NICHT aufgerufen", async () => {
    setCronSecret(CRON_TEST_SECRET);

    const res = await GET(buildRequest("wrong-secret"));

    expect(res.status).toBe(403);
    expect(reconcileEmbeddings).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("c) 200 + Summary-JSON bei korrektem Secret", async () => {
    setCronSecret(CRON_TEST_SECRET);

    const res = await GET(buildRequest(CRON_TEST_SECRET));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true, ...SUMMARY });
    expect(reconcileEmbeddings).toHaveBeenCalledTimes(1);
    expect(reconcileEmbeddings).toHaveBeenCalledWith({ __admin: true });
  });

  it("d) 500 bei Orchestrator-Throw", async () => {
    setCronSecret(CRON_TEST_SECRET);
    vi.mocked(reconcileEmbeddings).mockRejectedValue(new Error("enumeration failed"));

    const res = await GET(buildRequest(CRON_TEST_SECRET));

    expect(res.status).toBe(500);
  });
});
