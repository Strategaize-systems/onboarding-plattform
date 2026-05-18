import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks — set up BEFORE importing the SUT ─────────────────────────────

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

// Reusable handle on the auth.admin spy + table-router spy. Each test rebinds
// the admin-mock with a fresh `buildAdmin({...})`.
type AuthAdminStub = {
  createUser: ReturnType<typeof vi.fn>;
  deleteUser: ReturnType<typeof vi.fn>;
};

type TableStub = {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

interface AdminSetup {
  tenants?: {
    insert?: { data: { id: string } | null; error: unknown };
    delete?: { error: unknown };
  };
  authCreateUser?: { data: { user: { id: string } | null } | null; error: unknown };
  authDeleteUser?: { error: unknown };
  partnerClientMappingInsert?: { error: unknown };
  pendingSignupUpdate?: { data: Array<{ id: string }> | null; error: unknown };
}

interface AdminMock {
  from: ReturnType<typeof vi.fn>;
  auth: { admin: AuthAdminStub };
  __captures: {
    tenantInsertPayload: unknown[];
    tenantDeleteIds: string[];
    mappingInsertPayload: unknown[];
    pendingUpdatePayload: unknown[];
    pendingUpdateIdFilter: string[];
    pendingUpdateStatusFilter: string[];
    createUserPayload: unknown[];
    deleteUserIds: string[];
  };
}

function buildAdmin(setup: AdminSetup = {}): AdminMock {
  const captures: AdminMock["__captures"] = {
    tenantInsertPayload: [],
    tenantDeleteIds: [],
    mappingInsertPayload: [],
    pendingUpdatePayload: [],
    pendingUpdateIdFilter: [],
    pendingUpdateStatusFilter: [],
    createUserPayload: [],
    deleteUserIds: [],
  };

  function tenantsTable(): TableStub {
    return {
      insert: vi.fn((payload: unknown) => {
        captures.tenantInsertPayload.push(payload);
        return {
          select: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValue(
              setup.tenants?.insert ?? {
                data: { id: "tenant-new-id" },
                error: null,
              }
            ),
        };
      }),
      update: vi.fn(),
      delete: vi.fn(() => ({
        eq: vi.fn(async (_col: string, val: string) => {
          captures.tenantDeleteIds.push(val);
          return setup.tenants?.delete ?? { error: null };
        }),
      })),
    };
  }

  function mappingTable(): TableStub {
    return {
      insert: vi.fn(async (payload: unknown) => {
        captures.mappingInsertPayload.push(payload);
        return setup.partnerClientMappingInsert ?? { error: null };
      }),
      update: vi.fn(),
      delete: vi.fn(),
    };
  }

  function pendingSignupTable(): TableStub {
    return {
      insert: vi.fn(),
      update: vi.fn((payload: unknown) => {
        captures.pendingUpdatePayload.push(payload);
        return {
          eq: vi.fn((col: string, val: string) => {
            if (col === "id") captures.pendingUpdateIdFilter.push(val);
            if (col === "status") captures.pendingUpdateStatusFilter.push(val);
            return {
              eq: vi.fn((col2: string, val2: string) => {
                if (col2 === "id") captures.pendingUpdateIdFilter.push(val2);
                if (col2 === "status") captures.pendingUpdateStatusFilter.push(val2);
                return {
                  select: vi.fn(async () =>
                    setup.pendingSignupUpdate ?? {
                      data: [{ id: "pending-1" }],
                      error: null,
                    }
                  ),
                };
              }),
            };
          }),
        };
      }),
      delete: vi.fn(),
    };
  }

  return {
    from: vi.fn((table: string) => {
      if (table === "tenants") return tenantsTable();
      if (table === "partner_client_mapping") return mappingTable();
      if (table === "pending_signup") return pendingSignupTable();
      throw new Error(`unexpected table in mock: ${table}`);
    }),
    auth: {
      admin: {
        createUser: vi.fn(async (payload: unknown) => {
          captures.createUserPayload.push(payload);
          return (
            setup.authCreateUser ?? {
              data: { user: { id: "user-new-id" } },
              error: null,
            }
          );
        }),
        deleteUser: vi.fn(async (id: string) => {
          captures.deleteUserIds.push(id);
          return setup.authDeleteUser ?? { error: null };
        }),
      },
    },
    __captures: captures,
  };
}

import { createAdminClient } from "@/lib/supabase/admin";
import { provisionSelfSignupTenant } from "../auto-provision";

const BASE_INPUT = {
  pending_signup_id: "pending-1",
  partner_tenant_id: "partner-tenant-1",
  email_lower: "alice@example.com",
  first_name: "Alice",
  last_name: "Mueller",
  company_name: "Acme GmbH",
  dsgvo_consent_text_version: "v1-2026-05",
  dsgvo_consent_accepted_at: "2026-05-18T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("provisionSelfSignupTenant — V7 SLC-133 MT-1 auto-provision", () => {
  it("Test 1 — Happy-Path: all 4 steps green, returns ok with both new IDs", async () => {
    const admin = buildAdmin();
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );

    const result = await provisionSelfSignupTenant(BASE_INPUT);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.new_tenant_id).toBe("tenant-new-id");
      expect(result.new_user_id).toBe("user-new-id");
      expect(result.pending_already_verified).toBe(false);
    }

    // Verify 4-step sequence executed exactly once.
    expect(admin.__captures.tenantInsertPayload).toHaveLength(1);
    expect(admin.__captures.createUserPayload).toHaveLength(1);
    expect(admin.__captures.mappingInsertPayload).toHaveLength(1);
    expect(admin.__captures.pendingUpdatePayload).toHaveLength(1);

    // No rollback paths fired.
    expect(admin.__captures.tenantDeleteIds).toHaveLength(0);
    expect(admin.__captures.deleteUserIds).toHaveLength(0);
  });

  it("Test 2 — Email-Conflict cross-Partner: createUser returns 'already registered' message, returns email_conflict_cross_partner and rolls back tenant", async () => {
    const admin = buildAdmin({
      authCreateUser: {
        data: { user: null },
        error: { message: "A user with this email address has already been registered" },
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );

    const result = await provisionSelfSignupTenant(BASE_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("email_conflict_cross_partner");
    }

    // Tenant was inserted but then rolled back.
    expect(admin.__captures.tenantInsertPayload).toHaveLength(1);
    expect(admin.__captures.tenantDeleteIds).toEqual(["tenant-new-id"]);

    // No mapping insert, no pending update, no user-delete (user never created).
    expect(admin.__captures.mappingInsertPayload).toHaveLength(0);
    expect(admin.__captures.pendingUpdatePayload).toHaveLength(0);
    expect(admin.__captures.deleteUserIds).toHaveLength(0);
  });

  it("Test 3 — Tenant-Insert-Failure (FK violation): returns tenant_insert_failed, NO createUser call, NO rollback needed", async () => {
    const admin = buildAdmin({
      tenants: {
        insert: {
          data: null,
          error: {
            message: "insert or update on table \"tenants\" violates foreign key constraint",
            code: "23503",
          },
        },
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );

    const result = await provisionSelfSignupTenant(BASE_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("tenant_insert_failed");
    }

    expect(admin.__captures.tenantInsertPayload).toHaveLength(1);

    // No subsequent steps reached.
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
    expect(admin.__captures.mappingInsertPayload).toHaveLength(0);
    expect(admin.__captures.pendingUpdatePayload).toHaveLength(0);

    // Nothing to roll back (tenant insert itself failed).
    expect(admin.__captures.tenantDeleteIds).toHaveLength(0);
    expect(admin.__captures.deleteUserIds).toHaveLength(0);
  });

  it("Test 4 — User-Create-Failure (generic GoTrue-Outage, non-conflict message): rolls back tenant + returns user_create_failed", async () => {
    const admin = buildAdmin({
      authCreateUser: {
        data: { user: null },
        error: { message: "Internal Server Error: connection refused" },
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );

    const result = await provisionSelfSignupTenant(BASE_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("user_create_failed");
    }

    // Tenant rolled back.
    expect(admin.__captures.tenantDeleteIds).toEqual(["tenant-new-id"]);
    expect(admin.__captures.mappingInsertPayload).toHaveLength(0);
    expect(admin.__captures.pendingUpdatePayload).toHaveLength(0);
  });

  it("Test 5 — Mapping-Insert-Failure (trigger violation): rolls back user + tenant + returns mapping_insert_failed", async () => {
    const admin = buildAdmin({
      partnerClientMappingInsert: {
        error: {
          message:
            "partner_tenant_id must reference a tenant with tenant_kind=partner_organization (got: direct_client)",
          code: "23514",
        },
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );

    const result = await provisionSelfSignupTenant(BASE_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("mapping_insert_failed");
    }

    // Both rollback paths fired: deleteUser BEFORE delete tenants.
    expect(admin.__captures.deleteUserIds).toEqual(["user-new-id"]);
    expect(admin.__captures.tenantDeleteIds).toEqual(["tenant-new-id"]);

    // Pending NOT updated.
    expect(admin.__captures.pendingUpdatePayload).toHaveLength(0);
  });

  it("Test 6 — ISSUE-051 Resolution: first_name + last_name are passed via user_metadata to auth.admin.createUser", async () => {
    const admin = buildAdmin();
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );

    await provisionSelfSignupTenant({
      ...BASE_INPUT,
      first_name: "Friedrich",
      last_name: "von Habsburg-Lothringen",
    });

    expect(admin.__captures.createUserPayload).toHaveLength(1);
    const payload = admin.__captures.createUserPayload[0] as {
      email: string;
      email_confirm: boolean;
      user_metadata: {
        tenant_id: string;
        role: string;
        first_name: string;
        last_name: string;
      };
    };

    expect(payload.email).toBe("alice@example.com");
    expect(payload.email_confirm).toBe(true);
    expect(payload.user_metadata.tenant_id).toBe("tenant-new-id");
    expect(payload.user_metadata.role).toBe("tenant_admin");
    expect(payload.user_metadata.first_name).toBe("Friedrich");
    expect(payload.user_metadata.last_name).toBe("von Habsburg-Lothringen");
  });

  it("Test 7 — Pending-Update: sets status='verified' + verified_at and filters WHERE id + status='pending' (Race-Guard)", async () => {
    const admin = buildAdmin();
    vi.mocked(createAdminClient).mockReturnValue(
      admin as unknown as ReturnType<typeof createAdminClient>
    );

    await provisionSelfSignupTenant(BASE_INPUT);

    expect(admin.__captures.pendingUpdatePayload).toHaveLength(1);
    const payload = admin.__captures.pendingUpdatePayload[0] as {
      status: string;
      verified_at: string;
    };
    expect(payload.status).toBe("verified");
    // ISO timestamp within last 10s — sanity for now().
    const ts = new Date(payload.verified_at).getTime();
    expect(Math.abs(Date.now() - ts)).toBeLessThan(10_000);

    // Filter chain: WHERE id=pending_signup_id AND status='pending'.
    expect(admin.__captures.pendingUpdateIdFilter).toContain("pending-1");
    expect(admin.__captures.pendingUpdateStatusFilter).toContain("pending");

    // Race-Guard signal: 0 rows updated (e.g., parallel Verify-Klick) → ok=true
    // mit pending_already_verified=true.
    const adminRace = buildAdmin({
      pendingSignupUpdate: { data: [], error: null },
    });
    vi.mocked(createAdminClient).mockReturnValue(
      adminRace as unknown as ReturnType<typeof createAdminClient>
    );
    const raceResult = await provisionSelfSignupTenant(BASE_INPUT);
    expect(raceResult.ok).toBe(true);
    if (raceResult.ok) {
      expect(raceResult.pending_already_verified).toBe(true);
    }
  });
});
