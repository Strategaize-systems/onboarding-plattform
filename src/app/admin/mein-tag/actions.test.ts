// V10.4 SLC-190 MT-4 — Tests fuer loadWorkspaceReportAction + generateReportFazitAction.
// Kern: Berater-Report-Whitelist (kein system_status) + allowedTenantIds-Durchreichung;
// Admin-Pfad unveraendert (allowedTenantIds undefined). Auth-kritisch (SaaS-TDD).
import { describe, it, expect, vi, beforeEach } from "vitest";

const { scopeMock, loadReportMock, summarizeMock, adminClientMock } = vi.hoisted(
  () => ({
    scopeMock: vi.fn(),
    loadReportMock: vi.fn(),
    summarizeMock: vi.fn(),
    adminClientMock: { __brand: "admin" },
  }),
);

vi.mock("@/lib/workspace/workspace-scope", () => ({
  resolveWorkspaceScope: scopeMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminClientMock),
}));

// Nur loadReport stubben — BERATER_REPORT_KEYS real behalten (Single Source of Truth).
vi.mock("@/lib/workspace/reports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace/reports")>();
  return { ...actual, loadReport: loadReportMock };
});

vi.mock("@/lib/workspace/fazit", () => ({
  summarizeReport: summarizeMock,
}));

import {
  loadWorkspaceReportAction,
  generateReportFazitAction,
} from "./actions";

const ADMIN_SCOPE = {
  role: "strategaize_admin",
  user: { id: "admin-1" },
  allowedTenantIds: undefined,
};
const BERATER_SCOPE = {
  role: "strategaize_berater",
  user: { id: "berater-1" },
  allowedTenantIds: ["t1", "t2"],
};

beforeEach(() => {
  scopeMock.mockReset();
  loadReportMock.mockReset();
  summarizeMock.mockReset();
  loadReportMock.mockResolvedValue({ key: "review_queue", rows: [] });
  summarizeMock.mockResolvedValue({ fazit: "ok" });
});

describe("loadWorkspaceReportAction", () => {
  it("nicht autorisiert => unauthorized, loadReport nicht aufgerufen", async () => {
    scopeMock.mockResolvedValue(null);
    const res = await loadWorkspaceReportAction("mandanten_uebersicht");
    expect(res).toEqual({ ok: false, error: "unauthorized" });
    expect(loadReportMock).not.toHaveBeenCalled();
  });

  it("Admin: system_status erlaubt, loadReport mit allowedTenantIds=undefined", async () => {
    scopeMock.mockResolvedValue(ADMIN_SCOPE);
    const res = await loadWorkspaceReportAction("system_status");
    expect(res.ok).toBe(true);
    expect(loadReportMock).toHaveBeenCalledWith(
      adminClientMock,
      "system_status",
      undefined,
    );
  });

  it("Berater: system_status => invalid_key (nicht im Report-Set), loadReport NICHT aufgerufen", async () => {
    scopeMock.mockResolvedValue(BERATER_SCOPE);
    const res = await loadWorkspaceReportAction("system_status");
    expect(res).toEqual({ ok: false, error: "invalid_key" });
    expect(loadReportMock).not.toHaveBeenCalled();
  });

  it("Berater: erlaubter Report => loadReport mit allowedTenantIds", async () => {
    scopeMock.mockResolvedValue(BERATER_SCOPE);
    const res = await loadWorkspaceReportAction("mandanten_uebersicht");
    expect(res.ok).toBe(true);
    expect(loadReportMock).toHaveBeenCalledWith(
      adminClientMock,
      "mandanten_uebersicht",
      ["t1", "t2"],
    );
  });

  it("ungueltiger Key => invalid_key", async () => {
    scopeMock.mockResolvedValue(ADMIN_SCOPE);
    const res = await loadWorkspaceReportAction("bogus" as never);
    expect(res).toEqual({ ok: false, error: "invalid_key" });
  });
});

describe("generateReportFazitAction", () => {
  it("Berater: system_status => invalid_key (auch der Fazit-Pfad ist gescopt)", async () => {
    scopeMock.mockResolvedValue(BERATER_SCOPE);
    const res = await generateReportFazitAction("system_status");
    expect(res).toEqual({ ok: false, error: "invalid_key" });
    expect(loadReportMock).not.toHaveBeenCalled();
  });

  it("Berater: erlaubter Report => loadReport mit allowedTenantIds", async () => {
    scopeMock.mockResolvedValue(BERATER_SCOPE);
    const res = await generateReportFazitAction("review_queue");
    expect(res.ok).toBe(true);
    expect(loadReportMock).toHaveBeenCalledWith(
      adminClientMock,
      "review_queue",
      ["t1", "t2"],
    );
  });
});
