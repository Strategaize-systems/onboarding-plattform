// V9 SLC-168 MT-4 — Vitest fuer Admin Cross-Tenant Bulk-Email-Audit-Page.
//
// Scope:
//   - Auth-Gate: unauthenticated -> redirect /login
//   - Role-Gate: tenant_admin -> redirect /dashboard (Spec-AC-SLC-168-10:
//     "strategaize_admin kann Audit-Log Cross-Tenant einsehen, tenant_admin
//     nur eigenen")
//   - Role-Gate: tenant_member / employee -> redirect /dashboard
//   - strategaize_admin: kein Redirect (Render-Pfad wird angesteuert)
//
// Vollstaendiger Render-Smoke ist E2E-Pfad (Playwright). Hier nur die
// Auth-/Role-Gates, die security-critical sind.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  userClientMock: vi.fn(),
  adminClientMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`__REDIRECT__:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirectMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mocks.userClientMock(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.adminClientMock(),
}));

// Logger nutzt module-load supabase-Client (process.env.SUPABASE_URL) — mocken,
// damit Page-Tests ohne ENV-Variablen laufen.
vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
}));

import AdminBulkEmailAuditPage from "../page";

interface UserClientOpts {
  user?: { id: string; email: string } | null;
  profile?: { email: string; role: string } | null;
}

function buildUserClient(opts: UserClientOpts) {
  const getUser = async () => ({
    data: { user: opts.user === undefined ? { id: "u-1", email: "x@y" } : opts.user },
    error: null,
  });

  const fromMock = vi.fn(() => ({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: opts.profile === undefined ? { email: "x@y", role: "strategaize_admin" } : opts.profile,
          error: null,
        }),
      }),
    }),
  }));

  return Promise.resolve({ auth: { getUser }, from: fromMock });
}

function buildAdminClientEmpty() {
  // Liefert leere Listen — strategaize_admin-Path landet im Render ohne Crash.
  return {
    from: vi.fn((table: string) => {
      if (table === "email_bulk_run") {
        return {
          select: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "tenants") {
        return {
          select: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        };
      }
      if (table === "vw_bulk_email_cost_monthly") {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`unexpected from(${table})`);
    }),
  };
}

beforeEach(() => {
  mocks.redirectMock.mockClear();
  mocks.userClientMock.mockReset();
  mocks.adminClientMock.mockReset();
});

describe("AdminBulkEmailAuditPage — Auth-Gate", () => {
  it("redirects unauthenticated user to /login", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ user: null }),
    );
    await expect(AdminBulkEmailAuditPage()).rejects.toThrow(
      "__REDIRECT__:/login",
    );
  });

  it("redirects tenant_admin to /dashboard (Cross-Tenant-Schutz)", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        profile: { email: "ta@y", role: "tenant_admin" },
      }),
    );
    await expect(AdminBulkEmailAuditPage()).rejects.toThrow(
      "__REDIRECT__:/dashboard",
    );
  });

  it("redirects tenant_member to /dashboard", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        profile: { email: "tm@y", role: "tenant_member" },
      }),
    );
    await expect(AdminBulkEmailAuditPage()).rejects.toThrow(
      "__REDIRECT__:/dashboard",
    );
  });

  it("redirects employee to /dashboard", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        profile: { email: "e@y", role: "employee" },
      }),
    );
    await expect(AdminBulkEmailAuditPage()).rejects.toThrow(
      "__REDIRECT__:/dashboard",
    );
  });

  it("redirects user with no profile to /dashboard", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ profile: null }),
    );
    await expect(AdminBulkEmailAuditPage()).rejects.toThrow(
      "__REDIRECT__:/dashboard",
    );
  });
});

describe("AdminBulkEmailAuditPage — strategaize_admin Render", () => {
  it("does NOT redirect strategaize_admin (kein Crash beim Render)", async () => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
    mocks.adminClientMock.mockImplementation(() => buildAdminClientEmpty());

    // Render durchlaufen — keine redirect-Exception wird geworfen.
    const result = await AdminBulkEmailAuditPage();
    expect(result).toBeDefined();
    expect(mocks.redirectMock).not.toHaveBeenCalled();
  });

  it("does NOT crash when admin-client load throws (loadError-Pfad)", async () => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
    mocks.adminClientMock.mockImplementation(() => ({
      from: () => {
        throw new Error("simulated DB-Error");
      },
    }));

    const result = await AdminBulkEmailAuditPage();
    expect(result).toBeDefined();
    expect(mocks.redirectMock).not.toHaveBeenCalled();
  });
});
