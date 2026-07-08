// V10.4 SLC-189 MT-4 — Pure-Mock-Tests fuer die Berater-Server-Actions.
//
// Auth-kritisch (SaaS-TDD): Gate-Enforcement + generateLink OHNE tenant_id +
// Zuweisungs-Contract. Reine Logik/Args gegen gemockten Admin-Client — keine DB
// (MIG-132 wird erst im /deploy live appliziert; DB-Contract folgt dann).

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  assertAdminMock,
  generateLinkMock,
  getUserByIdMock,
  deleteUserMock,
  profileSingleMock,
  ilikeMock,
  sendInviteMock,
  upsertMock,
  deleteThenValue,
  deleteEqSpy,
} = vi.hoisted(() => ({
  assertAdminMock: vi.fn(),
  generateLinkMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  deleteUserMock: vi.fn(),
  profileSingleMock: vi.fn(),
  ilikeMock: vi.fn(),
  sendInviteMock: vi.fn(),
  upsertMock: vi.fn(),
  deleteThenValue: { value: { error: null } as { error: unknown } },
  deleteEqSpy: vi.fn(),
}));

vi.mock("@/lib/workspace/admin-gate", () => ({
  assertStrategaizeAdmin: assertAdminMock,
}));

vi.mock("@/lib/email", () => ({
  sendInviteEmail: sendInviteMock,
}));

vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
  captureInfo: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        generateLink: generateLinkMock,
        getUserById: getUserByIdMock,
        deleteUser: deleteUserMock,
      },
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({ ilike: ilikeMock }),
        };
      }
      if (table === "berater_tenant_assignments") {
        // delete().eq().eq() -> thenable builder
        const builder: Record<string, unknown> = {
          eq: (...args: unknown[]) => {
            deleteEqSpy(...args);
            return builder;
          },
          then: (resolve: (v: unknown) => unknown) =>
            resolve(deleteThenValue.value),
        };
        return {
          upsert: upsertMock,
          delete: () => builder,
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

import { createBerater, assignBerater, unassignBerater } from "../actions";

const ADMIN = { id: "00000000-0000-0000-0000-000000000001" };
const BERATER_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  deleteThenValue.value = { error: null };
  // Defaults: kein existierendes Profile, Link ok, Mail ok, Upsert ok.
  ilikeMock.mockReturnValue({ single: async () => ({ data: null, error: null }) });
  generateLinkMock.mockResolvedValue({
    data: { properties: { hashed_token: "HT" } },
    error: null,
  });
  sendInviteMock.mockResolvedValue(undefined);
  upsertMock.mockResolvedValue({ error: null });
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.de";
});

describe("createBerater", () => {
  it("verweigert Nicht-Admin (unauthorized), ohne generateLink", async () => {
    assertAdminMock.mockResolvedValue(null);
    const res = await createBerater("neu@x.de");
    expect(res).toEqual({ ok: false, error: "unauthorized" });
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it("lehnt ungueltige E-Mail ab", async () => {
    assertAdminMock.mockResolvedValue(ADMIN);
    const res = await createBerater("keine-mail");
    expect(res).toEqual({ ok: false, error: "invalid_email" });
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it("legt Berater an: generateLink type=invite, role=strategaize_berater, KEIN tenant_id", async () => {
    assertAdminMock.mockResolvedValue(ADMIN);
    const res = await createBerater("Neu@X.de");
    expect(res).toEqual({ ok: true });

    expect(generateLinkMock).toHaveBeenCalledTimes(1);
    const arg = generateLinkMock.mock.calls[0][0];
    expect(arg.type).toBe("invite");
    expect(arg.email).toBe("neu@x.de"); // normalisiert lowercase
    expect(arg.options.data).toEqual({ role: "strategaize_berater" });
    expect(arg.options.data).not.toHaveProperty("tenant_id");

    expect(sendInviteMock).toHaveBeenCalledTimes(1);
    const mailArg = sendInviteMock.mock.calls[0][0];
    expect(mailArg.to).toBe("neu@x.de");
    expect(mailArg.verifyUrl).toContain("token_hash=HT");
    expect(mailArg.verifyUrl).toContain("type=invite");
  });

  it("blockt bereits bestaetigten User (email_exists)", async () => {
    assertAdminMock.mockResolvedValue(ADMIN);
    ilikeMock.mockReturnValue({
      single: async () => ({ data: { id: "ex-1", role: "strategaize_berater" }, error: null }),
    });
    getUserByIdMock.mockResolvedValue({
      data: { user: { email_confirmed_at: "2026-01-01T00:00:00Z" } },
    });
    const res = await createBerater("dup@x.de");
    expect(res).toEqual({ ok: false, error: "email_exists" });
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it("re-invited unbestaetigten User (deleteUser + generateLink)", async () => {
    assertAdminMock.mockResolvedValue(ADMIN);
    ilikeMock.mockReturnValue({
      single: async () => ({ data: { id: "ex-2", role: "strategaize_berater" }, error: null }),
    });
    getUserByIdMock.mockResolvedValue({ data: { user: { email_confirmed_at: null } } });
    const res = await createBerater("pending@x.de");
    expect(res).toEqual({ ok: true });
    expect(deleteUserMock).toHaveBeenCalledWith("ex-2");
    expect(generateLinkMock).toHaveBeenCalledTimes(1);
  });

  it("meldet emailFailed=true bei SMTP-Fehler (User bleibt angelegt)", async () => {
    assertAdminMock.mockResolvedValue(ADMIN);
    sendInviteMock.mockRejectedValue(new Error("smtp down"));
    const res = await createBerater("neu@x.de");
    expect(res).toEqual({ ok: true, emailFailed: true });
  });
});

describe("assignBerater", () => {
  it("verweigert Nicht-Admin", async () => {
    assertAdminMock.mockResolvedValue(null);
    const res = await assignBerater(BERATER_ID, TENANT_ID);
    expect(res).toEqual({ ok: false, error: "unauthorized" });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("lehnt ungueltige IDs ab", async () => {
    assertAdminMock.mockResolvedValue(ADMIN);
    expect(await assignBerater("nope", TENANT_ID)).toEqual({
      ok: false,
      error: "invalid_berater_id",
    });
    expect(await assignBerater(BERATER_ID, "nope")).toEqual({
      ok: false,
      error: "invalid_tenant_id",
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("upsert mit assigned_by + idempotent onConflict", async () => {
    assertAdminMock.mockResolvedValue(ADMIN);
    const res = await assignBerater(BERATER_ID, TENANT_ID);
    expect(res).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [row, opts] = upsertMock.mock.calls[0];
    expect(row).toEqual({
      berater_user_id: BERATER_ID,
      tenant_id: TENANT_ID,
      assigned_by: ADMIN.id,
    });
    expect(opts).toEqual(
      expect.objectContaining({
        onConflict: "berater_user_id,tenant_id",
        ignoreDuplicates: true,
      }),
    );
  });

  it("meldet assign_failed bei DB-Fehler", async () => {
    assertAdminMock.mockResolvedValue(ADMIN);
    upsertMock.mockResolvedValue({ error: { message: "boom" } });
    const res = await assignBerater(BERATER_ID, TENANT_ID);
    expect(res).toEqual({ ok: false, error: "assign_failed" });
  });
});

describe("unassignBerater", () => {
  it("verweigert Nicht-Admin", async () => {
    assertAdminMock.mockResolvedValue(null);
    const res = await unassignBerater(BERATER_ID, TENANT_ID);
    expect(res).toEqual({ ok: false, error: "unauthorized" });
    expect(deleteEqSpy).not.toHaveBeenCalled();
  });

  it("loescht per berater_user_id + tenant_id", async () => {
    assertAdminMock.mockResolvedValue(ADMIN);
    const res = await unassignBerater(BERATER_ID, TENANT_ID);
    expect(res).toEqual({ ok: true });
    expect(deleteEqSpy).toHaveBeenCalledWith("berater_user_id", BERATER_ID);
    expect(deleteEqSpy).toHaveBeenCalledWith("tenant_id", TENANT_ID);
  });

  it("meldet unassign_failed bei DB-Fehler", async () => {
    assertAdminMock.mockResolvedValue(ADMIN);
    deleteThenValue.value = { error: { message: "boom" } };
    const res = await unassignBerater(BERATER_ID, TENANT_ID);
    expect(res).toEqual({ ok: false, error: "unassign_failed" });
  });
});
