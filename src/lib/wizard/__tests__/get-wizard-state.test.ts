// SLC-046 MT-3 — Tests fuer getWizardStateForCurrentUser.
//
// Pruef-Matrix (AC-9, AC-10, AC-11):
//   - kein User                                         → shouldShow=false
//   - kein Profil                                       → shouldShow=false
//   - strategaize_admin (role-Filter, AC-9)            → shouldShow=false
//   - tenant_member                                     → shouldShow=false
//   - tenant_admin + state='completed'                  → shouldShow=false
//   - tenant_admin + state='skipped'                    → shouldShow=false
//   - tenant_admin + state='started'                    → shouldShow=true (Resume)
//   - tenant_admin + state='pending' + 0 sessions       → shouldShow=true (AC-10)
//   - tenant_admin + state='pending' + 1+ sessions      → shouldShow=false (AC-11 Soft-Cond)

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const tenantSingleMock = vi.fn();
  const tenantEqMock = vi.fn(() => ({ single: tenantSingleMock }));
  const tenantSelectMock = vi.fn(() => ({ eq: tenantEqMock }));

  const profileSingleMock = vi.fn();
  const profileEqMock = vi.fn(() => ({ single: profileSingleMock }));
  const profileSelectMock = vi.fn(() => ({ eq: profileEqMock }));

  // capture_session count uses head:true (no rows, only count)
  const sessionEqMock = vi.fn();
  const sessionSelectMock = vi.fn(() => ({ eq: sessionEqMock }));

  const fromMock = vi.fn((table: string) => {
    if (table === "profiles") return { select: profileSelectMock };
    if (table === "tenants") return { select: tenantSelectMock };
    if (table === "capture_session") return { select: sessionSelectMock };
    throw new Error(`unexpected from(${table})`);
  });

  const getUserMock = vi.fn();

  return {
    tenantSingleMock,
    profileSingleMock,
    sessionEqMock,
    fromMock,
    getUserMock,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUserMock },
    from: mocks.fromMock,
  })),
}));

const {
  tenantSingleMock,
  profileSingleMock,
  sessionEqMock,
  getUserMock,
} = mocks;

import { getWizardStateForCurrentUser } from "../get-wizard-state";

const USER_ID = "user-uuid";
const TENANT_ID = "tenant-uuid";

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } } });
  profileSingleMock.mockResolvedValue({
    data: { tenant_id: TENANT_ID, role: "tenant_admin" },
  });
  tenantSingleMock.mockResolvedValue({
    data: { onboarding_wizard_state: "pending", onboarding_wizard_step: 1 },
  });
  sessionEqMock.mockResolvedValue({ count: 0, data: null, error: null });
});

describe("getWizardStateForCurrentUser — Auth-Pfad", () => {
  it("returnt shouldShow=false bei kein-User", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await getWizardStateForCurrentUser();
    expect(result.shouldShow).toBe(false);
  });

  it("returnt shouldShow=false bei kein-Profil", async () => {
    profileSingleMock.mockResolvedValue({ data: null });
    const result = await getWizardStateForCurrentUser();
    expect(result.shouldShow).toBe(false);
  });
});

describe("getWizardStateForCurrentUser — Rolle-Filter (AC-9, DEC-051)", () => {
  it("returnt shouldShow=false fuer strategaize_admin (auch wenn tenant.state='pending')", async () => {
    profileSingleMock.mockResolvedValue({
      data: { tenant_id: null, role: "strategaize_admin" },
    });
    const result = await getWizardStateForCurrentUser();
    expect(result.shouldShow).toBe(false);
  });

  it("returnt shouldShow=false fuer tenant_member", async () => {
    profileSingleMock.mockResolvedValue({
      data: { tenant_id: TENANT_ID, role: "tenant_member" },
    });
    const result = await getWizardStateForCurrentUser();
    expect(result.shouldShow).toBe(false);
  });

  it("returnt shouldShow=false fuer employee", async () => {
    profileSingleMock.mockResolvedValue({
      data: { tenant_id: TENANT_ID, role: "employee" },
    });
    const result = await getWizardStateForCurrentUser();
    expect(result.shouldShow).toBe(false);
  });
});

describe("getWizardStateForCurrentUser — State-Maschine fuer tenant_admin", () => {
  it("returnt shouldShow=false fuer state='completed'", async () => {
    tenantSingleMock.mockResolvedValue({
      data: { onboarding_wizard_state: "completed", onboarding_wizard_step: 4 },
    });
    const result = await getWizardStateForCurrentUser();
    expect(result).toEqual({ shouldShow: false, state: "completed", step: 4 });
  });

  it("returnt shouldShow=false fuer state='skipped'", async () => {
    tenantSingleMock.mockResolvedValue({
      data: { onboarding_wizard_state: "skipped", onboarding_wizard_step: 2 },
    });
    const result = await getWizardStateForCurrentUser();
    expect(result).toEqual({ shouldShow: false, state: "skipped", step: 2 });
  });

  it("returnt shouldShow=true fuer state='started' (Resume, AC-10)", async () => {
    tenantSingleMock.mockResolvedValue({
      data: { onboarding_wizard_state: "started", onboarding_wizard_step: 3 },
    });
    const result = await getWizardStateForCurrentUser();
    expect(result).toEqual({ shouldShow: true, state: "started", step: 3 });
  });

  it("returnt shouldShow=true fuer state='pending' UND 0 capture_sessions (AC-10)", async () => {
    sessionEqMock.mockResolvedValue({ count: 0, data: null, error: null });
    const result = await getWizardStateForCurrentUser();
    expect(result.shouldShow).toBe(true);
    expect(result.state).toBe("pending");
  });

  it("returnt shouldShow=false fuer state='pending' aber >=1 capture_sessions (AC-11 Soft-Cond)", async () => {
    sessionEqMock.mockResolvedValue({ count: 5, data: null, error: null });
    const result = await getWizardStateForCurrentUser();
    expect(result.shouldShow).toBe(false);
    expect(result.state).toBe("pending");
  });
});
