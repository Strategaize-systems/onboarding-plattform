import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  captureWarning: vi.fn(),
  captureInfo: vi.fn(),
  captureException: vi.fn(),
}));

// Per-test override: each test installs its own mock chain via mockImplementation.
// We mock the admin client at module level and supply an in-memory state machine.
const supabaseMock = {
  state: {
    walkthrough_session: [] as Array<{
      id: string;
      status: string;
      storage_path: string | null;
      storage_bucket: string | null;
      reviewed_at: string | null;
      created_at: string;
      updated_at: string;
    }>,
    deletedStoragePaths: [] as string[],
    deletedSessionIds: [] as string[],
    updatedSessions: [] as Array<{ id: string; status: string }>,
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    return {
      from(table: string) {
        if (table !== "walkthrough_session") {
          // No-op for any other table (e.g. error_log inserts).
          return {
            insert: () => ({ error: null }),
            select: () => ({
              eq: () => ({ lt: () => Promise.resolve({ data: [], error: null }) }),
              in: () => ({ lt: () => Promise.resolve({ data: [], error: null }) }),
            }),
          };
        }
        return {
          select(_cols: string) {
            return {
              eq(_col: string, status: string) {
                return {
                  async lt(timeCol: string, cutoff: string) {
                    const data = supabaseMock.state.walkthrough_session.filter((r) => {
                      if (r.status !== status) return false;
                      const v = (r as Record<string, unknown>)[timeCol] as string | null;
                      return v !== null && v < cutoff;
                    });
                    return { data, error: null };
                  },
                };
              },
              in(_col: string, statuses: string[]) {
                return {
                  async lt(timeCol: string, cutoff: string) {
                    const data = supabaseMock.state.walkthrough_session.filter((r) => {
                      if (!statuses.includes(r.status)) return false;
                      const v = (r as Record<string, unknown>)[timeCol] as string | null;
                      return v !== null && v < cutoff;
                    });
                    return { data, error: null };
                  },
                };
              },
            };
          },
          delete() {
            return {
              async eq(_col: string, id: string) {
                supabaseMock.state.deletedSessionIds.push(id);
                supabaseMock.state.walkthrough_session =
                  supabaseMock.state.walkthrough_session.filter((r) => r.id !== id);
                return { error: null };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              async eq(_col: string, id: string) {
                const row = supabaseMock.state.walkthrough_session.find((r) => r.id === id);
                if (row) {
                  if (typeof patch.status === "string") row.status = patch.status;
                  supabaseMock.state.updatedSessions.push({ id, status: row.status });
                }
                return { error: null };
              },
            };
          },
        };
      },
      storage: {
        from(_bucket: string) {
          return {
            async remove(paths: string[]) {
              supabaseMock.state.deletedStoragePaths.push(...paths);
              return { error: null };
            },
          };
        },
      },
    };
  },
}));

import { POST } from "../route";

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  supabaseMock.state.walkthrough_session = [];
  supabaseMock.state.deletedStoragePaths = [];
  supabaseMock.state.deletedSessionIds = [];
  supabaseMock.state.updatedSessions = [];
});

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

describe("POST /api/cron/walkthrough-cleanup — happy path", () => {
  it("deletes rejected >30d, deletes failed >7d, marks stale-pipeline >1h as failed", async () => {
    supabaseMock.state.walkthrough_session = [
      // rejected, alt genug → delete
      {
        id: "r-old",
        status: "rejected",
        storage_path: "tenant1/r-old.webm",
        storage_bucket: "walkthroughs",
        reviewed_at: ago(31 * 24 * 60 * 60 * 1000),
        created_at: ago(40 * 24 * 60 * 60 * 1000),
        updated_at: ago(31 * 24 * 60 * 60 * 1000),
      },
      // rejected, frisch → behalten
      {
        id: "r-fresh",
        status: "rejected",
        storage_path: "tenant1/r-fresh.webm",
        storage_bucket: "walkthroughs",
        reviewed_at: ago(5 * 24 * 60 * 60 * 1000),
        created_at: ago(10 * 24 * 60 * 60 * 1000),
        updated_at: ago(5 * 24 * 60 * 60 * 1000),
      },
      // failed, alt genug → delete
      {
        id: "f-old",
        status: "failed",
        storage_path: "tenant1/f-old.webm",
        storage_bucket: "walkthroughs",
        reviewed_at: null,
        created_at: ago(8 * 24 * 60 * 60 * 1000),
        updated_at: ago(8 * 24 * 60 * 60 * 1000),
      },
      // stale transcribing → mark failed
      {
        id: "s-trans",
        status: "transcribing",
        storage_path: "tenant1/s-trans.webm",
        storage_bucket: "walkthroughs",
        reviewed_at: null,
        created_at: ago(2 * 60 * 60 * 1000),
        updated_at: ago(2 * 60 * 60 * 1000),
      },
      // stale mapping → mark failed
      {
        id: "s-map",
        status: "mapping",
        storage_path: "tenant1/s-map.webm",
        storage_bucket: "walkthroughs",
        reviewed_at: null,
        created_at: ago(2 * 60 * 60 * 1000),
        updated_at: ago(2 * 60 * 60 * 1000),
      },
      // recording fresh → ignored
      {
        id: "rec-fresh",
        status: "recording",
        storage_path: null,
        storage_bucket: "walkthroughs",
        reviewed_at: null,
        created_at: ago(5 * 60 * 1000),
        updated_at: ago(5 * 60 * 1000),
      },
    ];

    const req = new Request("http://localhost/api/cron/walkthrough-cleanup", {
      method: "POST",
      headers: { "x-cron-secret": "test-secret" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      rejected_count: number;
      failed_count: number;
      stale_pipeline_count: number;
    };
    expect(body).toEqual({
      ok: true,
      rejected_count: 1,
      failed_count: 1,
      stale_pipeline_count: 2,
    });

    // Storage cleanup happened for r-old + f-old (not for stale, file stays for forensic).
    expect(supabaseMock.state.deletedStoragePaths.sort()).toEqual([
      "tenant1/f-old.webm",
      "tenant1/r-old.webm",
    ]);
    // DB-Delete only for rejected+failed.
    expect(supabaseMock.state.deletedSessionIds.sort()).toEqual(["f-old", "r-old"]);
    // Stale → marked failed (UPDATE).
    expect(supabaseMock.state.updatedSessions.map((s) => s.id).sort()).toEqual([
      "s-map",
      "s-trans",
    ]);
    // Fresh entries untouched.
    expect(supabaseMock.state.walkthrough_session.map((r) => r.id).sort()).toEqual([
      "r-fresh",
      "rec-fresh",
      "s-map",
      "s-trans",
    ]);
  });
});

describe("POST /api/cron/walkthrough-cleanup — idempotency", () => {
  it("second run on the same day finds 0 rejected/failed (already cleaned) and 0 stale (already failed but recently updated)", async () => {
    // Erste Sitzung legt eine rejected + eine stale ab.
    supabaseMock.state.walkthrough_session = [
      {
        id: "r-old",
        status: "rejected",
        storage_path: "tenant1/r-old.webm",
        storage_bucket: "walkthroughs",
        reviewed_at: ago(31 * 24 * 60 * 60 * 1000),
        created_at: ago(40 * 24 * 60 * 60 * 1000),
        updated_at: ago(31 * 24 * 60 * 60 * 1000),
      },
      {
        id: "s-trans",
        status: "transcribing",
        storage_path: "tenant1/s-trans.webm",
        storage_bucket: "walkthroughs",
        reviewed_at: null,
        created_at: ago(2 * 60 * 60 * 1000),
        updated_at: ago(2 * 60 * 60 * 1000),
      },
    ];

    const req1 = new Request("http://localhost/api/cron/walkthrough-cleanup", {
      method: "POST",
      headers: { "x-cron-secret": "test-secret" },
    });
    const r1 = await POST(req1);
    expect(r1.status).toBe(200);
    const body1 = (await r1.json()) as {
      rejected_count: number;
      failed_count: number;
      stale_pipeline_count: number;
    };
    expect(body1.rejected_count).toBe(1);
    expect(body1.stale_pipeline_count).toBe(1);

    // Nach Run 1: r-old deleted, s-trans status=failed (kommt jetzt in failed-Pfad,
    // aber created_at ist nur 2h alt → noch nicht > 7d → wird NICHT geloescht).
    // Update updated_at (per UPDATE-Trigger _set_updated_at) → liegt jetzt bei
    // ~jetzt. Im Mock wird updated_at nicht autom. gesetzt; das ist akzeptabel —
    // wir testen nur, dass der zweite Run keine NEUEN Cleanups produziert.

    // Reset des Updates-Trackers vor Run 2:
    supabaseMock.state.deletedStoragePaths = [];
    supabaseMock.state.deletedSessionIds = [];
    supabaseMock.state.updatedSessions = [];

    // Im Mock: updated_at fuer s-trans bleibt auf -2h, weil unsere Mock-update()
    // den updated_at nicht refresht. Damit Idempotenz-Check trotzdem realistisch
    // wird, simulieren wir den Trigger-Effekt manuell:
    const stale = supabaseMock.state.walkthrough_session.find((r) => r.id === "s-trans");
    if (stale) stale.updated_at = new Date().toISOString();

    const req2 = new Request("http://localhost/api/cron/walkthrough-cleanup", {
      method: "POST",
      headers: { "x-cron-secret": "test-secret" },
    });
    const r2 = await POST(req2);
    const body2 = (await r2.json()) as {
      rejected_count: number;
      failed_count: number;
      stale_pipeline_count: number;
    };
    // Kein Neueintrag landet im rejected-, failed-, oder stale-Pfad (failed
    // ist erst 2h alt; stale ist jetzt 'failed' und nicht mehr in den Stages).
    expect(body2).toEqual({
      ok: true,
      rejected_count: 0,
      failed_count: 0,
      stale_pipeline_count: 0,
    });
    expect(supabaseMock.state.deletedStoragePaths).toEqual([]);
    expect(supabaseMock.state.updatedSessions).toEqual([]);
  });
});

describe("POST /api/cron/walkthrough-cleanup — auth", () => {
  it("returns 503 when CRON_SECRET ENV is missing", async () => {
    delete process.env.CRON_SECRET;
    const req = new Request("http://localhost/api/cron/walkthrough-cleanup", {
      method: "POST",
      headers: { "x-cron-secret": "anything" },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("returns 403 when x-cron-secret header is missing or wrong", async () => {
    process.env.CRON_SECRET = "test-secret";
    const req = new Request("http://localhost/api/cron/walkthrough-cleanup", {
      method: "POST",
      headers: { "x-cron-secret": "wrong" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
