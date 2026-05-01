import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must be hoisted: the test imports the action under test, which itself
// imports server-only client + logger. We replace those before the action is
// imported to keep the unit test deterministic and free of network calls.
const getUserMock = vi.fn();
const updateMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePathMock(path),
}));
vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
  captureWarning: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => getUserMock() },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromMock }),
}));

import { toggleRemindersOptOut } from "../actions";

beforeEach(() => {
  getUserMock.mockReset();
  updateMock.mockReset();
  eqMock.mockReset();
  fromMock.mockReset();
  revalidatePathMock.mockReset();

  // Default chain: from(table).update(payload).eq("user_id", id) -> { error: null }
  eqMock.mockResolvedValue({ error: null });
  updateMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ update: updateMock });
});

describe("toggleRemindersOptOut", () => {
  it("returns ok and persists the new value via service-role + own-user filter", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const result = await toggleRemindersOptOut(true);

    expect(result).toEqual({ ok: true });
    expect(fromMock).toHaveBeenCalledWith("user_settings");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ reminders_opt_out: true })
    );
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/settings");
  });

  it("turns the toggle off when value is false", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-2" } },
      error: null,
    });

    await toggleRemindersOptOut(false);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ reminders_opt_out: false })
    );
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-2");
  });

  it("rejects when the request is unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const result = await toggleRemindersOptOut(true);

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(fromMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns db_update_failed when supabase reports an error", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-3" } },
      error: null,
    });
    eqMock.mockResolvedValueOnce({ error: { message: "boom" } });

    const result = await toggleRemindersOptOut(true);

    expect(result).toEqual({ ok: false, error: "db_update_failed" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
