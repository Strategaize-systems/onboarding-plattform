// SLC-183 MT-1 — Tests fuer loadActivityTimeline.
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadActivityTimeline } from "../activity-timeline";

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

describe("loadActivityTimeline", () => {
  it("merged alle Quellen, sortiert created_at DESC, mit Tenant-Namen", async () => {
    const admin = fakeAdmin({
      capture_events: [
        { tenant_id: "t1", block_key: "b1", event_type: "answer_submitted", created_at: "2026-07-04T10:00:00Z" },
      ],
      diagnose_event: [
        { tenant_id: "t2", event_type: "session_completed", created_at: "2026-07-04T11:00:00Z" },
      ],
      modul_output: [
        { tenant_id: "t1", modul_key: "m04", output_kind: "entscheidung", created_at: "2026-07-04T09:00:00Z" },
      ],
      block_checkpoint: [
        { tenant_id: "t2", block_key: "b2", checkpoint_type: "questionnaire_submit", created_at: "2026-07-04T12:00:00Z" },
      ],
      validation_layer: [
        { tenant_id: "t1", action: "accept", created_at: "2026-07-04T08:00:00Z" },
      ],
      tenants: [
        { id: "t1", name: "Tenant 1" },
        { id: "t2", name: "Tenant 2" },
      ],
    });

    const report = await loadActivityTimeline(admin);
    expect(report.key).toBe("activity_timeline");
    expect(report.entries).toHaveLength(5);

    // Sortierung: 12:00 (block_checkpoint) zuerst, 08:00 (validation) zuletzt.
    expect(report.entries[0].source).toBe("block_checkpoint");
    expect(report.entries[0].created_at).toBe("2026-07-04T12:00:00Z");
    expect(report.entries[report.entries.length - 1].source).toBe("validation_layer");

    // Tenant-Name-Join.
    expect(report.entries[0].tenant_name).toBe("Tenant 2");
    // Label-Formatierung.
    const modul = report.entries.find((e) => e.source === "modul_output")!;
    expect(modul.label).toBe("m04 · entscheidung");
  });

  it("ueberspringt Zeilen ohne tenant_id/created_at und respektiert sinceIso", async () => {
    const admin = fakeAdmin({
      capture_events: [
        { tenant_id: null, block_key: "b1", event_type: "x", created_at: "2026-07-04T10:00:00Z" },
        { tenant_id: "t1", block_key: "b1", event_type: "x", created_at: null },
        { tenant_id: "t1", block_key: "b1", event_type: "answer_submitted", created_at: "2026-07-04T10:00:00Z" },
      ],
      tenants: [{ id: "t1", name: "Tenant 1" }],
    });

    const report = await loadActivityTimeline(admin, "2026-07-01T00:00:00Z");
    expect(report.since).toBe("2026-07-01T00:00:00Z");
    // Nur die eine valide Zeile ueberlebt.
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0].tenant_id).toBe("t1");
  });
});
