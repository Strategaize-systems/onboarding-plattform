// V10.4 SLC-188 (FEAT-105) MT-4 — assertStrategaizeBerater Gate-Test.
// Auth-kritisch (SaaS-TDD): Gate liefert User NUR bei role === 'strategaize_berater'.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserMock, fromMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}));

import { assertStrategaizeBerater } from "./berater-gate";

function mockProfile(role: string | null) {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: async () => ({
          data: role === null ? null : { role },
          error: null,
        }),
      }),
    }),
  });
}

const USER = { id: "u-berater", email: "b@x.de" };

describe("assertStrategaizeBerater", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
  });

  it("liefert User bei role=strategaize_berater", async () => {
    getUserMock.mockResolvedValue({ data: { user: USER } });
    mockProfile("strategaize_berater");
    await expect(assertStrategaizeBerater()).resolves.toEqual(USER);
  });

  it("liefert null bei role=strategaize_admin (falsche Rolle)", async () => {
    getUserMock.mockResolvedValue({ data: { user: USER } });
    mockProfile("strategaize_admin");
    await expect(assertStrategaizeBerater()).resolves.toBeNull();
  });

  it("liefert null bei role=tenant_admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: USER } });
    mockProfile("tenant_admin");
    await expect(assertStrategaizeBerater()).resolves.toBeNull();
  });

  it("liefert null wenn nicht eingeloggt", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await expect(assertStrategaizeBerater()).resolves.toBeNull();
  });

  it("liefert null wenn Profile fehlt", async () => {
    getUserMock.mockResolvedValue({ data: { user: USER } });
    mockProfile(null);
    await expect(assertStrategaizeBerater()).resolves.toBeNull();
  });
});
