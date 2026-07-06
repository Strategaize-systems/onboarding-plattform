// V10.2.1 SLC-185 MT-2 — Hermetische Tests fuer reconcileEmbeddings (Reconcile-Orchestrator).
//
// Kein echter DB-/AWS-Call: alle Seiteneffekte (Tenant-Enumeration, Coverage,
// Re-Embed) via ReconcileDeps injiziert; @/lib/logger gestubbt. Verifiziert
// (Spec SLC-185 MT-2, Cases a–f):
//   a. Gap → reembed mit korrekter tenantId, chunksReembedded aus ReembedResult.embedded
//   b. No-Gap → 0 reembed-Calls, Safe-No-Op-Summary
//   c. getCoverage-Throw bei Mandant 1 → Mandant 2 wird trotzdem verarbeitet, failures=1
//   d. reembed liefert { ok:false } → zaehlt als failure
//   e. 26 Gap-Mandanten → 25 reembed-Calls + capped:true, Rest weiterhin GEPRUEFT
//   f. captureInfo mit korrekter category + Counts

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { captureException, captureInfo } from "@/lib/logger";
import {
  reconcileEmbeddings,
  MAX_TENANTS_PER_RUN,
  type ReconcileDeps,
} from "../reconcile-embeddings";

vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
}));

const admin = {} as SupabaseClient;

function makeDeps(over: Partial<ReconcileDeps> = {}): ReconcileDeps {
  return {
    listTenants: vi.fn().mockResolvedValue(["t1", "t2"]),
    getCoverage: vi.fn().mockResolvedValue({ kuCount: 3, chunkCount: 3 }),
    reembed: vi.fn().mockResolvedValue({ ok: true, embedded: 0 }),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconcileEmbeddings", () => {
  it("a) Gap-Mandant → reembed mit korrekter tenantId, chunksReembedded aggregiert", async () => {
    const deps = makeDeps({
      getCoverage: vi
        .fn()
        .mockResolvedValueOnce({ kuCount: 5, chunkCount: 3 }) // t1: Gap
        .mockResolvedValueOnce({ kuCount: 3, chunkCount: 3 }), // t2: full
      reembed: vi.fn().mockResolvedValue({ ok: true, embedded: 5 }),
    });

    const summary = await reconcileEmbeddings(admin, deps);

    expect(deps.reembed).toHaveBeenCalledTimes(1);
    expect(deps.reembed).toHaveBeenCalledWith(admin, "t1");
    expect(summary).toEqual({
      tenantsChecked: 2,
      tenantsWithGap: 1,
      chunksReembedded: 5,
      failures: 0,
      capped: false,
    });
  });

  it("b) No-Gap → 0 reembed-Calls, Safe-No-Op-Summary", async () => {
    const deps = makeDeps();

    const summary = await reconcileEmbeddings(admin, deps);

    expect(deps.reembed).not.toHaveBeenCalled();
    expect(summary).toEqual({
      tenantsChecked: 2,
      tenantsWithGap: 0,
      chunksReembedded: 0,
      failures: 0,
      capped: false,
    });
    // Summary wird auch im No-Op-Fall geloggt (Beobachtbarkeit).
    expect(captureInfo).toHaveBeenCalledTimes(1);
  });

  it("c) getCoverage-Throw bei Mandant 1 → Mandant 2 trotzdem verarbeitet, failures=1", async () => {
    const deps = makeDeps({
      getCoverage: vi
        .fn()
        .mockRejectedValueOnce(new Error("db down"))
        .mockResolvedValueOnce({ kuCount: 4, chunkCount: 1 }), // t2: Gap
      reembed: vi.fn().mockResolvedValue({ ok: true, embedded: 3 }),
    });

    const summary = await reconcileEmbeddings(admin, deps);

    expect(deps.reembed).toHaveBeenCalledTimes(1);
    expect(deps.reembed).toHaveBeenCalledWith(admin, "t2");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({
      tenantsChecked: 2,
      tenantsWithGap: 1,
      chunksReembedded: 3,
      failures: 1,
      capped: false,
    });
  });

  it("d) reembed liefert { ok:false } → zaehlt als failure", async () => {
    const deps = makeDeps({
      listTenants: vi.fn().mockResolvedValue(["t1"]),
      getCoverage: vi.fn().mockResolvedValue({ kuCount: 5, chunkCount: 0 }),
      reembed: vi.fn().mockResolvedValue({ ok: false, embedded: 0 }),
    });

    const summary = await reconcileEmbeddings(admin, deps);

    expect(summary).toEqual({
      tenantsChecked: 1,
      tenantsWithGap: 1,
      chunksReembedded: 0,
      failures: 1,
      capped: false,
    });
  });

  it("e) 26 Gap-Mandanten → 25 reembed-Calls + capped:true, Rest weiterhin coverage-geprueft", async () => {
    const tenants = Array.from({ length: 26 }, (_, i) => `t${i + 1}`);
    const deps = makeDeps({
      listTenants: vi.fn().mockResolvedValue(tenants),
      getCoverage: vi.fn().mockResolvedValue({ kuCount: 2, chunkCount: 1 }),
      reembed: vi.fn().mockResolvedValue({ ok: true, embedded: 2 }),
    });

    const summary = await reconcileEmbeddings(admin, deps);

    expect(MAX_TENANTS_PER_RUN).toBe(25);
    expect(deps.reembed).toHaveBeenCalledTimes(25);
    // Mandant 26 wird NICHT re-embedded (Cap), aber weiterhin geprueft:
    expect(deps.getCoverage).toHaveBeenCalledTimes(26);
    expect(summary).toEqual({
      tenantsChecked: 26,
      tenantsWithGap: 26,
      chunksReembedded: 50,
      failures: 0,
      capped: true,
    });
  });

  it("f) captureInfo mit korrekter category + Counts", async () => {
    const deps = makeDeps({
      listTenants: vi.fn().mockResolvedValue(["t1"]),
      getCoverage: vi.fn().mockResolvedValue({ kuCount: 5, chunkCount: 3 }),
      reembed: vi.fn().mockResolvedValue({ ok: true, embedded: 5 }),
    });

    await reconcileEmbeddings(admin, deps);

    expect(captureInfo).toHaveBeenCalledTimes(1);
    expect(captureInfo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        source: "cron:knowledge-embed-reconcile",
        metadata: expect.objectContaining({
          category: "knowledge_embed_reconcile",
          tenantsChecked: 1,
          tenantsWithGap: 1,
          chunksReembedded: 5,
          failures: 0,
          capped: false,
        }),
      }),
    );
  });
});
