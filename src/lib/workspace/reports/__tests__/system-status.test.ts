// SLC-183 MT-1 — Tests fuer loadSystemStatus.
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSystemStatus } from "../system-status";

function tableResult(data: unknown[]) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.in = chain;
  builder.gte = chain;
  builder.order = chain;
  builder.limit = chain;
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data, error: null });
  return builder;
}

function fakeAdmin(byTable: Record<string, unknown[]>): SupabaseClient {
  return {
    from: (table: string) => tableResult(byTable[table] ?? []),
  } as unknown as SupabaseClient;
}

describe("loadSystemStatus", () => {
  it("zaehlt running/failed Jobs + error_log-24h und liefert Beispiele", async () => {
    const admin = fakeAdmin({
      ai_jobs: [
        { job_type: "synth", status: "running", error: null, created_at: "2026-07-04T10:00:00Z" },
        { job_type: "synth", status: "failed", error: "boom", created_at: "2026-07-04T09:00:00Z" },
        { job_type: "embed", status: "failed", error: "nope", created_at: "2026-07-04T08:00:00Z" },
      ],
      error_log: [
        { source: "worker", level: "error", message: "x", created_at: "2026-07-04T10:00:00Z" },
        { source: "cron", level: "warn", message: "y", created_at: "2026-07-04T09:00:00Z" },
      ],
    });

    const report = await loadSystemStatus(admin);
    expect(report.key).toBe("system_status");
    expect(report.running_jobs_count).toBe(1);
    expect(report.failed_jobs_count).toBe(2);
    expect(report.latest_jobs).toHaveLength(3);
    expect(report.latest_jobs[0].job_type).toBe("synth");
    expect(report.errors_last_24h_count).toBe(2);
    expect(report.latest_errors[0].source).toBe("worker");
  });

  it("liefert Null-Counts bei leeren Daten", async () => {
    const admin = fakeAdmin({ ai_jobs: [], error_log: [] });
    const report = await loadSystemStatus(admin);
    expect(report.running_jobs_count).toBe(0);
    expect(report.failed_jobs_count).toBe(0);
    expect(report.errors_last_24h_count).toBe(0);
    expect(report.latest_jobs).toEqual([]);
    expect(report.latest_errors).toEqual([]);
  });
});
