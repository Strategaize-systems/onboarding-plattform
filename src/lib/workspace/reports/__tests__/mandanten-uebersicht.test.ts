// SLC-183 MT-1 — Tests fuer loadMandantenUebersicht.
// Hermetisch: loadCrossTenantCockpit gemockt, admin.from(...) ueber chainable Fake.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrossTenantRow } from "@/app/admin/tenants/CrossTenantCockpit";

const mocks = vi.hoisted(() => ({
  loadCrossTenantMock: vi.fn(),
}));

vi.mock("@/lib/cockpit/load-cross-tenant", () => ({
  loadCrossTenantCockpit: mocks.loadCrossTenantMock,
}));

import { loadMandantenUebersicht } from "../mandanten-uebersicht";

/** Chainable Query-Builder-Fake, der am Ende `{ data }` per await aufloest. */
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

const BASE_ROW = (over: Partial<CrossTenantRow>): CrossTenantRow => ({
  tenant_id: "t1",
  tenant_name: "Tenant 1",
  employees_count: 0,
  bridge_status: "none",
  bridge_proposal_count: 0,
  handbook_status: "none",
  handbook_created_at: null,
  blocks_submitted: 0,
  blocks_total: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadMandantenUebersicht", () => {
  it("rollt schlimmste Ampel (worst wins) + juengste Aktivitaet je Tenant", async () => {
    mocks.loadCrossTenantMock.mockResolvedValue([
      BASE_ROW({ tenant_id: "t1", tenant_name: "Tenant 1" }),
      BASE_ROW({ tenant_id: "t2", tenant_name: "Tenant 2" }),
    ]);

    const admin = fakeAdmin({
      capture_session: [
        { tenant_id: "t1", metadata: { modul_delivery_ampel: { m04: "green" } } },
        { tenant_id: "t1", metadata: { modul_delivery_ampel: { m05: "red", m06: "yellow" } } },
        { tenant_id: "t2", metadata: { modul_delivery_ampel: { m04: "yellow" } } },
      ],
      block_checkpoint: [
        { tenant_id: "t1", created_at: "2026-07-04T10:00:00Z" },
        { tenant_id: "t1", created_at: "2026-07-01T10:00:00Z" },
        { tenant_id: "t2", created_at: "2026-06-20T10:00:00Z" },
      ],
    });

    const report = await loadMandantenUebersicht(admin);

    expect(report.key).toBe("mandanten_uebersicht");
    const t1 = report.rows.find((r) => r.tenant_id === "t1")!;
    const t2 = report.rows.find((r) => r.tenant_id === "t2")!;

    // t1: red gewinnt gegen green+yellow.
    expect(t1.modul_reife_ampel).toBe("red");
    // t2: nur yellow.
    expect(t2.modul_reife_ampel).toBe("yellow");
    // last_activity = juengster checkpoint (DESC -> erster).
    expect(t1.last_activity_at).toBe("2026-07-04T10:00:00Z");
    expect(t2.last_activity_at).toBe("2026-06-20T10:00:00Z");
    // Base-Felder durchgereicht.
    expect(t1.tenant_name).toBe("Tenant 1");
  });

  it("liefert null-Ampel + null-Aktivitaet bei fehlender/malformter metadata", async () => {
    mocks.loadCrossTenantMock.mockResolvedValue([
      BASE_ROW({ tenant_id: "t1", tenant_name: "Tenant 1" }),
    ]);

    const admin = fakeAdmin({
      capture_session: [
        { tenant_id: "t1", metadata: null },
        { tenant_id: "t1", metadata: { modul_delivery_ampel: "kaputt" } },
        { tenant_id: "t1", metadata: { other: 42 } },
      ],
      block_checkpoint: [],
    });

    const report = await loadMandantenUebersicht(admin);
    const t1 = report.rows[0];
    expect(t1.modul_reife_ampel).toBeNull();
    expect(t1.last_activity_at).toBeNull();
  });
});
