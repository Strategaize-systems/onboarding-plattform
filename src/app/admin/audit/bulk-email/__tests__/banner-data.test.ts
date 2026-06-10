// V9.1 SLC-V9.1-B MT-4 — Vitest fuer die Banner-Data-Pure-Helper.

import { describe, it, expect } from "vitest";

import { selectFlaggedRuns, flaggedStatusLabel } from "../banner-data";

describe("selectFlaggedRuns", () => {
  const runs = [
    { id: "r1", tenant_name: "Acme", status: "completed" },
    { id: "r2", tenant_name: "Beta", status: "paused" },
    { id: "r3", tenant_name: null, status: "awaiting_approval" },
    { id: "r4", tenant_name: "Gamma", status: "pattern_extracting" },
  ];

  it("filtert nur paused + awaiting_approval, Reihenfolge bleibt", () => {
    const flagged = selectFlaggedRuns(runs);
    expect(flagged.map((r) => r.id)).toEqual(["r2", "r3"]);
    expect(flagged[0].status).toBe("paused");
    expect(flagged[1].status).toBe("awaiting_approval");
  });

  it("leere Liste wenn nichts flagged", () => {
    expect(
      selectFlaggedRuns([{ id: "x", tenant_name: "X", status: "completed" }]),
    ).toEqual([]);
    expect(selectFlaggedRuns([])).toEqual([]);
  });
});

describe("flaggedStatusLabel", () => {
  it("paused -> Cost-Review", () => {
    expect(flaggedStatusLabel("paused")).toEqual({
      label: "Pausiert (Kostenlimit)",
      action: "Cost-Review oeffnen",
    });
  });
  it("awaiting_approval -> Approval", () => {
    expect(flaggedStatusLabel("awaiting_approval")).toEqual({
      label: "Freigabe erforderlich",
      action: "Approval pruefen",
    });
  });
});
