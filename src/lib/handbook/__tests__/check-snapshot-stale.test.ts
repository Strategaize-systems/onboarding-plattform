// SLC-092 MT-2 — Tests fuer checkSnapshotStale (V5.1 Walkthrough-Trigger).
// Mock-basiert, kein DB-Zugriff. Verifiziert die zwei Trigger-Quellen:
//   - block_checkpoint der GF-Capture-Session
//   - approved walkthrough_session des Tenants

import { describe, it, expect, vi } from "vitest";
import { checkSnapshotStale } from "../check-snapshot-stale";
import type { SupabaseClient } from "@supabase/supabase-js";

interface CountResult {
  count: number | null;
}

interface MockOpts {
  blockCheckpointCount?: number | null;
  walkthroughCount?: number | null;
}

function makeMockClient(opts: MockOpts): SupabaseClient {
  const buildThenable = (result: CountResult) => {
    const obj: Record<string, unknown> = {};
    obj.eq = vi.fn(() => obj);
    obj.gt = vi.fn(() => obj);
    obj.then = (resolve: (v: CountResult) => unknown) => resolve(result);
    return obj;
  };

  const fromFn = vi.fn((table: string) => {
    const result: CountResult =
      table === "block_checkpoint"
        ? { count: opts.blockCheckpointCount ?? 0 }
        : { count: opts.walkthroughCount ?? 0 };
    return {
      select: vi.fn(() => buildThenable(result)),
    };
  });
  return { from: fromFn } as unknown as SupabaseClient;
}

const SNAPSHOT = {
  capture_session_id: "11111111-1111-1111-1111-111111111111",
  tenant_id: "22222222-2222-2222-2222-222222222222",
  created_at: "2026-05-09T10:00:00Z",
};

describe("checkSnapshotStale", () => {
  it("liefert false wenn weder Block-Checkpoints noch approved Walkthroughs neuer als Snapshot", async () => {
    const client = makeMockClient({
      blockCheckpointCount: 0,
      walkthroughCount: 0,
    });
    const result = await checkSnapshotStale(client, SNAPSHOT);
    expect(result).toBe(false);
  });

  it("liefert true wenn ein neuerer Block-Checkpoint existiert (V4.1-Trigger)", async () => {
    const client = makeMockClient({
      blockCheckpointCount: 1,
      walkthroughCount: 0,
    });
    const result = await checkSnapshotStale(client, SNAPSHOT);
    expect(result).toBe(true);
  });

  it("liefert true wenn ein approved Walkthrough nach Snapshot existiert (V5.1-Trigger)", async () => {
    const client = makeMockClient({
      blockCheckpointCount: 0,
      walkthroughCount: 1,
    });
    const result = await checkSnapshotStale(client, SNAPSHOT);
    expect(result).toBe(true);
  });

  it("liefert true wenn beide Trigger ausloesen", async () => {
    const client = makeMockClient({
      blockCheckpointCount: 3,
      walkthroughCount: 2,
    });
    const result = await checkSnapshotStale(client, SNAPSHOT);
    expect(result).toBe(true);
  });

  it("behandelt null-count defensiv als 0", async () => {
    const client = makeMockClient({
      blockCheckpointCount: null,
      walkthroughCount: null,
    });
    const result = await checkSnapshotStale(client, SNAPSHOT);
    expect(result).toBe(false);
  });
});
