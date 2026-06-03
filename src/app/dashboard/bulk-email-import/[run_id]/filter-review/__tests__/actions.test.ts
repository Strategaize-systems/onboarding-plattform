// V9 SLC-166 MT-3 — Vitest fuer Filter-Review Server-Actions.
//
// Strategie: vi.mock fuer @/lib/supabase/server + @/lib/supabase/admin. Trace-
// Aufnehmer fuer Updates und Inserts. Pattern aus ../../__tests__/actions.test.ts
// (SLC-165 MT-4 uploadBulkEmailRun) — wir bauen kleinere Mocks, weil unsere
// Actions weniger Side-Effects haben (kein Storage, kein Hash, kein File).
//
// Coverage:
//   1. updateEmailClassifications:
//      - Auth-Gate (4 Faelle: unauth, no-profile, employee, member, OK)
//      - Input-Validation (invalid bulk_run_id UUID, non-array, empty array,
//        too-many, invalid update entry)
//      - Happy Path single update + Multi-Update (5 updates, alle UPDATEs
//        getriggert + count summiert)
//      - DB-Error in einem UPDATE -> error + early return
//   2. approvePreFilterAndStartThreadRedact:
//      - Auth-Gate (1 Smoke-Case, gleicher Auth-Pfad)
//      - Invalid UUID
//      - Run not found
//      - Wrong status (parsed, pre_filtering, thread_redacting alle blocken)
//      - Happy Path (INSERT ai_jobs mit korrektem job_type + payload)
//      - INSERT-Failure -> error
//   3. revalidatePath wird in Happy-Path aufgerufen (next/cache mock).

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

import {
  approvePreFilterAndStartThreadRedact,
  updateEmailClassifications,
} from "../actions";
import type { PreFilterLabel } from "../helpers";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const RUN_ID = "33333333-3333-3333-3333-333333333333";
const MSG_ID_1 = "44444444-4444-4444-4444-444444444444";
const MSG_ID_2 = "55555555-5555-5555-5555-555555555555";
const JOB_ID = "66666666-6666-6666-6666-666666666666";

// ──────────────────────────────────────────────────────────────────────────────
// User-Client Mock
// ──────────────────────────────────────────────────────────────────────────────

interface UserClientOpts {
  user?: { id: string; email: string } | null;
  profile?: { id: string; tenant_id: string | null; role: string } | null;
  profileError?: { message: string } | null;
  // Bulk-Run-Status fuer approvePreFilter-Pfad
  runRow?: { id: string; status: string } | null;
  runError?: { message: string } | null;
  // UPDATE-Error fuer updateEmailClassifications
  updateError?: { message: string } | null;
  // Tracker fuer UPDATE-Calls
  updateTracker?: Array<{ patch: Record<string, unknown>; eqChain: Record<string, unknown> }>;
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
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.runRow ?? null,
              error: opts.runError ?? null,
            }),
          }),
        }),
      };
    }
    if (table === "email_message") {
      return {
        update: (patch: Record<string, unknown>, _opts?: unknown) => {
          const entry: { patch: Record<string, unknown>; eqChain: Record<string, unknown> } = {
            patch,
            eqChain: {},
          };
          opts.updateTracker?.push(entry);
          // .eq("id", ...).eq("bulk_run_id", ...) chain — letzter await returnt result
          const finalize = async () => ({
            error: opts.updateError ?? null,
            count: opts.updateError ? null : 1,
          });
          const chain = {
            eq(col: string, val: unknown) {
              entry.eqChain[col] = val;
              return chain;
            },
            then(onfulfilled: (v: { error: unknown; count: number | null }) => unknown) {
              return finalize().then(onfulfilled);
            },
          };
          return chain;
        },
      };
    }
    throw new Error(`unexpected user-client from(${table})`);
  });

  return Promise.resolve({ auth: { getUser }, from: fromMock });
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin-Client Mock (nur fuer approve-Pfad: ai_jobs INSERT)
// ──────────────────────────────────────────────────────────────────────────────

interface AdminClientOpts {
  insertError?: { message: string } | null;
  inserts?: Array<{ table: string; row: Record<string, unknown> }>;
}

function buildAdminClient(opts: AdminClientOpts) {
  return {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
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
    },
  };
}

beforeEach(() => {
  mocks.revalidatePathMock.mockReset();
  mocks.userClientMock.mockReset();
  mocks.adminClientMock.mockReset();
});

describe("updateEmailClassifications", () => {
  describe("Auth-Gate", () => {
    it("rejects unauthenticated user", async () => {
      mocks.userClientMock.mockImplementation(() => buildUserClient({ user: null }));
      const result = await updateEmailClassifications(RUN_ID, [
        { message_id: MSG_ID_1, new_label: "content" },
      ]);
      expect(result).toEqual({ ok: false, error: "Nicht authentifiziert" });
    });

    it("rejects missing profile", async () => {
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({ profile: null, profileError: { message: "not found" } }),
      );
      const result = await updateEmailClassifications(RUN_ID, [
        { message_id: MSG_ID_1, new_label: "content" },
      ]);
      expect(result).toEqual({ ok: false, error: "Profil nicht gefunden" });
    });

    it("rejects employee role", async () => {
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({
          profile: { id: USER, tenant_id: TENANT, role: "employee" },
        }),
      );
      const result = await updateEmailClassifications(RUN_ID, [
        { message_id: MSG_ID_1, new_label: "content" },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/Tenant-Admins/);
    });

    it("rejects tenant_member role", async () => {
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({
          profile: { id: USER, tenant_id: TENANT, role: "tenant_member" },
        }),
      );
      const result = await updateEmailClassifications(RUN_ID, [
        { message_id: MSG_ID_1, new_label: "content" },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/Tenant-Admins/);
    });

    it("rejects tenant_admin without tenant_id", async () => {
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({
          profile: { id: USER, tenant_id: null, role: "tenant_admin" },
        }),
      );
      const result = await updateEmailClassifications(RUN_ID, [
        { message_id: MSG_ID_1, new_label: "content" },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/Kein Tenant/);
    });
  });

  describe("Input-Validation", () => {
    it("rejects invalid bulk_run_id UUID", async () => {
      mocks.userClientMock.mockImplementation(() => buildUserClient({}));
      const result = await updateEmailClassifications("not-uuid", [
        { message_id: MSG_ID_1, new_label: "content" },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/bulk_run_id/);
    });

    it("accepts empty array as no-op", async () => {
      mocks.userClientMock.mockImplementation(() => buildUserClient({}));
      const result = await updateEmailClassifications(RUN_ID, []);
      expect(result).toEqual({ ok: true, updatedCount: 0 });
    });

    it("rejects too many updates (> MAX_UPDATES_PER_CALL)", async () => {
      mocks.userClientMock.mockImplementation(() => buildUserClient({}));
      const updates = Array.from({ length: 501 }, () => ({
        message_id: MSG_ID_1,
        new_label: "content" as PreFilterLabel,
      }));
      const result = await updateEmailClassifications(RUN_ID, updates);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/Zu viele Updates/);
    });

    it("rejects invalid label", async () => {
      mocks.userClientMock.mockImplementation(() => buildUserClient({}));
      const result = await updateEmailClassifications(RUN_ID, [
        { message_id: MSG_ID_1, new_label: "not_a_label" as PreFilterLabel },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/Ungueltiger Update/);
    });

    it("rejects entry with empty message_id", async () => {
      mocks.userClientMock.mockImplementation(() => buildUserClient({}));
      const result = await updateEmailClassifications(RUN_ID, [
        { message_id: "", new_label: "content" },
      ]);
      expect(result.ok).toBe(false);
    });
  });

  describe("Happy Path", () => {
    it("performs single update + sets pre_filter_corrected=true + revalidates", async () => {
      const updateTracker: Array<{
        patch: Record<string, unknown>;
        eqChain: Record<string, unknown>;
      }> = [];
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({ updateTracker }),
      );
      const result = await updateEmailClassifications(RUN_ID, [
        { message_id: MSG_ID_1, new_label: "content" },
      ]);
      expect(result).toEqual({ ok: true, updatedCount: 1 });
      expect(updateTracker).toHaveLength(1);
      expect(updateTracker[0]?.patch).toEqual({
        pre_filter_label: "content",
        pre_filter_corrected: true,
      });
      expect(updateTracker[0]?.eqChain).toEqual({
        id: MSG_ID_1,
        bulk_run_id: RUN_ID,
      });
      expect(mocks.revalidatePathMock).toHaveBeenCalledWith(
        `/dashboard/bulk-email-import/${RUN_ID}/filter-review`,
      );
    });

    it("performs multi-update with summed count", async () => {
      const updateTracker: Array<{
        patch: Record<string, unknown>;
        eqChain: Record<string, unknown>;
      }> = [];
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({ updateTracker }),
      );
      const updates = [
        { message_id: MSG_ID_1, new_label: "content" as PreFilterLabel },
        { message_id: MSG_ID_2, new_label: "unclear" as PreFilterLabel },
      ];
      const result = await updateEmailClassifications(RUN_ID, updates);
      expect(result).toEqual({ ok: true, updatedCount: 2 });
      expect(updateTracker).toHaveLength(2);
    });
  });

  describe("Failure-Handling", () => {
    it("returns error on UPDATE failure + does not revalidate", async () => {
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({ updateError: { message: "constraint violation" } }),
      );
      const result = await updateEmailClassifications(RUN_ID, [
        { message_id: MSG_ID_1, new_label: "content" },
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error).toMatch(/UPDATE fehlgeschlagen/);
      expect(mocks.revalidatePathMock).not.toHaveBeenCalled();
    });
  });
});

describe("approvePreFilterAndStartThreadRedact", () => {
  describe("Auth-Gate", () => {
    it("rejects employee role", async () => {
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({
          profile: { id: USER, tenant_id: TENANT, role: "employee" },
        }),
      );
      const result = await approvePreFilterAndStartThreadRedact(RUN_ID);
      expect(result.ok).toBe(false);
    });
  });

  describe("Input-Validation", () => {
    it("rejects invalid UUID", async () => {
      mocks.userClientMock.mockImplementation(() => buildUserClient({}));
      const result = await approvePreFilterAndStartThreadRedact("xyz");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/bulk_run_id/);
    });
  });

  describe("Status-Pre-Check", () => {
    it("rejects when bulk_run not found", async () => {
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({ runRow: null }),
      );
      const result = await approvePreFilterAndStartThreadRedact(RUN_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/nicht gefunden/);
    });

    it("rejects status='parsed'", async () => {
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({ runRow: { id: RUN_ID, status: "parsed" } }),
      );
      const result = await approvePreFilterAndStartThreadRedact(RUN_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/'parsed'/);
    });

    it("rejects status='pre_filtering'", async () => {
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({ runRow: { id: RUN_ID, status: "pre_filtering" } }),
      );
      const result = await approvePreFilterAndStartThreadRedact(RUN_ID);
      expect(result.ok).toBe(false);
    });

    it("rejects status='thread_redacting' (already approved)", async () => {
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({ runRow: { id: RUN_ID, status: "thread_redacting" } }),
      );
      const result = await approvePreFilterAndStartThreadRedact(RUN_ID);
      expect(result.ok).toBe(false);
    });
  });

  describe("Happy Path", () => {
    it("inserts ai_jobs row + returns jobId + revalidates 2 paths", async () => {
      const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({ runRow: { id: RUN_ID, status: "pre_filtered" } }),
      );
      mocks.adminClientMock.mockImplementation(() =>
        buildAdminClient({ inserts }),
      );

      const result = await approvePreFilterAndStartThreadRedact(RUN_ID);

      expect(result).toEqual({ ok: true, jobId: JOB_ID });
      expect(inserts).toHaveLength(1);
      expect(inserts[0]?.table).toBe("ai_jobs");
      expect(inserts[0]?.row).toMatchObject({
        tenant_id: TENANT,
        job_type: "email_bulk_thread_redact",
        status: "pending",
        payload: { bulk_run_id: RUN_ID },
      });
      expect(mocks.revalidatePathMock).toHaveBeenCalledWith(
        `/dashboard/bulk-email-import/${RUN_ID}/filter-review`,
      );
      expect(mocks.revalidatePathMock).toHaveBeenCalledWith(
        `/dashboard/bulk-email-import/${RUN_ID}`,
      );
    });
  });

  describe("Failure-Handling", () => {
    it("returns error on INSERT-Failure + does not revalidate", async () => {
      mocks.userClientMock.mockImplementation(() =>
        buildUserClient({ runRow: { id: RUN_ID, status: "pre_filtered" } }),
      );
      mocks.adminClientMock.mockImplementation(() =>
        buildAdminClient({ insertError: { message: "fk violation" } }),
      );

      const result = await approvePreFilterAndStartThreadRedact(RUN_ID);
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error).toMatch(/Worker-Job-Enqueue/);
      expect(mocks.revalidatePathMock).not.toHaveBeenCalled();
    });
  });
});
