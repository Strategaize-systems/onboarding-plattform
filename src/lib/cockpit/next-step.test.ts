import { describe, it, expect } from "vitest";
import { computeRecommendedNextStep } from "./next-step";
import type { CockpitMetrics } from "./types";

const baseMetrics: CockpitMetrics = {
  captureSessionId: "11111111-1111-1111-1111-111111111111",
  blocksTotal: 8,
  blocksSubmitted: 0,
  employeesInvited: 0,
  employeeTasksOpen: 0,
  employeeTasksDone: 0,
  lastBridgeRun: null,
  lastHandbookSnapshot: null,
};

describe("computeRecommendedNextStep", () => {
  it("returns 'Erhebung starten' when no GF-session exists", () => {
    const result = computeRecommendedNextStep({ ...baseMetrics, captureSessionId: null });
    expect(result.href).toBe("/capture/new");
    expect(result.label).toMatch(/Erhebung starten/i);
  });

  it("returns 'Block fortsetzen' when no blocks submitted", () => {
    const result = computeRecommendedNextStep(baseMetrics);
    expect(result.href).toMatch(/^\/capture\//);
    expect(result.label).toMatch(/Block/i);
  });

  it("returns 'Bridge ausfuehren' when all blocks submitted but no bridge run", () => {
    const result = computeRecommendedNextStep({
      ...baseMetrics,
      blocksSubmitted: 8,
    });
    expect(result.href).toBe("/admin/bridge");
    expect(result.label).toMatch(/Bridge/i);
  });

  it("returns 'Mitarbeiter einladen' when bridge done but no employees", () => {
    const result = computeRecommendedNextStep({
      ...baseMetrics,
      blocksSubmitted: 8,
      lastBridgeRun: {
        id: "r1",
        status: "completed",
        proposal_count: 3,
        created_at: "2026-04-27T10:00:00Z",
      },
    });
    expect(result.href).toBe("/admin/team");
    expect(result.label).toMatch(/Mitarbeiter/i);
  });

  it("returns 'Mitarbeiter erinnern' when employee tasks are open", () => {
    const result = computeRecommendedNextStep({
      ...baseMetrics,
      blocksSubmitted: 8,
      employeesInvited: 3,
      employeeTasksOpen: 2,
      employeeTasksDone: 1,
      lastBridgeRun: {
        id: "r1",
        status: "completed",
        proposal_count: 3,
        created_at: "2026-04-27T10:00:00Z",
      },
    });
    expect(result.href).toBe("/admin/team");
    expect(result.label).toMatch(/erinnern/i);
  });

  it("returns 'Handbuch generieren' when everything done and no handbook", () => {
    const result = computeRecommendedNextStep({
      ...baseMetrics,
      blocksSubmitted: 8,
      employeesInvited: 3,
      employeeTasksOpen: 0,
      employeeTasksDone: 3,
      lastBridgeRun: {
        id: "r1",
        status: "completed",
        proposal_count: 3,
        created_at: "2026-04-27T10:00:00Z",
      },
    });
    expect(result.href).toBe("/admin/handbook");
    expect(result.label).toMatch(/Handbuch/i);
  });

  it("returns 'Onboarding abgeschlossen' when handbook is ready", () => {
    const result = computeRecommendedNextStep({
      ...baseMetrics,
      blocksSubmitted: 8,
      employeesInvited: 3,
      employeeTasksOpen: 0,
      employeeTasksDone: 3,
      lastBridgeRun: {
        id: "r1",
        status: "completed",
        proposal_count: 3,
        created_at: "2026-04-27T10:00:00Z",
      },
      lastHandbookSnapshot: {
        id: "h1",
        status: "ready",
        created_at: "2026-04-27T11:00:00Z",
      },
    });
    expect(result.href).toBe("/admin/handbook");
    expect(result.label).toMatch(/abgeschlossen/i);
  });

  it("treats stale bridge run as 'Bridge erneut ausfuehren'", () => {
    const result = computeRecommendedNextStep({
      ...baseMetrics,
      blocksSubmitted: 8,
      lastBridgeRun: {
        id: "r1",
        status: "stale",
        proposal_count: 3,
        created_at: "2026-04-27T10:00:00Z",
      },
    });
    expect(result.href).toBe("/admin/bridge");
    expect(result.reason).toMatch(/veraltet|stale|aktualisieren/i);
  });

  it("treats failed bridge run as 'Bridge erneut ausfuehren'", () => {
    const result = computeRecommendedNextStep({
      ...baseMetrics,
      blocksSubmitted: 8,
      lastBridgeRun: {
        id: "r1",
        status: "failed",
        proposal_count: 0,
        created_at: "2026-04-27T10:00:00Z",
      },
    });
    expect(result.href).toBe("/admin/bridge");
  });

  it("treats failed handbook snapshot as 'Handbuch erneut generieren'", () => {
    const result = computeRecommendedNextStep({
      ...baseMetrics,
      blocksSubmitted: 8,
      employeesInvited: 3,
      employeeTasksOpen: 0,
      employeeTasksDone: 3,
      lastBridgeRun: {
        id: "r1",
        status: "completed",
        proposal_count: 3,
        created_at: "2026-04-27T10:00:00Z",
      },
      lastHandbookSnapshot: {
        id: "h1",
        status: "failed",
        created_at: "2026-04-27T11:00:00Z",
      },
    });
    expect(result.href).toBe("/admin/handbook");
    expect(result.label).toMatch(/Handbuch/i);
  });

  it("ignores generating handbook snapshot and waits", () => {
    const result = computeRecommendedNextStep({
      ...baseMetrics,
      blocksSubmitted: 8,
      employeesInvited: 3,
      employeeTasksOpen: 0,
      employeeTasksDone: 3,
      lastBridgeRun: {
        id: "r1",
        status: "completed",
        proposal_count: 3,
        created_at: "2026-04-27T10:00:00Z",
      },
      lastHandbookSnapshot: {
        id: "h1",
        status: "generating",
        created_at: "2026-04-27T11:00:00Z",
      },
    });
    expect(result.href).toBe("/admin/handbook");
    expect(result.label).toMatch(/wird erzeugt|warten/i);
  });
});
