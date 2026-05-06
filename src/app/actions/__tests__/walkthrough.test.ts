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
  confirmWalkthroughUploaded,
  requestWalkthroughUpload,
  startWalkthroughSession,
} from "../walkthrough";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CAPTURE_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const WALK_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const TEMPLATE_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

beforeEach(() => {
  getUserMock.mockReset();
  userFromMock.mockReset();
  adminFromMock.mockReset();
  createSignedUploadUrlMock.mockReset();
  revalidatePathMock.mockReset();
});

// ============================================================
// startWalkthroughSession (SLC-075 MT-1 Self-Spawn)
// ============================================================

describe("startWalkthroughSession", () => {
  it("creates capture_session + walkthrough_session via service_role on happy path", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });

    const profilesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { tenant_id: TENANT_A, role: "employee" },
        error: null,
      }),
    };
    userFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return profilesChain;
      throw new Error(`unmocked user from(${table})`);
    });

    const templateChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: TEMPLATE_ID, version: "1.0.0" },
        error: null,
      }),
    };

    const captureInsertSelect = {
      single: vi
        .fn()
        .mockResolvedValue({ data: { id: CAPTURE_A }, error: null }),
    };
    const captureInsertReturn = {
      select: vi.fn().mockReturnValue(captureInsertSelect),
    };
    const captureChain = {
      insert: vi.fn().mockReturnValue(captureInsertReturn),
    };

    const walkInsertSelect = {
      single: vi
        .fn()
        .mockResolvedValue({ data: { id: WALK_ID }, error: null }),
    };
    const walkInsertReturn = {
      select: vi.fn().mockReturnValue(walkInsertSelect),
    };
    const walkChain = { insert: vi.fn().mockReturnValue(walkInsertReturn) };

    adminFromMock.mockImplementation((table: string) => {
      if (table === "template") return templateChain;
      if (table === "capture_session") return captureChain;
      if (table === "walkthrough_session") return walkChain;
      throw new Error(`unmocked admin from(${table})`);
    });

    const result = await startWalkthroughSession();

    expect(result.walkthroughSessionId).toBe(WALK_ID);
    expect(result.captureSessionId).toBe(CAPTURE_A);

    expect(captureChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_A,
        template_id: TEMPLATE_ID,
        template_version: "1.0.0",
        owner_user_id: USER_A,
        capture_mode: "walkthrough",
        status: "open",
      })
    );
    expect(walkChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_A,
        capture_session_id: CAPTURE_A,
        recorded_by_user_id: USER_A,
        status: "recording",
      })
    );
  });

  it("rejects strategaize_admin (review-only role)", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });

    const profilesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { tenant_id: null, role: "strategaize_admin" },
        error: null,
      }),
    };
    userFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return profilesChain;
      throw new Error(`unmocked user from(${table})`);
    });

    await expect(startWalkthroughSession()).rejects.toThrow(/berechtigt/i);

    // Must not touch templates or capture_session if role check rejects.
    expect(adminFromMock).not.toHaveBeenCalled();
  });

  it("rolls back capture_session when walkthrough_session INSERT fails", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });

    const profilesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { tenant_id: TENANT_A, role: "tenant_member" },
        error: null,
      }),
    };
    userFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return profilesChain;
      throw new Error(`unmocked user from(${table})`);
    });

    const templateChain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: TEMPLATE_ID, version: "1.0.0" },
        error: null,
      }),
    };

    const captureInsertSelect = {
      single: vi
        .fn()
        .mockResolvedValue({ data: { id: CAPTURE_A }, error: null }),
    };
    const captureInsertReturn = {
      select: vi.fn().mockReturnValue(captureInsertSelect),
    };
    const captureDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const captureDeleteReturn = {
      eq: captureDeleteEq,
    };
    const captureChain = {
      insert: vi.fn().mockReturnValue(captureInsertReturn),
      delete: vi.fn().mockReturnValue(captureDeleteReturn),
    };

    const walkInsertSelect = {
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "RLS denied" },
      }),
    };
    const walkInsertReturn = {
      select: vi.fn().mockReturnValue(walkInsertSelect),
    };
    const walkChain = { insert: vi.fn().mockReturnValue(walkInsertReturn) };

    adminFromMock.mockImplementation((table: string) => {
      if (table === "template") return templateChain;
      if (table === "capture_session") return captureChain;
      if (table === "walkthrough_session") return walkChain;
      throw new Error(`unmocked admin from(${table})`);
    });

    await expect(startWalkthroughSession()).rejects.toThrow(
      /walkthrough_session INSERT fehlgeschlagen/
    );

    expect(captureChain.delete).toHaveBeenCalled();
    expect(captureDeleteEq).toHaveBeenCalledWith("id", CAPTURE_A);
  });
});

// ============================================================
// requestWalkthroughUpload (SLC-075 MT-1 Refactor — walkthroughSessionId-based)
// ============================================================

describe("requestWalkthroughUpload", () => {
  it("returns signed upload URL for own walkthrough_session in 'recording' state", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });

    const sessionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
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
      if (table === "walkthrough_session") return sessionChain;
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
      walkthroughSessionId: WALK_ID,
      estimatedDurationSec: 600,
    });

    expect(result.walkthroughSessionId).toBe(WALK_ID);
    expect(result.uploadUrl).toBe("https://storage.example/upload/abc");
    expect(result.storagePath).toBe(`${TENANT_A}/${WALK_ID}/recording.webm`);

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
        walkthroughSessionId: WALK_ID,
        estimatedDurationSec: 1801,
      })
    ).rejects.toThrow(/1800|30\s*min/i);

    expect(userFromMock).not.toHaveBeenCalled();
    expect(createSignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it("throws when caller did not record this session (Self-Only)", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_B } },
      error: null,
    });

    const sessionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
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
      if (table === "walkthrough_session") return sessionChain;
      throw new Error(`unmocked from(${table})`);
    });

    await expect(
      requestWalkthroughUpload({
        walkthroughSessionId: WALK_ID,
        estimatedDurationSec: 300,
      })
    ).rejects.toThrow(/Aufnehmer|recorded_by/i);

    expect(createSignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it("throws when session status is not 'recording'", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });

    const sessionChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
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
      if (table === "walkthrough_session") return sessionChain;
      throw new Error(`unmocked from(${table})`);
    });

    await expect(
      requestWalkthroughUpload({
        walkthroughSessionId: WALK_ID,
        estimatedDurationSec: 300,
      })
    ).rejects.toThrow(/status.*recording/);

    expect(createSignedUploadUrlMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// confirmWalkthroughUploaded — unchanged behavior, kept for regression coverage
// ============================================================

describe("confirmWalkthroughUploaded", () => {
  it("updates walkthrough_session and queues ai_jobs on happy path", async () => {
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
          status: "recording",
        },
        error: null,
      }),
    };
    userFromMock.mockImplementation((table: string) => {
      if (table === "walkthrough_session") return loadChain;
      throw new Error(`unmocked user from(${table})`);
    });

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
