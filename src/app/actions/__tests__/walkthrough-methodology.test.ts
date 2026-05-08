// SLC-079 MT-1 — Vitest fuer 5 Server Actions in walkthrough-methodology.ts.
// Mocks supabase server- + admin-client + logger. Pro Action: Happy + Auth-Reject
// + Validation-Reject + (wo relevant) Tenant-Isolation.

import { describe, it, expect, beforeEach, vi } from "vitest";

const ADMIN_TENANT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-2222-2222-222222222222";
const ADMIN_USER_ID = "33333333-3333-3333-3333-333333333333";
const TENANT_ADMIN_USER_ID = "44444444-4444-4444-4444-444444444444";
const STEP_ID = "55555555-5555-5555-5555-555555555555";
const SESSION_ID = "66666666-6666-6666-6666-666666666666";

type Role = "strategaize_admin" | "tenant_admin" | "tenant_member" | "employee";

interface MockUser {
  id: string;
}

interface MockProfile {
  role: Role;
  tenant_id: string | null;
}

interface MockState {
  user: MockUser | null;
  profile: MockProfile | null;
  stepRow: { id: string; tenant_id: string; walkthrough_session_id: string; deleted_at?: string | null } | null;
  stepLoadError: Error | null;
  sessionRow: { id: string; tenant_id: string; status: string } | null;
  sessionLoadError: Error | null;
  updates: Array<{ table: string; patch: Record<string, unknown>; matchId?: string }>;
  inserts: Array<{ table: string; rows: Record<string, unknown>[] }>;
  updateError: Error | null;
  capturedExceptions: Array<{ error: unknown; metadata?: unknown }>;
}

const state: MockState = {
  user: null,
  profile: null,
  stepRow: null,
  stepLoadError: null,
  sessionRow: null,
  sessionLoadError: null,
  updates: [],
  inserts: [],
  updateError: null,
  capturedExceptions: [],
};

function makeUserClient() {
  return {
    auth: {
      async getUser() {
        return { data: { user: state.user }, error: null };
      },
    },
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                async single() {
                  if (table === "profiles") {
                    if (!state.profile) {
                      return { data: null, error: new Error("not found") };
                    }
                    return { data: state.profile, error: null };
                  }
                  return { data: null, error: new Error(`unmocked user-client SELECT ${table}`) };
                },
              };
            },
          };
        },
      };
    },
  };
}

function makeAdminClient() {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                async single() {
                  if (table === "walkthrough_step") {
                    if (state.stepLoadError) return { data: null, error: state.stepLoadError };
                    return { data: state.stepRow, error: null };
                  }
                  if (table === "walkthrough_session") {
                    if (state.sessionLoadError) return { data: null, error: state.sessionLoadError };
                    return { data: state.sessionRow, error: null };
                  }
                  return { data: null, error: new Error(`unmocked admin SELECT ${table}`) };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(_col: string, val: string) {
              state.updates.push({ table, patch, matchId: val });
              if (state.updateError) return { error: state.updateError };
              return { error: null };
            },
          };
        },
        insert(rowOrRows: Record<string, unknown> | Record<string, unknown>[]) {
          const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
          state.inserts.push({ table, rows });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeUserClient(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeAdminClient(),
}));
vi.mock("@/lib/logger", () => ({
  captureException: (error: unknown, ctx?: { metadata?: unknown }) => {
    state.capturedExceptions.push({ error, metadata: ctx?.metadata });
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

const {
  moveWalkthroughStepMapping,
  editWalkthroughStep,
  softDeleteWalkthroughStep,
  approveOrRejectWalkthroughMethodology,
  logRawTranscriptView,
} = await import("../walkthrough-methodology");

beforeEach(() => {
  state.user = { id: ADMIN_USER_ID };
  state.profile = { role: "strategaize_admin", tenant_id: null };
  state.stepRow = {
    id: STEP_ID,
    tenant_id: ADMIN_TENANT_ID,
    walkthrough_session_id: SESSION_ID,
    deleted_at: null,
  };
  state.stepLoadError = null;
  state.sessionRow = {
    id: SESSION_ID,
    tenant_id: ADMIN_TENANT_ID,
    status: "pending_review",
  };
  state.sessionLoadError = null;
  state.updates = [];
  state.inserts = [];
  state.updateError = null;
  state.capturedExceptions = [];
});

// =============================================================================
// moveWalkthroughStepMapping
// =============================================================================

describe("moveWalkthroughStepMapping", () => {
  it("happy path: strategaize_admin moves step to new subtopic", async () => {
    const result = await moveWalkthroughStepMapping({
      walkthroughStepId: STEP_ID,
      newSubtopicId: "Block A / A1 Test",
    });
    expect(result.ok).toBe(true);
    const update = state.updates.find((u) => u.table === "walkthrough_review_mapping");
    expect(update).toBeDefined();
    expect(update!.patch.subtopic_id).toBe("Block A / A1 Test");
    expect(update!.patch.reviewer_corrected).toBe(true);
    expect(update!.patch.reviewer_user_id).toBe(ADMIN_USER_ID);
  });

  it("happy path: move to Unmapped (newSubtopicId=null)", async () => {
    const result = await moveWalkthroughStepMapping({
      walkthroughStepId: STEP_ID,
      newSubtopicId: null,
    });
    expect(result.ok).toBe(true);
    const update = state.updates.find((u) => u.table === "walkthrough_review_mapping");
    expect(update!.patch.subtopic_id).toBeNull();
  });

  it("auth-reject: kein User", async () => {
    state.user = null;
    const result = await moveWalkthroughStepMapping({
      walkthroughStepId: STEP_ID,
      newSubtopicId: "X",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("unauthenticated");
  });

  it("auth-reject: employee-Rolle", async () => {
    state.profile = { role: "employee", tenant_id: ADMIN_TENANT_ID };
    const result = await moveWalkthroughStepMapping({
      walkthroughStepId: STEP_ID,
      newSubtopicId: "X",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden");
  });

  it("validation-reject: invalid UUID", async () => {
    const result = await moveWalkthroughStepMapping({
      walkthroughStepId: "not-a-uuid",
      newSubtopicId: "X",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("step_id_invalid");
  });

  it("tenant-isolation: tenant_admin darf nicht cross-tenant", async () => {
    state.user = { id: TENANT_ADMIN_USER_ID };
    state.profile = { role: "tenant_admin", tenant_id: OTHER_TENANT_ID };
    const result = await moveWalkthroughStepMapping({
      walkthroughStepId: STEP_ID,
      newSubtopicId: "X",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden_tenant");
  });
});

// =============================================================================
// editWalkthroughStep
// =============================================================================

describe("editWalkthroughStep", () => {
  it("happy path: editiert action + responsible", async () => {
    const result = await editWalkthroughStep({
      walkthroughStepId: STEP_ID,
      patches: { action: "Neue Action", responsible: "Buchhaltung" },
    });
    expect(result.ok).toBe(true);
    const update = state.updates.find((u) => u.table === "walkthrough_step");
    expect(update!.patch.action).toBe("Neue Action");
    expect(update!.patch.responsible).toBe("Buchhaltung");
    expect(update!.patch.edited_by_user_id).toBe(ADMIN_USER_ID);
  });

  it("validation-reject: leere action", async () => {
    const result = await editWalkthroughStep({
      walkthroughStepId: STEP_ID,
      patches: { action: "  " },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("action_required");
  });

  it("validation-reject: keine patches", async () => {
    const result = await editWalkthroughStep({
      walkthroughStepId: STEP_ID,
      patches: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("no_patches");
  });
});

// =============================================================================
// softDeleteWalkthroughStep
// =============================================================================

describe("softDeleteWalkthroughStep", () => {
  it("happy path: soft-delete setzt deleted_at", async () => {
    const result = await softDeleteWalkthroughStep({ walkthroughStepId: STEP_ID });
    expect(result.ok).toBe(true);
    const update = state.updates.find((u) => u.table === "walkthrough_step");
    expect(update!.patch.deleted_at).toBeTypeOf("string");
  });

  it("validation-reject: bereits deleted", async () => {
    state.stepRow = {
      ...state.stepRow!,
      deleted_at: new Date().toISOString(),
    };
    const result = await softDeleteWalkthroughStep({ walkthroughStepId: STEP_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("already_deleted");
  });

  it("auth-reject: tenant_member darf nicht", async () => {
    state.profile = { role: "tenant_member", tenant_id: ADMIN_TENANT_ID };
    const result = await softDeleteWalkthroughStep({ walkthroughStepId: STEP_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden");
  });
});

// =============================================================================
// approveOrRejectWalkthroughMethodology
// =============================================================================

describe("approveOrRejectWalkthroughMethodology", () => {
  it("happy path: approve mit Privacy-Checkbox", async () => {
    const result = await approveOrRejectWalkthroughMethodology({
      walkthroughSessionId: SESSION_ID,
      decision: "approved",
      privacyCheckboxConfirmed: true,
      reviewerNote: "OK, sieht sauber aus",
    });
    expect(result.ok).toBe(true);
    const update = state.updates.find((u) => u.table === "walkthrough_session");
    expect(update!.patch.status).toBe("approved");
    expect(update!.patch.privacy_checkbox_confirmed).toBe(true);
    expect(update!.patch.reviewer_note).toBe("OK, sieht sauber aus");
  });

  it("happy path: reject mit Reason", async () => {
    const result = await approveOrRejectWalkthroughMethodology({
      walkthroughSessionId: SESSION_ID,
      decision: "rejected",
      privacyCheckboxConfirmed: false,
      rejectionReason: "Zu unstrukturiert",
    });
    expect(result.ok).toBe(true);
    const update = state.updates.find((u) => u.table === "walkthrough_session");
    expect(update!.patch.status).toBe("rejected");
    expect(update!.patch.rejection_reason).toBe("Zu unstrukturiert");
  });

  it("Pflicht-Checkbox blockt Approve", async () => {
    const result = await approveOrRejectWalkthroughMethodology({
      walkthroughSessionId: SESSION_ID,
      decision: "approved",
      privacyCheckboxConfirmed: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("privacy_checkbox_required");
  });

  it("validation-reject: status != pending_review", async () => {
    state.sessionRow = { ...state.sessionRow!, status: "approved" };
    const result = await approveOrRejectWalkthroughMethodology({
      walkthroughSessionId: SESSION_ID,
      decision: "approved",
      privacyCheckboxConfirmed: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("wrong_status");
  });

  it("validation-reject: invalid decision", async () => {
    const result = await approveOrRejectWalkthroughMethodology({
      walkthroughSessionId: SESSION_ID,
      decision: "xxx" as "approved",
      privacyCheckboxConfirmed: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("decision_invalid");
  });
});

// =============================================================================
// logRawTranscriptView
// =============================================================================

describe("logRawTranscriptView", () => {
  it("happy path: schreibt error_log Eintrag", async () => {
    const result = await logRawTranscriptView({
      walkthroughSessionId: SESSION_ID,
    });
    expect(result.ok).toBe(true);
    const insert = state.inserts.find((i) => i.table === "error_log");
    expect(insert).toBeDefined();
    expect(insert!.rows[0].source).toBe("walkthrough_methodology");
    expect((insert!.rows[0].metadata as Record<string, unknown>).category).toBe(
      "walkthrough_raw_transcript_view",
    );
    expect(insert!.rows[0].user_id).toBe(ADMIN_USER_ID);
  });

  it("validation-reject: invalid UUID", async () => {
    const result = await logRawTranscriptView({
      walkthroughSessionId: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("session_id_invalid");
  });

  it("tenant-isolation: tenant_admin cross-tenant blocked", async () => {
    state.profile = { role: "tenant_admin", tenant_id: OTHER_TENANT_ID };
    const result = await logRawTranscriptView({
      walkthroughSessionId: SESSION_ID,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("forbidden_tenant");
  });
});
