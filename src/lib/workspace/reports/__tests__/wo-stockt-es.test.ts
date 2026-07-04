// SLC-183 MT-1 — Tests fuer loadWoStocktEs.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadWoStocktEs } from "../wo-stockt-es";

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

const NOW = new Date("2026-07-04T12:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("loadWoStocktEs", () => {
  it("flaggt Inaktivitaet, rote Ampel und failed Jobs; gesunde Tenants fallen raus", async () => {
    const admin = fakeAdmin({
      tenants: [
        { id: "t1", name: "Stale Inaktiv" },
        { id: "t2", name: "Rote Ampel" },
        { id: "t3", name: "Failed Jobs" },
        { id: "t4", name: "Gesund" },
      ],
      block_checkpoint: [
        // t1: letzte Aktivitaet 30 Tage her -> Inaktiv-Flag
        { tenant_id: "t1", created_at: "2026-06-04T12:00:00Z" },
        // t2/t4: frisch
        { tenant_id: "t2", created_at: "2026-07-04T09:00:00Z" },
        { tenant_id: "t4", created_at: "2026-07-04T09:00:00Z" },
        // t3: frisch (nur wegen Jobs geflaggt)
        { tenant_id: "t3", created_at: "2026-07-04T09:00:00Z" },
      ],
      capture_session: [
        { tenant_id: "t2", metadata: { modul_delivery_ampel: { m04: "red" } } },
        { tenant_id: "t4", metadata: { modul_delivery_ampel: { m04: "green" } } },
      ],
      ai_jobs: [{ tenant_id: "t3" }, { tenant_id: "t3" }],
    });

    const report = await loadWoStocktEs(admin);
    expect(report.key).toBe("wo_stockt_es");

    const ids = report.rows.map((r) => r.tenant_id).sort();
    expect(ids).toEqual(["t1", "t2", "t3"]);

    const t1 = report.rows.find((r) => r.tenant_id === "t1")!;
    expect(t1.reasons.some((r) => r.includes("14 Tagen"))).toBe(true);

    const t2 = report.rows.find((r) => r.tenant_id === "t2")!;
    expect(t2.has_red_ampel).toBe(true);
    expect(t2.reasons).toContain("Rote Modul-Reife-Ampel");

    const t3 = report.rows.find((r) => r.tenant_id === "t3")!;
    expect(t3.failed_jobs_count).toBe(2);

    // t4 (gesund) darf nicht auftauchen.
    expect(report.rows.some((r) => r.tenant_id === "t4")).toBe(false);
  });

  it("flaggt Tenant ohne jede Block-Aktivitaet", async () => {
    const admin = fakeAdmin({
      tenants: [{ id: "t1", name: "Nie aktiv" }],
      block_checkpoint: [],
      capture_session: [],
      ai_jobs: [],
    });
    const report = await loadWoStocktEs(admin);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].reasons).toContain("Keine Block-Aktivitaet erfasst");
    expect(report.rows[0].last_activity_at).toBeNull();
  });
});
