// V10.4 SLC-190 MT-4 — Tests fuer askRagAction/reembedTenantAction Berater-Scoping.
// Kern: bindTenant ist fuer den Berater fail-closed — ein fremder (nicht zugewiesener)
// tenantId liefert no_tenant, OHNE dass die RAG-Kette laeuft. Admin-Pfad unveraendert.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { scopeMock, askRagMock, reembedMock, maybeSingleMock, adminFromMock } =
  vi.hoisted(() => ({
    scopeMock: vi.fn(),
    askRagMock: vi.fn(),
    reembedMock: vi.fn(),
    maybeSingleMock: vi.fn(),
    adminFromMock: vi.fn(),
  }));

vi.mock("@/lib/workspace/workspace-scope", () => ({
  resolveWorkspaceScope: scopeMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: adminFromMock })),
}));

vi.mock("@/lib/workspace/rag", () => ({
  askRag: askRagMock,
  reembedTenantKnowledge: reembedMock,
}));

import { askRagAction, reembedTenantAction } from "./rag-action";

const ADMIN_SCOPE = { role: "strategaize_admin", user: { id: "a" }, allowedTenantIds: undefined };
const BERATER_SCOPE = { role: "strategaize_berater", user: { id: "b" }, allowedTenantIds: ["t1"] };

beforeEach(() => {
  scopeMock.mockReset();
  askRagMock.mockReset();
  reembedMock.mockReset();
  maybeSingleMock.mockReset();
  adminFromMock.mockReset();
  // tenants-Existenzpruefung: Tenant existiert grundsaetzlich.
  maybeSingleMock.mockResolvedValue({ data: { id: "exists" }, error: null });
  adminFromMock.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
  });
  askRagMock.mockResolvedValue({
    ok: true,
    result: { answer: "A", sources: [], coverage: { hasCoverage: true } },
  });
  reembedMock.mockResolvedValue({ ok: true, embedded: 3 });
});

describe("askRagAction — Berater-Scoping", () => {
  it("nicht autorisiert => unauthorized", async () => {
    scopeMock.mockResolvedValue(null);
    expect(await askRagAction("t1", "frage")).toEqual({ ok: false, error: "unauthorized" });
    expect(askRagMock).not.toHaveBeenCalled();
  });

  it("leere Frage => empty_question", async () => {
    scopeMock.mockResolvedValue(BERATER_SCOPE);
    expect(await askRagAction("t1", "   ")).toEqual({ ok: false, error: "empty_question" });
  });

  it("Berater + fremder Tenant => no_tenant, RAG NICHT ausgefuehrt (fail-closed)", async () => {
    scopeMock.mockResolvedValue(BERATER_SCOPE);
    const res = await askRagAction("t2", "frage");
    expect(res).toEqual({ ok: false, error: "no_tenant" });
    expect(maybeSingleMock).not.toHaveBeenCalled(); // Filter greift VOR dem DB-Lookup
    expect(askRagMock).not.toHaveBeenCalled();
  });

  it("Berater + zugewiesener Tenant => RAG laeuft, ok", async () => {
    scopeMock.mockResolvedValue(BERATER_SCOPE);
    const res = await askRagAction("t1", "frage");
    expect(res.ok).toBe(true);
    expect(askRagMock).toHaveBeenCalledWith(expect.anything(), "t1", "frage");
  });

  it("Admin + beliebiger existierender Tenant => ok (keine Zusatz-Einschraenkung)", async () => {
    scopeMock.mockResolvedValue(ADMIN_SCOPE);
    const res = await askRagAction("tX", "frage");
    expect(res.ok).toBe(true);
    expect(askRagMock).toHaveBeenCalledWith(expect.anything(), "tX", "frage");
  });
});

describe("reembedTenantAction — Berater-Scoping", () => {
  it("Berater + fremder Tenant => no_tenant, kein Re-Embed", async () => {
    scopeMock.mockResolvedValue(BERATER_SCOPE);
    expect(await reembedTenantAction("t2")).toEqual({ ok: false, error: "no_tenant" });
    expect(reembedMock).not.toHaveBeenCalled();
  });

  it("Berater + zugewiesener Tenant => Re-Embed laeuft", async () => {
    scopeMock.mockResolvedValue(BERATER_SCOPE);
    expect(await reembedTenantAction("t1")).toEqual({ ok: true, embedded: 3 });
  });
});
