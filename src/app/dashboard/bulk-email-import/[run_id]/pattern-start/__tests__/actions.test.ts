// V9 SLC-167 MT-4 — Vitest fuer Pattern-Start Server-Actions.
//
// Spec: slices/SLC-167-v9-pattern-curation-cost-cap.md (MT-4 Verification L146-151)
//
// Strategie: vi.mock fuer @/lib/supabase/server + @/lib/supabase/admin + next/cache.
// Pattern aus filter-review/__tests__/actions.test.ts. Wir mocken Supabase-Calls
// auf User- + Admin-Ebene, weil startPatternExtraction beide nutzt
// (user-context fuer status + threads, admin-context fuer cost-cap-store + ai_jobs).
//
// Coverage:
//   1. Auth-Gate (4 Faelle: unauth, no-profile, employee/tenant_member, no-tenant_id)
//   2. Input-Validation: invalid UUID
//   3. Status-Pre-Check: not-found, wrong status ('parsed', 'pre_filtered', 'pattern_extracting')
//   4. No-Threads-Edge-Case: 0 redacted threads
//   5. Slice-Spec L146 Case A: Estimate unter Pre-Approval-Schwelle → Direkt-Enqueue ohne preApproval
//   6. Slice-Spec L147 Case B: Estimate ueber Pre-Approval ohne preApprovalGranted → 'pre_approval_required'
//   7. Slice-Spec L148 Case C: Estimate ueber Pre-Approval mit preApprovalGranted → Direkt-Enqueue
//   8. Slice-Spec L149 Case D: Estimate ueber Run-Cap → 'run_cap_exceeded' (auch mit preApprovalGranted)
//   9. Slice-Spec L150 Case E: Tenant-Monatscap erreicht → 'tenant_month_cap_exceeded'
//  10. INSERT-Fail + UPDATE-Fail Pfade
//
// Test-Daten-Konvention:
//   Pre-Approval-Schwelle DEFAULT 10 EUR, Run-Cap DEFAULT 20 EUR, Tenant-Monatscap DEFAULT 100 EUR.
//   Estimate-Heuristik (cost-estimate.ts): tokensIn = body_chars*0.25 + threadCount*1100,
//   tokensOut = threadCount*800, costUsd = tokensIn*3/1M + tokensOut*15/1M, costEur = costUsd*0.92.
//   Fuer kleinen Test-Run: 1 Thread mit 100-char body
//     tokensIn = 25 + 1100 = 1125, tokensOut = 800
//     costUsd = 1125*3e-6 + 800*15e-6 = 0.003375 + 0.012 = 0.015375
//     costEur = 0.015375 * 0.92 ≈ 0.01415 EUR (weit unter 10 EUR Pre-Approval)
//   Fuer grossen Test-Run: 600 Threads mit 1500-char body
//     tokensIn = 600*375 + 600*1100 = 225000 + 660000 = 885000
//     tokensOut = 600*800 = 480000
//     costUsd = 885000*3e-6 + 480000*15e-6 = 2.655 + 7.2 = 9.855
//     costEur = 9.855*0.92 ≈ 9.07 (knapp unter 10 EUR Pre-Approval — Edge-Case)
//   Fuer Pre-Approval-Trigger: 700 Threads mit 1500-char body
//     tokensIn = 700*375 + 700*1100 = 262500 + 770000 = 1032500
//     tokensOut = 700*800 = 560000
//     costUsd = 1032500*3e-6 + 560000*15e-6 = 3.0975 + 8.4 = 11.4975
//     costEur = 11.4975*0.92 ≈ 10.58 EUR (Pre-Approval ja, unter 20 Run-Cap)
//   Fuer Run-Cap-Trigger: 1500 Threads mit 1500-char body
//     tokensIn = 1500*375 + 1500*1100 = 562500 + 1650000 = 2212500
//     tokensOut = 1500*800 = 1200000
//     costUsd = 2212500*3e-6 + 1200000*15e-6 = 6.6375 + 18.0 = 24.6375
//     costEur = 24.6375*0.92 ≈ 22.67 EUR (ueber 20 Run-Cap)

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  userClientMock: vi.fn(),
  adminClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePathMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mocks.userClientMock(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.adminClientMock(),
}));

import { startPatternExtraction } from "../actions";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const RUN_ID = "33333333-3333-3333-3333-333333333333";
const JOB_ID = "44444444-4444-4444-4444-444444444444";

// ──────────────────────────────────────────────────────────────────────────────
// User-Client Mock
// ──────────────────────────────────────────────────────────────────────────────

interface UserClientOpts {
  user?: { id: string; email: string } | null;
  profile?: { id: string; tenant_id: string | null; role: string } | null;
  profileError?: { message: string } | null;
  runRow?: { id: string; status: string } | null;
  runError?: { message: string } | null;
  threadRows?: Array<{ redacted_body: string | null }>;
  threadsError?: { message: string } | null;
  updateError?: { message: string } | null;
  updateTracker?: Array<{ patch: Record<string, unknown> }>;
}

function buildUserClient(opts: UserClientOpts) {
  const getUser = vi.fn(async () => ({
    data: {
      user:
        opts.user === undefined
          ? { id: USER, email: "gf@example.com" }
          : opts.user,
    },
  }));

  const fromMock = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data:
                opts.profile === undefined
                  ? { id: USER, tenant_id: TENANT, role: "tenant_admin" }
                  : opts.profile,
              error: opts.profileError ?? null,
            }),
          }),
        }),
      };
    }
    if (table === "email_bulk_run") {
      // Two paths: select+eq+maybeSingle (status check) AND update+eq (status flip)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.runRow ?? null,
              error: opts.runError ?? null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          opts.updateTracker?.push({ patch });
          return {
            eq: async () => ({
              error: opts.updateError ?? null,
            }),
          };
        },
      };
    }
    if (table === "email_thread") {
      return {
        select: () => ({
          eq: (col: string, _val: unknown) => {
            void col;
            const finalize = async () => ({
              data: opts.threadRows ?? [],
              error: opts.threadsError ?? null,
            });
            return {
              eq(_col2: string, _val2: unknown) {
                return {
                  then(onfulfilled: (v: unknown) => unknown) {
                    return finalize().then(onfulfilled);
                  },
                };
              },
            };
          },
        }),
      };
    }
    throw new Error(`unexpected user-client from(${table})`);
  });

  return Promise.resolve({ auth: { getUser }, from: fromMock });
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin-Client Mock (vw_bulk_email_cost_monthly + ai_jobs INSERT)
// ──────────────────────────────────────────────────────────────────────────────

interface AdminClientOpts {
  tenantMonthCostEur?: number;
  costStoreError?: { message: string } | null;
  insertError?: { message: string } | null;
  inserts?: Array<{ table: string; row: Record<string, unknown> }>;
}

function buildAdminClient(opts: AdminClientOpts) {
  return {
    from(table: string) {
      if (table === "vw_bulk_email_cost_monthly") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () =>
                  opts.costStoreError
                    ? { data: null, error: opts.costStoreError }
                    : {
                        data: {
                          total_cost_eur: opts.tenantMonthCostEur ?? 0,
                        },
                        error: null,
                      },
              }),
            }),
          }),
        };
      }
      if (table === "ai_jobs") {
        return {
          insert: (row: Record<string, unknown>) => {
            opts.inserts?.push({ table, row });
            return {
              select: () => ({
                single: async () =>
                  opts.insertError
                    ? { data: null, error: opts.insertError }
                    : { data: { id: JOB_ID }, error: null },
              }),
            };
          },
        };
      }
      throw new Error(`unexpected admin-client from(${table})`);
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Test-Helper: Threads-Generator
// ──────────────────────────────────────────────────────────────────────────────

function makeThreads(count: number, bodyChars: number) {
  const body = "x".repeat(bodyChars);
  return Array.from({ length: count }, () => ({ redacted_body: body }));
}

beforeEach(() => {
  mocks.revalidatePathMock.mockReset();
  mocks.userClientMock.mockReset();
  mocks.adminClientMock.mockReset();
  // Cap-ENVs reset
  delete process.env.V9_BULK_EMAIL_RUN_CAP_EUR;
  delete process.env.V9_BULK_EMAIL_TENANT_MONTH_CAP_EUR;
  delete process.env.V9_BULK_EMAIL_PRE_APPROVAL_THRESHOLD_EUR;
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("startPatternExtraction — Auth-Gate", () => {
  it("rejects unauthenticated user", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ user: null }),
    );
    const result = await startPatternExtraction(RUN_ID, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("auth");
      expect(result.message).toMatch(/Nicht authentifiziert/);
    }
  });

  it("rejects missing profile", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        profile: null,
        profileError: { message: "not found" },
      }),
    );
    const result = await startPatternExtraction(RUN_ID, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("auth");
  });

  it("rejects employee role", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        profile: { id: USER, tenant_id: TENANT, role: "employee" },
      }),
    );
    const result = await startPatternExtraction(RUN_ID, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("auth");
      expect(result.message).toMatch(/Tenant-Admins/);
    }
  });

  it("rejects tenant_admin without tenant_id", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        profile: { id: USER, tenant_id: null, role: "tenant_admin" },
      }),
    );
    const result = await startPatternExtraction(RUN_ID, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Kein Tenant/);
  });
});

describe("startPatternExtraction — Input-Validation", () => {
  it("rejects invalid UUID", async () => {
    mocks.userClientMock.mockImplementation(() => buildUserClient({}));
    const result = await startPatternExtraction("not-uuid", false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("uuid");
      expect(result.message).toMatch(/bulk_run_id/);
    }
  });
});

describe("startPatternExtraction — Status-Pre-Check", () => {
  it("rejects when bulk_run not found", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ runRow: null }),
    );
    const result = await startPatternExtraction(RUN_ID, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_found");
      expect(result.message).toMatch(/nicht gefunden/);
    }
  });

  it("rejects status='pre_filtered' (not yet thread-redacted)", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({ runRow: { id: RUN_ID, status: "pre_filtered" } }),
    );
    const result = await startPatternExtraction(RUN_ID, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("wrong_status");
      expect(result.message).toMatch(/'pre_filtered'/);
    }
  });

  it("rejects status='pattern_extracting' (already started)", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "pattern_extracting" },
      }),
    );
    const result = await startPatternExtraction(RUN_ID, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("wrong_status");
  });

  it("rejects when threads-lookup fails", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadsError: { message: "db down" },
      }),
    );
    const result = await startPatternExtraction(RUN_ID, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("db_error");
  });

  it("rejects when no threads exist", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadRows: [],
      }),
    );
    const result = await startPatternExtraction(RUN_ID, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_threads");
      expect(result.message).toMatch(/Keine redacted Threads/);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Slice-Spec L146-151 Cap-Coverage
// ──────────────────────────────────────────────────────────────────────────────

describe("startPatternExtraction — Slice-Spec L146 Case A: under pre-approval threshold", () => {
  it("direkter Enqueue ohne preApprovalGranted (1 Thread × 100 chars, ~0.014 EUR)", async () => {
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    const updateTracker: Array<{ patch: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadRows: makeThreads(1, 100),
        updateTracker,
      }),
    );
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClient({ tenantMonthCostEur: 0, inserts }),
    );

    const result = await startPatternExtraction(RUN_ID, false);

    expect(result).toEqual({ ok: true, jobId: JOB_ID });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.table).toBe("ai_jobs");
    expect(inserts[0]?.row).toMatchObject({
      tenant_id: TENANT,
      job_type: "email_bulk_pattern_extract",
      status: "pending",
      payload: { bulk_run_id: RUN_ID },
    });
    expect(updateTracker).toHaveLength(1);
    expect(updateTracker[0]?.patch.status).toBe("pattern_extracting");
    expect(mocks.revalidatePathMock).toHaveBeenCalledWith(
      `/dashboard/bulk-email-import/${RUN_ID}/pattern-start`,
    );
    expect(mocks.revalidatePathMock).toHaveBeenCalledWith(
      `/dashboard/bulk-email-import/${RUN_ID}`,
    );
  });
});

describe("startPatternExtraction — Slice-Spec L147 Case B: over pre-approval threshold WITHOUT preApprovalGranted", () => {
  it("rejects with pre_approval_required (700 Threads × 1500 chars, ~10.58 EUR)", async () => {
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadRows: makeThreads(700, 1500),
      }),
    );
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClient({ tenantMonthCostEur: 0, inserts }),
    );

    const result = await startPatternExtraction(RUN_ID, false);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("pre_approval_required");
      expect(result.message).toMatch(/Pre-Approval-Schwelle/);
    }
    expect(inserts).toHaveLength(0); // KEIN Enqueue
    expect(mocks.revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("startPatternExtraction — Slice-Spec L148 Case C: over pre-approval threshold WITH preApprovalGranted", () => {
  it("erfolgreicher Enqueue mit preApprovalGranted=true (700 Threads × 1500 chars)", async () => {
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadRows: makeThreads(700, 1500),
      }),
    );
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClient({ tenantMonthCostEur: 0, inserts }),
    );

    const result = await startPatternExtraction(RUN_ID, true);

    expect(result).toEqual({ ok: true, jobId: JOB_ID });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.row.job_type).toBe("email_bulk_pattern_extract");
  });
});

describe("startPatternExtraction — Slice-Spec L149 Case D: over run-cap (hard block)", () => {
  it("rejects with run_cap_exceeded EVEN with preApprovalGranted (1500 Threads × 1500 chars, ~22.67 EUR)", async () => {
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadRows: makeThreads(1500, 1500),
      }),
    );
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClient({ tenantMonthCostEur: 0, inserts }),
    );

    const result = await startPatternExtraction(RUN_ID, true);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("run_cap_exceeded");
      expect(result.message).toMatch(/Run-Limit/);
    }
    expect(inserts).toHaveLength(0);
  });

  it("ENV-Override V9_BULK_EMAIL_RUN_CAP_EUR=50 erlaubt Run", async () => {
    process.env.V9_BULK_EMAIL_RUN_CAP_EUR = "50";
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadRows: makeThreads(1500, 1500),
      }),
    );
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClient({ tenantMonthCostEur: 0, inserts }),
    );

    const result = await startPatternExtraction(RUN_ID, true);
    expect(result.ok).toBe(true);
  });
});

describe("startPatternExtraction — Slice-Spec L150 Case E: tenant month cap exceeded", () => {
  it("rejects with tenant_month_cap_exceeded (Tenant hat schon 95 EUR im Monat + 10 EUR Run)", async () => {
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadRows: makeThreads(700, 1500), // ~10.58 EUR
      }),
    );
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClient({ tenantMonthCostEur: 95, inserts }),
    );

    const result = await startPatternExtraction(RUN_ID, true);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("tenant_month_cap_exceeded");
      expect(result.message).toMatch(/Tenant-Monatslimit/);
    }
    expect(inserts).toHaveLength(0);
  });

  it("Tenant mit 85 EUR + 10 EUR Run unter 100 EUR Cap → erfolgreich", async () => {
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadRows: makeThreads(700, 1500), // ~10.58 EUR
      }),
    );
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClient({ tenantMonthCostEur: 85, inserts }),
    );

    const result = await startPatternExtraction(RUN_ID, true);
    expect(result.ok).toBe(true);
  });
});

describe("startPatternExtraction — DB-Error Handling", () => {
  it("returns db_error on ai_jobs INSERT failure", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadRows: makeThreads(1, 100),
      }),
    );
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClient({
        tenantMonthCostEur: 0,
        insertError: { message: "fk violation" },
      }),
    );

    const result = await startPatternExtraction(RUN_ID, false);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("db_error");
      expect(result.message).toMatch(/Worker-Job-Enqueue/);
    }
    expect(mocks.revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns db_error on status UPDATE failure", async () => {
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadRows: makeThreads(1, 100),
        updateError: { message: "rls deny" },
      }),
    );
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClient({ tenantMonthCostEur: 0 }),
    );

    const result = await startPatternExtraction(RUN_ID, false);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("db_error");
      expect(result.message).toMatch(/Status-UPDATE/);
    }
  });
});

describe("startPatternExtraction — ENV-Overrides", () => {
  it("Pre-Approval-Schwelle via ENV ueberschrieben (PRE_APPROVAL_THRESHOLD=5 → 0.014 EUR ist UNTER, OK)", async () => {
    process.env.V9_BULK_EMAIL_PRE_APPROVAL_THRESHOLD_EUR = "5";
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadRows: makeThreads(1, 100), // ~0.014 EUR < 5 EUR
      }),
    );
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClient({ tenantMonthCostEur: 0, inserts }),
    );

    const result = await startPatternExtraction(RUN_ID, false);
    expect(result.ok).toBe(true);
  });

  it("Pre-Approval-Schwelle via ENV gesenkt (THRESHOLD=0.001 EUR) triggert Pre-Approval", async () => {
    process.env.V9_BULK_EMAIL_PRE_APPROVAL_THRESHOLD_EUR = "0.001";
    mocks.userClientMock.mockImplementation(() =>
      buildUserClient({
        runRow: { id: RUN_ID, status: "thread_redacted" },
        threadRows: makeThreads(1, 100), // ~0.014 EUR > 0.001 EUR
      }),
    );
    mocks.adminClientMock.mockImplementation(() =>
      buildAdminClient({ tenantMonthCostEur: 0 }),
    );

    const result = await startPatternExtraction(RUN_ID, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("pre_approval_required");
  });
});
