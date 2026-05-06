import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks: server-only Supabase clients are replaced before the action is
// imported so we can simulate auth, RLS-bound queries, signed-URL creation and
// service-role writes without any network calls.
const getUserMock = vi.fn();
const userFromMock = vi.fn();
const adminFromMock = vi.fn();
const createSignedUploadUrlMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => getUserMock() },
    from: userFromMock,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: adminFromMock,
    storage: {
      from: () => ({
        createSignedUploadUrl: createSignedUploadUrlMock,
      }),
    },
  }),
}));

import {
  requestWalkthroughUpload,
  confirmWalkthroughUploaded,
} from "../walkthrough";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CAPTURE_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const WALK_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";

type TableHandler = () => unknown;

/**
 * Build a from(table) router that returns the configured chainable per table.
 * The handler receives no args; build chainables yourself per test.
 */
function makeFromRouter(handlers: Record<string, TableHandler>) {
  return vi.fn((table: string) => {
    const h = handlers[table];
    if (!h) {
      throw new Error(`unmocked from(${table})`);
    }
    return h();
  });
}

beforeEach(() => {
  getUserMock.mockReset();
  userFromMock.mockReset();
  adminFromMock.mockReset();
  createSignedUploadUrlMock.mockReset();
  revalidatePathMock.mockReset();
});

// ============================================================
// requestWalkthroughUpload
// ============================================================

describe("requestWalkthroughUpload", () => {
  it("creates walkthrough_session and returns signed upload URL on happy path", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });

    // profiles row (anon-key client)
    const profilesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({
          data: { tenant_id: TENANT_A, role: "employee" },
          error: null,
        }),
    };
    // capture_session ownership check
    const captureChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({
          data: { tenant_id: TENANT_A },
          error: null,
        }),
    };
    // walkthrough_session INSERT (RLS-bound via anon-key)
    const insertSelect = {
      single: vi
        .fn()
        .mockResolvedValue({ data: { id: WALK_ID }, error: null }),
    };
    const insertReturn = { select: vi.fn().mockReturnValue(insertSelect) };
    const walkthroughChain = {
      insert: vi.fn().mockReturnValue(insertReturn),
    };

    userFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return profilesChain;
      if (table === "capture_session") return captureChain;
      if (table === "walkthrough_session") return walkthroughChain;
      throw new Error(`unmocked from(${table})`);
    });

    createSignedUploadUrlMock.mockResolvedValue({
      data: {
        signedUrl: "https://storage.example/upload/abc",
        path: `${TENANT_A}/${WALK_ID}/recording.webm`,
        token: "xyz",
      },
      error: null,
    });

    const result = await requestWalkthroughUpload({
      captureSessionId: CAPTURE_A,
      estimatedDurationSec: 600,
    });

    expect(result.walkthroughSessionId).toBe(WALK_ID);
    expect(result.uploadUrl).toBe("https://storage.example/upload/abc");
    expect(result.storagePath).toBe(`${TENANT_A}/${WALK_ID}/recording.webm`);

    // INSERT must include tenant + capture_session + recorded_by + status
    expect(walkthroughChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_A,
        capture_session_id: CAPTURE_A,
        recorded_by_user_id: USER_A,
        status: "recording",
      })
    );
    expect(createSignedUploadUrlMock).toHaveBeenCalledWith(
      `${TENANT_A}/${WALK_ID}/recording.webm`,
      expect.objectContaining({ upsert: false })
    );
  });

  it("throws when estimatedDurationSec exceeds 30min hard cap", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });

    await expect(
      requestWalkthroughUpload({
        captureSessionId: CAPTURE_A,
        estimatedDurationSec: 1801,
      })
    ).rejects.toThrow(/1800|30\s*min/i);

    // Fast-fail: must not touch DB
    expect(userFromMock).not.toHaveBeenCalled();
    expect(createSignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it("throws when captureSessionId belongs to a different tenant", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });

    const profilesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({
          data: { tenant_id: TENANT_A, role: "employee" },
          error: null,
        }),
    };
    // capture_session lookup — RLS hides the row entirely (data: null)
    const captureChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const insertSpy = vi.fn();
    const walkthroughChain = { insert: insertSpy };

    userFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return profilesChain;
      if (table === "capture_session") return captureChain;
      if (table === "walkthrough_session") return walkthroughChain;
      throw new Error(`unmocked from(${table})`);
    });

    await expect(
      requestWalkthroughUpload({
        captureSessionId: CAPTURE_A,
        estimatedDurationSec: 300,
      })
    ).rejects.toThrow(/capture[_ ]?session|tenant|nicht.+gefunden/i);

    expect(insertSpy).not.toHaveBeenCalled();
    expect(createSignedUploadUrlMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// confirmWalkthroughUploaded
// ============================================================

describe("confirmWalkthroughUploaded", () => {
  it("updates walkthrough_session and queues ai_jobs on happy path", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });

    // user-side: load walkthrough_session for ownership/status check
    const loadChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: WALK_ID,
          tenant_id: TENANT_A,
          recorded_by_user_id: USER_A,
          status: "recording",
        },
        error: null,
      }),
    };
    userFromMock.mockImplementation((table: string) => {
      if (table === "walkthrough_session") return loadChain;
      throw new Error(`unmocked user from(${table})`);
    });

    // admin-side: UPDATE walkthrough_session via service_role + INSERT ai_jobs
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const updateChain = { update: vi.fn().mockReturnValue({ eq: updateEq }) };
    const aiInsert = vi.fn().mockResolvedValue({ error: null });
    const aiChain = { insert: aiInsert };

    adminFromMock.mockImplementation((table: string) => {
      if (table === "walkthrough_session") return updateChain;
      if (table === "ai_jobs") return aiChain;
      throw new Error(`unmocked admin from(${table})`);
    });

    const result = await confirmWalkthroughUploaded({
      walkthroughSessionId: WALK_ID,
      durationSec: 720,
      fileSizeBytes: 12_345_678,
    });

    expect(result).toEqual({ ok: true });
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "uploaded",
        duration_sec: 720,
        file_size_bytes: 12_345_678,
        storage_path: `${TENANT_A}/${WALK_ID}/recording.webm`,
      })
    );
    expect(updateEq).toHaveBeenCalledWith("id", WALK_ID);
    expect(aiInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_A,
        job_type: "walkthrough_transcribe",
        status: "pending",
        payload: expect.objectContaining({ walkthroughSessionId: WALK_ID }),
      })
    );
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("throws when the caller did not record this session (Self-Confirm-Only)", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_B } },
      error: null,
    });

    const loadChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: WALK_ID,
          tenant_id: TENANT_A,
          recorded_by_user_id: USER_A,
          status: "recording",
        },
        error: null,
      }),
    };
    userFromMock.mockImplementation((table: string) => {
      if (table === "walkthrough_session") return loadChain;
      throw new Error(`unmocked user from(${table})`);
    });

    await expect(
      confirmWalkthroughUploaded({
        walkthroughSessionId: WALK_ID,
        durationSec: 100,
        fileSizeBytes: 1000,
      })
    ).rejects.toThrow(/self|recorded_by|nicht erlaubt|not allowed/i);

    expect(adminFromMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("throws when status is not in ('recording','uploading')", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });

    const loadChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: WALK_ID,
          tenant_id: TENANT_A,
          recorded_by_user_id: USER_A,
          status: "uploaded",
        },
        error: null,
      }),
    };
    userFromMock.mockImplementation((table: string) => {
      if (table === "walkthrough_session") return loadChain;
      throw new Error(`unmocked user from(${table})`);
    });

    await expect(
      confirmWalkthroughUploaded({
        walkthroughSessionId: WALK_ID,
        durationSec: 100,
        fileSizeBytes: 1000,
      })
    ).rejects.toThrow(/status|recording|uploading/i);

    expect(adminFromMock).not.toHaveBeenCalled();
  });
});

// suppress unused-helper warning from strict tsconfig — kept exported for
// future tests that benefit from the table-router.
void makeFromRouter;
