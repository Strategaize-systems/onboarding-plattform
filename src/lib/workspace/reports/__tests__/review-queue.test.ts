// SLC-183 MT-1 — Tests fuer loadReviewQueue.
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadReviewQueue } from "../review-queue";

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

describe("loadReviewQueue", () => {
  it("aggregiert proposed-Units + Walkthrough-Reviews je Tenant, sortiert absteigend", async () => {
    const admin = fakeAdmin({
      knowledge_unit: [
        { tenant_id: "t1", title: "Finding A", created_at: "2026-07-04T10:00:00Z" },
        { tenant_id: "t1", title: "Finding B", created_at: "2026-07-03T10:00:00Z" },
        { tenant_id: "t2", title: "Finding C", created_at: "2026-07-02T10:00:00Z" },
      ],
      walkthrough_session: [{ tenant_id: "t2" }, { tenant_id: "t2" }],
      tenants: [
        { id: "t1", name: "Tenant 1" },
        { id: "t2", name: "Tenant 2" },
      ],
    });

    const report = await loadReviewQueue(admin);
    expect(report.key).toBe("review_queue");

    const t1 = report.rows.find((r) => r.tenant_id === "t1")!;
    const t2 = report.rows.find((r) => r.tenant_id === "t2")!;
    expect(t1.proposed_units_count).toBe(2);
    expect(t1.latest_unit_titles).toEqual(["Finding A", "Finding B"]);
    expect(t1.pending_walkthrough_reviews).toBe(0);
    expect(t2.proposed_units_count).toBe(1);
    expect(t2.pending_walkthrough_reviews).toBe(2);
    expect(t2.tenant_name).toBe("Tenant 2");

    // Sortierung: t2 (1+2=3) vor t1 (2+0=2).
    expect(report.rows[0].tenant_id).toBe("t2");
  });

  it("liefert keine Zeilen wenn keine offenen Items existieren", async () => {
    const admin = fakeAdmin({
      knowledge_unit: [],
      walkthrough_session: [],
      tenants: [{ id: "t1", name: "Tenant 1" }],
    });
    const report = await loadReviewQueue(admin);
    expect(report.rows).toEqual([]);
  });
});
