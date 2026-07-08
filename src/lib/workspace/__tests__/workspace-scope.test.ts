// V10.4 SLC-190 MT-4 — Tests fuer resolveWorkspaceScope + loadBeraterAssignedTenants.
// Auth-kritisch (SaaS-TDD): der Scope-Resolver entscheidet ueber cross-tenant-Zugriff.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserMock, fromMock, rpcMock, adminRpcMock, adminFromMock } = vi.hoisted(
  () => ({
    getUserMock: vi.fn(),
    fromMock: vi.fn(),
    rpcMock: vi.fn(),
    adminRpcMock: vi.fn(),
    adminFromMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: adminRpcMock,
    from: adminFromMock,
  })),
}));

import {
  resolveWorkspaceScope,
  loadBeraterAssignedTenants,
} from "../workspace-scope";

const USER = { id: "u-1", email: "x@y.de" };

function mockProfile(role: string | null) {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: role === null ? null : { role }, error: null }),
      }),
    }),
  });
}

beforeEach(() => {
  getUserMock.mockReset();
  fromMock.mockReset();
  rpcMock.mockReset();
  adminRpcMock.mockReset();
  adminFromMock.mockReset();
});

describe("resolveWorkspaceScope", () => {
  it("strategaize_admin => allowedTenantIds undefined (alle Tenants)", async () => {
    getUserMock.mockResolvedValue({ data: { user: USER } });
    mockProfile("strategaize_admin");
    const scope = await resolveWorkspaceScope();
    expect(scope).toEqual({
      role: "strategaize_admin",
      user: USER,
      allowedTenantIds: undefined,
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("strategaize_berater => allowedTenantIds aus RPC (zugewiesene ∪ Cascade)", async () => {
    getUserMock.mockResolvedValue({ data: { user: USER } });
    mockProfile("strategaize_berater");
    rpcMock.mockResolvedValue({ data: ["t1", "t2"], error: null });
    const scope = await resolveWorkspaceScope();
    expect(scope).toEqual({
      role: "strategaize_berater",
      user: USER,
      allowedTenantIds: ["t1", "t2"],
    });
    expect(rpcMock).toHaveBeenCalledWith("berater_assigned_tenant_ids", {
      p_uid: USER.id,
    });
  });

  it("strategaize_berater ohne RPC-Ergebnis => leeres Array (fail-closed)", async () => {
    getUserMock.mockResolvedValue({ data: { user: USER } });
    mockProfile("strategaize_berater");
    rpcMock.mockResolvedValue({ data: null, error: { message: "x" } });
    const scope = await resolveWorkspaceScope();
    expect(scope?.allowedTenantIds).toEqual([]);
  });

  it("tenant_admin => null (kein Mein-Tag-Zugriff)", async () => {
    getUserMock.mockResolvedValue({ data: { user: USER } });
    mockProfile("tenant_admin");
    expect(await resolveWorkspaceScope()).toBeNull();
  });

  it("nicht eingeloggt => null", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await resolveWorkspaceScope()).toBeNull();
  });
});

describe("loadBeraterAssignedTenants", () => {
  it("laedt id+name der zugewiesenen Tenants", async () => {
    adminRpcMock.mockResolvedValue({ data: ["t1", "t2"], error: null });
    const orderMock = vi.fn(async () => ({
      data: [
        { id: "t1", name: "Kanzlei A" },
        { id: "t2", name: "Mandant B" },
      ],
      error: null,
    }));
    adminFromMock.mockReturnValue({
      select: () => ({ in: () => ({ order: orderMock }) }),
    });
    const result = await loadBeraterAssignedTenants(USER.id);
    expect(result).toEqual([
      { id: "t1", name: "Kanzlei A" },
      { id: "t2", name: "Mandant B" },
    ]);
    expect(adminRpcMock).toHaveBeenCalledWith("berater_assigned_tenant_ids", {
      p_uid: USER.id,
    });
  });

  it("keine Zuweisung => leere Liste, kein tenants-Query", async () => {
    adminRpcMock.mockResolvedValue({ data: [], error: null });
    const result = await loadBeraterAssignedTenants(USER.id);
    expect(result).toEqual([]);
    expect(adminFromMock).not.toHaveBeenCalled();
  });
});
