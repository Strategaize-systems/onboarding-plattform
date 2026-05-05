// SLC-046 MT-2 — Tests fuer Wizard Server-Actions.
//
// Strategie: createClient() (RLS-aware, fuer profiles SELECT in requireTenantAdmin)
// UND createAdminClient() (Service-Role, fuer alle tenants UPDATE-Pfade) sind beide gemockt.
// Hintergrund: V4.2 ISSUE-031-Fix (Commit d1978ca) hat den UPDATE-Pfad auf Service-Role
// umgestellt, weil tenants keine UPDATE-RLS-Policy hatte. Der Mock muss deshalb auch den
// Admin-Client abdecken — ohne diesen Mock verlangt der echte Service-Role-Client
// SUPABASE_URL/SERVICE_ROLE_KEY zur Laufzeit (ISSUE-034).
// Tests pruefen:
//   - Cross-Role-Check (DEC-051): nur tenant_admin, nicht strategaize_admin / member / employee.
//   - Atomares Multi-Admin-Lock auf setWizardStarted (rowCount=0 → alreadyStarted=true).
//   - State-Maschine: setWizardStep nur in 'started', setWizardCompleted nur aus 'started',
//     setWizardSkipped aus 'pending' oder 'started'.
//   - step-Validation 1..4.
//   - revalidatePath wird auf erfolgreichem Pfad aufgerufen.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks — vi.hoisted() laeuft vor allen vi.mock()-Aufrufen, damit Top-Level-References
// in den Mock-Factories nicht auf uninitialisierte Outer-Variablen zugreifen.
const mocks = vi.hoisted(() => {
  const updateBuilder = {
    data: [{ id: "tenant-id" }] as Array<{ id: string }> | null,
    error: null as { message: string } | null,
  };
  const revalidateMock = vi.fn();
  const selectMock = vi.fn(() =>
    Promise.resolve({ data: updateBuilder.data, error: updateBuilder.error })
  );
  const inMock = vi.fn(() => ({ select: selectMock }));
  const eqStateMock = vi.fn(() => ({ select: selectMock }));
  const eqIdMock = vi.fn(() => ({ eq: eqStateMock, in: inMock }));
  const updateMock = vi.fn(() => ({ eq: eqIdMock }));

  const profileSingleMock = vi.fn();
  const profileEqMock = vi.fn(() => ({ single: profileSingleMock }));
  const profileSelectMock = vi.fn(() => ({ eq: profileEqMock }));

  const fromMock = vi.fn((table: string) => {
    if (table === "profiles") return { select: profileSelectMock };
    if (table === "tenants") return { update: updateMock };
    throw new Error(`unexpected from(${table})`);
  });

  const getUserMock = vi.fn();

  return {
    updateBuilder,
    revalidateMock,
    selectMock,
    inMock,
    eqStateMock,
    eqIdMock,
    updateMock,
    profileSingleMock,
    profileEqMock,
    profileSelectMock,
    fromMock,
    getUserMock,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidateMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUserMock },
    from: mocks.fromMock,
  })),
}));

// ISSUE-034 (2026-05-05): wizard-actions.ts schaltete in V4.2 (Commit d1978ca, ISSUE-031-Fix)
// alle UPDATE-Pfade auf createAdminClient() um. Der Mock muss diese Factory ebenfalls
// abdecken, sonst laeuft der echte Service-Role-Client und failt mit "supabaseUrl is required".
// createAdminClient ist sync (im Gegensatz zu createClient), gibt direkt den Client zurueck.
// Wir routen die from()-Aufrufe ueber den gleichen fromMock — der unterscheidet bereits
// tenants → updateMock und profiles → profileSelectMock anhand des Tabellen-Namens.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mocks.fromMock,
  })),
}));

const {
  updateBuilder,
  revalidateMock,
  inMock,
  eqStateMock,
  eqIdMock,
  updateMock,
  profileSingleMock,
  getUserMock,
} = mocks;

import {
  setWizardStarted,
  setWizardStep,
  setWizardSkipped,
  setWizardCompleted,
} from "../wizard-actions";

const ADMIN_USER = { id: "user-uuid-1" };
const TENANT_ID = "tenant-uuid-1";

beforeEach(() => {
  vi.clearAllMocks();
  updateBuilder.data = [{ id: TENANT_ID }];
  updateBuilder.error = null;
  getUserMock.mockResolvedValue({ data: { user: ADMIN_USER } });
  profileSingleMock.mockResolvedValue({
    data: { tenant_id: TENANT_ID, role: "tenant_admin" },
  });
});

describe("setWizardStarted — Cross-Role-Check (DEC-051, AC-8)", () => {
  it("lehnt unauthenticated ab", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await setWizardStarted();
    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("lehnt strategaize_admin ab (nur tenant_admin darf den Wizard starten)", async () => {
    profileSingleMock.mockResolvedValue({
      data: { tenant_id: null, role: "strategaize_admin" },
    });
    const result = await setWizardStarted();
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("lehnt tenant_member ab", async () => {
    profileSingleMock.mockResolvedValue({
      data: { tenant_id: TENANT_ID, role: "tenant_member" },
    });
    const result = await setWizardStarted();
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("lehnt employee ab", async () => {
    profileSingleMock.mockResolvedValue({
      data: { tenant_id: TENANT_ID, role: "employee" },
    });
    const result = await setWizardStarted();
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("lehnt fehlendes Profil ab", async () => {
    profileSingleMock.mockResolvedValue({ data: null });
    const result = await setWizardStarted();
    expect(result).toEqual({ ok: false, error: "profile_not_found" });
  });
});

describe("setWizardStarted — Multi-Admin-Lock (R1, AC-7)", () => {
  it("setzt state='started' atomar fuer tenant_admin (alreadyStarted=false)", async () => {
    const result = await setWizardStarted();
    expect(result).toEqual({ ok: true, alreadyStarted: false });
    expect(updateMock).toHaveBeenCalledWith({
      onboarding_wizard_state: "started",
      onboarding_wizard_step: 1,
    });
    expect(eqIdMock).toHaveBeenCalledWith("id", TENANT_ID);
    expect(eqStateMock).toHaveBeenCalledWith("onboarding_wizard_state", "pending");
    expect(revalidateMock).toHaveBeenCalledWith("/dashboard");
  });

  it("liefert alreadyStarted=true wenn rowCount=0 (anderer Admin war schneller)", async () => {
    updateBuilder.data = [];
    const result = await setWizardStarted();
    expect(result).toEqual({ ok: true, alreadyStarted: true });
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it("returnt update_failed wenn DB-Aufruf fehlschlaegt", async () => {
    updateBuilder.error = { message: "RLS denied" };
    updateBuilder.data = null;
    const result = await setWizardStarted();
    expect(result).toEqual({ ok: false, error: "update_failed" });
  });
});

describe("setWizardStep — step-Validation + state-Guard", () => {
  it("lehnt step=0 ab", async () => {
    const result = await setWizardStep(0 as unknown as 1);
    expect(result).toEqual({ ok: false, error: "step_invalid" });
  });

  it("lehnt step=5 ab", async () => {
    const result = await setWizardStep(5 as unknown as 1);
    expect(result).toEqual({ ok: false, error: "step_invalid" });
  });

  it("akzeptiert step=2 in state='started'", async () => {
    const result = await setWizardStep(2);
    expect(result).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith({ onboarding_wizard_step: 2 });
    expect(eqStateMock).toHaveBeenCalledWith("onboarding_wizard_state", "started");
  });

  it("returnt wrong_state wenn rowCount=0 (state nicht 'started')", async () => {
    updateBuilder.data = [];
    const result = await setWizardStep(3);
    expect(result).toEqual({ ok: false, error: "wrong_state" });
  });

  it("lehnt strategaize_admin ab", async () => {
    profileSingleMock.mockResolvedValue({
      data: { tenant_id: null, role: "strategaize_admin" },
    });
    const result = await setWizardStep(2);
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("setWizardSkipped — aus pending oder started", () => {
  it("setzt state='skipped' aus 'pending' oder 'started' (in-Filter)", async () => {
    const result = await setWizardSkipped();
    expect(result).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith({ onboarding_wizard_state: "skipped" });
    expect(inMock).toHaveBeenCalledWith("onboarding_wizard_state", [
      "pending",
      "started",
    ]);
  });

  it("returnt wrong_state aus 'completed'/'skipped' (rowCount=0)", async () => {
    updateBuilder.data = [];
    const result = await setWizardSkipped();
    expect(result).toEqual({ ok: false, error: "wrong_state" });
  });

  it("lehnt tenant_member ab", async () => {
    profileSingleMock.mockResolvedValue({
      data: { tenant_id: TENANT_ID, role: "tenant_member" },
    });
    const result = await setWizardSkipped();
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("setWizardCompleted — nur aus started", () => {
  it("setzt state='completed' + completed_at aus 'started'", async () => {
    const result = await setWizardCompleted();
    expect(result).toEqual({ ok: true });
    const calls = updateMock.mock.calls as unknown as Array<[Record<string, unknown>]>;
    const payload = calls[0][0];
    expect(payload.onboarding_wizard_state).toBe("completed");
    expect(typeof payload.onboarding_wizard_completed_at).toBe("string");
    expect(eqStateMock).toHaveBeenCalledWith("onboarding_wizard_state", "started");
  });

  it("returnt wrong_state aus 'pending' (rowCount=0)", async () => {
    updateBuilder.data = [];
    const result = await setWizardCompleted();
    expect(result).toEqual({ ok: false, error: "wrong_state" });
  });

  it("lehnt employee ab", async () => {
    profileSingleMock.mockResolvedValue({
      data: { tenant_id: TENANT_ID, role: "employee" },
    });
    const result = await setWizardCompleted();
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });
});
