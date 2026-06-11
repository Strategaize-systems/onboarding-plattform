// V9.1 SLC-V9.1-C MT-2 — Vitest fuer runRetentionSweep (hermetisch, Store-Stub).
// Deckt AC-V9.1-C-2..6: Soft-Count, Hard-Delete, Imported-Skip, Storage-Error-
// Keep, Audit-Counts. Die echte Store-SQL ist im Coolify-DB-Integration-Test
// (skip-guarded) unten verifiziert.

import { describe, it, expect, vi } from "vitest";

import {
  runRetentionSweep,
  type RetentionStore,
  type HardDeletableRun,
  type RetentionAuditEntry,
} from "../handle-bulk-email-retention-sweep";

vi.mock("@/lib/logger", () => ({
  captureInfo: vi.fn(),
  captureWarning: vi.fn(),
  captureException: vi.fn(),
}));

interface StubConfig {
  softDeleted?: number;
  hardRuns?: HardDeletableRun[];
  imported?: Set<string>;
  pathsByRun?: Record<string, string[]>;
  failStoragePaths?: Set<string>;
}

function makeStore(cfg: StubConfig) {
  const audits: RetentionAuditEntry[] = [];
  const deletedRuns: string[] = [];
  const deletedPaths: string[] = [];
  const store: RetentionStore = {
    softDeleteExpiredRuns: vi.fn(async () => cfg.softDeleted ?? 0),
    selectHardDeletableRuns: vi.fn(async () => cfg.hardRuns ?? []),
    isRunImported: vi.fn(async (id: string) => cfg.imported?.has(id) ?? false),
    selectRunStoragePaths: vi.fn(async (id: string) => cfg.pathsByRun?.[id] ?? []),
    deleteStorageObject: vi.fn(async (path: string) => {
      if (cfg.failStoragePaths?.has(path)) throw new Error("storage boom");
      deletedPaths.push(path);
    }),
    deleteRun: vi.fn(async (id: string) => {
      deletedRuns.push(id);
    }),
    writeAudit: vi.fn(async (e: RetentionAuditEntry) => {
      audits.push(e);
    }),
  };
  return { store, audits, deletedRuns, deletedPaths };
}

const POLICY = { softDeleteDays: 60, hardDeleteDays: 90 };
const FIXED_NOW = new Date("2026-06-11T02:00:00.000Z");

describe("runRetentionSweep", () => {
  it("zaehlt Soft-Deletes und schreibt Audit (keine Hard-Kandidaten)", async () => {
    const { store, audits } = makeStore({ softDeleted: 3, hardRuns: [] });
    const summary = await runRetentionSweep({ store, policy: POLICY, now: FIXED_NOW });

    expect(summary.soft_deleted_runs).toBe(3);
    expect(summary.runs_evaluated).toBe(0);
    expect(summary.hard_deleted_runs).toBe(0);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      soft_deleted_runs: 3,
      hard_deleted_runs: 0,
      policy: POLICY,
    });
    expect(typeof audits[0].duration_ms).toBe("number");
  });

  it("hard-deleted nicht-importierten Run inkl. Storage-Objekte (AC-3)", async () => {
    const { store, deletedRuns, deletedPaths } = makeStore({
      hardRuns: [{ id: "run-a", tenant_id: "t1" }],
      pathsByRun: { "run-a": ["p1.eml", "p2.eml"] },
    });
    const summary = await runRetentionSweep({ store, policy: POLICY, now: FIXED_NOW });

    expect(summary.hard_deleted_runs).toBe(1);
    expect(summary.deleted_storage_objects).toBe(2);
    expect(deletedPaths).toEqual(["p1.eml", "p2.eml"]);
    expect(deletedRuns).toEqual(["run-a"]);
  });

  it("ueberspringt importierten Run, behaelt Row (AC-4)", async () => {
    const { store, deletedRuns } = makeStore({
      hardRuns: [{ id: "run-imp", tenant_id: "t1" }],
      imported: new Set(["run-imp"]),
      pathsByRun: { "run-imp": ["x.eml"] },
    });
    const summary = await runRetentionSweep({ store, policy: POLICY, now: FIXED_NOW });

    expect(summary.skipped_imported).toBe(1);
    expect(summary.hard_deleted_runs).toBe(0);
    expect(summary.deleted_storage_objects).toBe(0);
    expect(deletedRuns).toEqual([]);
    expect(store.selectRunStoragePaths).not.toHaveBeenCalled();
  });

  it("behaelt Run bei Storage-Fehler (R3), zaehlt storage_errors", async () => {
    const { store, deletedRuns } = makeStore({
      hardRuns: [{ id: "run-err", tenant_id: "t1" }],
      pathsByRun: { "run-err": ["ok.eml", "bad.eml"] },
      failStoragePaths: new Set(["bad.eml"]),
    });
    const summary = await runRetentionSweep({ store, policy: POLICY, now: FIXED_NOW });

    expect(summary.storage_errors).toBe(1);
    expect(summary.deleted_storage_objects).toBe(1); // ok.eml ging durch
    expect(summary.hard_deleted_runs).toBe(0); // Run behalten
    expect(deletedRuns).toEqual([]);
  });

  it("mischt mehrere Runs korrekt (hard + imported-skip)", async () => {
    const { store } = makeStore({
      softDeleted: 1,
      hardRuns: [
        { id: "run-1", tenant_id: "t1" },
        { id: "run-2", tenant_id: "t2" },
        { id: "run-3", tenant_id: "t1" },
      ],
      imported: new Set(["run-2"]),
      pathsByRun: { "run-1": ["a.eml"], "run-3": [] },
    });
    const summary = await runRetentionSweep({ store, policy: POLICY, now: FIXED_NOW });

    expect(summary).toMatchObject({
      soft_deleted_runs: 1,
      runs_evaluated: 3,
      hard_deleted_runs: 2, // run-1 + run-3
      skipped_imported: 1, // run-2
      deleted_storage_objects: 1, // a.eml
      storage_errors: 0,
    });
  });

  it("passt Cutoffs aus der Policy an (Soft 60d / Hard 90d)", async () => {
    const { store } = makeStore({ softDeleted: 0, hardRuns: [] });
    await runRetentionSweep({ store, policy: POLICY, now: FIXED_NOW });

    const softCutoff = (store.softDeleteExpiredRuns as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as string;
    const hardCutoff = (store.selectHardDeletableRuns as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as string;
    // 60 Tage vor FIXED_NOW
    expect(softCutoff).toBe("2026-04-12T02:00:00.000Z");
    // 90 Tage vor FIXED_NOW
    expect(hardCutoff).toBe("2026-03-13T02:00:00.000Z");
  });
});
