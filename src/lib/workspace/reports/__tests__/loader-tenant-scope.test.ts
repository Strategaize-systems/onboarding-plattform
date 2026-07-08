// V10.4 SLC-190 MT-4 — Beweist, dass jeder Berater-Loader den allowedTenantIds-Filter
// auf JEDE tenant-tragende Query legt (R-190-1) und ohne Filter (Admin) 0-Regression bleibt.
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadReviewQueue } from "../review-queue";
import { loadWoStocktEs } from "../wo-stockt-es";
import { loadActivityTimeline } from "../activity-timeline";
import { loadMandantenUebersicht } from "../mandanten-uebersicht";
import { loadCrossTenantCockpit } from "@/lib/cockpit/load-cross-tenant";

interface InCall {
  table: string;
  column: string;
  values: readonly string[];
}

/** Admin-Fake, der pro Tabelle einen Recording-Builder liefert und alle `.in`-Aufrufe sammelt. */
function recordingAdmin(byTable: Record<string, unknown[]> = {}) {
  const inCalls: InCall[] = [];
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.gte = chain;
      builder.order = chain;
      builder.limit = chain;
      builder.in = (column: string, values: readonly string[]) => {
        inCalls.push({ table, column, values });
        return builder;
      };
      builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: byTable[table] ?? [], error: null });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, inCalls };
}

/** Sucht einen `.in`-Aufruf fuer (table, column). */
function findIn(inCalls: InCall[], table: string, column: string) {
  return inCalls.find((c) => c.table === table && c.column === column);
}

const IDS = ["t1", "t2"];

describe("Loader-Tenant-Scoping (Berater)", () => {
  it("loadCrossTenantCockpit: filtert tenants.id + Sub-Queries.tenant_id; ohne Filter keine .in", async () => {
    const withFilter = recordingAdmin();
    await loadCrossTenantCockpit(withFilter.client, IDS);
    expect(findIn(withFilter.inCalls, "tenants", "id")).toEqual({
      table: "tenants",
      column: "id",
      values: IDS,
    });
    expect(findIn(withFilter.inCalls, "profiles", "tenant_id")).toBeTruthy();
    expect(findIn(withFilter.inCalls, "bridge_run", "tenant_id")).toBeTruthy();
    expect(findIn(withFilter.inCalls, "block_checkpoint", "tenant_id")).toBeTruthy();
    // template hat keine tenant-Spalte -> NICHT gefiltert.
    expect(findIn(withFilter.inCalls, "template", "tenant_id")).toBeUndefined();

    const noFilter = recordingAdmin();
    await loadCrossTenantCockpit(noFilter.client);
    expect(noFilter.inCalls).toHaveLength(0);
  });

  it("loadReviewQueue: filtert knowledge_unit/walkthrough_session/tenants; ohne Filter keine .in", async () => {
    const withFilter = recordingAdmin();
    await loadReviewQueue(withFilter.client, IDS);
    expect(findIn(withFilter.inCalls, "knowledge_unit", "tenant_id")?.values).toEqual(IDS);
    expect(findIn(withFilter.inCalls, "walkthrough_session", "tenant_id")).toBeTruthy();
    expect(findIn(withFilter.inCalls, "tenants", "id")).toBeTruthy();

    const noFilter = recordingAdmin();
    await loadReviewQueue(noFilter.client);
    expect(noFilter.inCalls).toHaveLength(0);
  });

  it("loadWoStocktEs: filtert tenants/block_checkpoint/capture_session/ai_jobs; ohne Filter keine .in", async () => {
    const withFilter = recordingAdmin();
    await loadWoStocktEs(withFilter.client, IDS);
    expect(findIn(withFilter.inCalls, "tenants", "id")).toBeTruthy();
    expect(findIn(withFilter.inCalls, "block_checkpoint", "tenant_id")).toBeTruthy();
    expect(findIn(withFilter.inCalls, "capture_session", "tenant_id")).toBeTruthy();
    expect(findIn(withFilter.inCalls, "ai_jobs", "tenant_id")).toBeTruthy();

    const noFilter = recordingAdmin();
    await loadWoStocktEs(noFilter.client);
    expect(noFilter.inCalls).toHaveLength(0);
  });

  it("loadActivityTimeline: filtert alle 5 Event-Quellen + tenants; ohne Filter keine .in", async () => {
    const withFilter = recordingAdmin();
    await loadActivityTimeline(withFilter.client, undefined, IDS);
    for (const table of [
      "capture_events",
      "diagnose_event",
      "modul_output",
      "block_checkpoint",
      "validation_layer",
    ]) {
      expect(findIn(withFilter.inCalls, table, "tenant_id")).toBeTruthy();
    }
    expect(findIn(withFilter.inCalls, "tenants", "id")).toBeTruthy();

    const noFilter = recordingAdmin();
    await loadActivityTimeline(noFilter.client);
    expect(noFilter.inCalls).toHaveLength(0);
  });

  it("loadMandantenUebersicht: filtert capture_session/block_checkpoint (eigene Queries) + Cascade cross-tenant", async () => {
    const withFilter = recordingAdmin();
    await loadMandantenUebersicht(withFilter.client, IDS);
    // eigene Enrichment-Queries
    expect(findIn(withFilter.inCalls, "capture_session", "tenant_id")).toBeTruthy();
    expect(findIn(withFilter.inCalls, "block_checkpoint", "tenant_id")).toBeTruthy();
    // via loadCrossTenantCockpit (real, nicht gemockt) auch tenants.id
    expect(findIn(withFilter.inCalls, "tenants", "id")).toBeTruthy();

    const noFilter = recordingAdmin();
    await loadMandantenUebersicht(noFilter.client);
    expect(noFilter.inCalls).toHaveLength(0);
  });
});
