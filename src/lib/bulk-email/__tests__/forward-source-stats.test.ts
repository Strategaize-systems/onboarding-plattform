// V9.1 SLC-V9.1-D MT-5 — aggregateForwardStats pure-Logic tests (hermetisch).
// Die DB-Fetch-Schicht (getForwardSourceStats) wird im Live-Smoke (deferred) end-to-end
// verifiziert; die Aggregations-Semantik (AC-V9.1-D-7) ist hier hermetisch abgedeckt.

import { describe, it, expect } from "vitest";
import { aggregateForwardStats } from "../forward-source-stats";

const endpoints = [
  { id: "ep-a", tenant_id: "t-a", slug: "acme", status: "active" },
  { id: "ep-b", tenant_id: "t-b", slug: "globex", status: "pending_setup" },
];
const tenantNames = new Map([
  ["t-a", "Acme GmbH"],
  ["t-b", "Globex AG"],
]);

describe("aggregateForwardStats", () => {
  it("produces one row per endpoint with inbound counts, last-inbound, rejects and cost", () => {
    const rows = aggregateForwardStats({
      endpoints,
      tenantNames,
      inboundMessages: [
        { endpoint_id: "ep-a", received_at: "2026-06-10T09:00:00Z" },
        { endpoint_id: "ep-a", received_at: "2026-06-11T09:00:00Z" },
        { endpoint_id: "ep-b", received_at: "2026-06-09T09:00:00Z" },
      ],
      rejectRows: [
        { endpoint_id: "ep-a", reject_layer: "allowlist_mismatch" },
        { endpoint_id: "ep-a", reject_layer: "allowlist_mismatch" },
        { endpoint_id: "ep-a", reject_layer: "setup_token_invalid" },
        { endpoint_id: null, reject_layer: "tenant_not_found" }, // unmatched -> ignored
      ],
      monthlyCostByTenant: new Map([["t-a", 4.2]]),
      vendorLabel: "imap-ionos",
    });

    expect(rows).toHaveLength(2);
    // sorted by inbound desc -> ep-a first
    const a = rows[0];
    expect(a.endpoint_id).toBe("ep-a");
    expect(a.tenant_name).toBe("Acme GmbH");
    expect(a.vendor).toBe("imap-ionos");
    expect(a.inbound_count_30d).toBe(2);
    expect(a.last_inbound_at).toBe("2026-06-11T09:00:00Z");
    expect(a.reject_count_30d_total).toBe(3);
    expect(a.reject_count_30d_by_layer).toEqual({
      allowlist_mismatch: 2,
      setup_token_invalid: 1,
    });
    expect(a.monthly_cost_eur).toBe(4.2);

    const b = rows[1];
    expect(b.endpoint_id).toBe("ep-b");
    expect(b.endpoint_status).toBe("pending_setup");
    expect(b.inbound_count_30d).toBe(1);
    expect(b.reject_count_30d_total).toBe(0);
    expect(b.monthly_cost_eur).toBe(0); // no cost row for t-b
  });

  it("ignores unknown reject layers and endpoint-less reject rows", () => {
    const rows = aggregateForwardStats({
      endpoints: [endpoints[0]],
      tenantNames,
      inboundMessages: [],
      rejectRows: [
        { endpoint_id: "ep-a", reject_layer: "not_a_real_layer" },
        { endpoint_id: null, reject_layer: "hmac_invalid" },
      ],
      monthlyCostByTenant: new Map(),
      vendorLabel: "imap-ionos",
    });
    expect(rows[0].reject_count_30d_total).toBe(0);
    expect(rows[0].last_inbound_at).toBeNull();
  });
});
