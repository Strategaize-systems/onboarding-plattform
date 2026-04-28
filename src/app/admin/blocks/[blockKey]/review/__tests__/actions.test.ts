// SLC-041 MT-3 — Tests fuer approveBlockReview / rejectBlockReview Server-Actions.
//
// Strategie: createClient() wird gemockt (next/headers cookies sind im Test-Kontext nicht
// verfuegbar). Tests pruefen:
//   - Input-Validation (UUIDs, Block-Key, Note-Length)
//   - strategaize_admin-only Guard (Negativ-Test mit tenant_admin)
//   - Upsert-Aufruf mit korrekten Audit-Feldern (status, reviewed_by, reviewed_at, note)

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock revalidatePath — next/cache braucht keinen echten Cache.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  captureException: vi.fn(),
}));

const upsertMock = vi.fn();
const fromMock = vi.fn(() => ({ upsert: upsertMock }));
const profileEqMock = vi.fn();
const profileSelectMock = vi.fn(() => ({
  eq: vi.fn(() => ({ single: profileEqMock })),
}));
const fromProfilesMock = vi.fn(() => ({ select: profileSelectMock }));
const getUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn((table: string) => {
      if (table === "profiles") return fromProfilesMock();
      return fromMock();
    }),
  })),
}));

import { approveBlockReview, rejectBlockReview } from "../actions";

const VALID_TENANT = "11111111-1111-1111-1111-111111111111";
const VALID_SESSION = "22222222-2222-2222-2222-222222222222";
const ADMIN_USER = { id: "33333333-3333-3333-3333-333333333333" };

beforeEach(() => {
  vi.clearAllMocks();
  upsertMock.mockResolvedValue({ error: null });
  getUserMock.mockResolvedValue({ data: { user: ADMIN_USER } });
  profileEqMock.mockResolvedValue({ data: { role: "strategaize_admin" } });
});

describe("approveBlockReview — Input Validation (AC-9, AC-10)", () => {
  it("lehnt invalide tenant_id ab", async () => {
    const result = await approveBlockReview({
      tenantId: "not-a-uuid",
      sessionId: VALID_SESSION,
      blockKey: "A",
    });
    expect(result).toEqual({ ok: false, error: "tenant_id_invalid" });
  });

  it("lehnt invalide session_id ab", async () => {
    const result = await approveBlockReview({
      tenantId: VALID_TENANT,
      sessionId: "not-uuid",
      blockKey: "A",
    });
    expect(result).toEqual({ ok: false, error: "session_id_invalid" });
  });

  it("lehnt leeren block_key ab", async () => {
    const result = await approveBlockReview({
      tenantId: VALID_TENANT,
      sessionId: VALID_SESSION,
      blockKey: "",
    });
    expect(result).toEqual({ ok: false, error: "block_key_invalid" });
  });

  it("lehnt zu lange Note ab (>2000 Zeichen)", async () => {
    const result = await approveBlockReview({
      tenantId: VALID_TENANT,
      sessionId: VALID_SESSION,
      blockKey: "A",
      note: "x".repeat(2001),
    });
    expect(result).toEqual({ ok: false, error: "note_too_long" });
  });
});

describe("approveBlockReview — Auth Guard (AC-9)", () => {
  it("lehnt unauthenticated ab", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await approveBlockReview({
      tenantId: VALID_TENANT,
      sessionId: VALID_SESSION,
      blockKey: "A",
    });
    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("lehnt tenant_admin ab (nur strategaize_admin darf approven)", async () => {
    profileEqMock.mockResolvedValue({ data: { role: "tenant_admin" } });
    const result = await approveBlockReview({
      tenantId: VALID_TENANT,
      sessionId: VALID_SESSION,
      blockKey: "A",
    });
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("lehnt tenant_member ab", async () => {
    profileEqMock.mockResolvedValue({ data: { role: "tenant_member" } });
    const result = await approveBlockReview({
      tenantId: VALID_TENANT,
      sessionId: VALID_SESSION,
      blockKey: "A",
    });
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("approveBlockReview — Upsert mit Audit-Feldern (AC-10)", () => {
  it("setzt reviewed_by + reviewed_at + status='approved' im Upsert", async () => {
    const result = await approveBlockReview({
      tenantId: VALID_TENANT,
      sessionId: VALID_SESSION,
      blockKey: "A",
      note: "Looks good",
    });
    expect(result).toEqual({ ok: true });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [payload, opts] = upsertMock.mock.calls[0];
    expect(payload).toMatchObject({
      tenant_id: VALID_TENANT,
      capture_session_id: VALID_SESSION,
      block_key: "A",
      status: "approved",
      reviewed_by: ADMIN_USER.id,
      note: "Looks good",
    });
    expect(typeof payload.reviewed_at).toBe("string");
    expect(opts).toEqual({
      onConflict: "tenant_id,capture_session_id,block_key",
    });
  });

  it("note ist optional und wird als null gespeichert wenn nicht angegeben", async () => {
    await approveBlockReview({
      tenantId: VALID_TENANT,
      sessionId: VALID_SESSION,
      blockKey: "A",
    });
    expect(upsertMock.mock.calls[0][0].note).toBeNull();
  });

  it("returnt upsert_failed wenn DB-Aufruf fehlschlaegt", async () => {
    upsertMock.mockResolvedValue({ error: { message: "constraint violated" } });
    const result = await approveBlockReview({
      tenantId: VALID_TENANT,
      sessionId: VALID_SESSION,
      blockKey: "A",
    });
    expect(result).toEqual({ ok: false, error: "upsert_failed" });
  });
});

describe("rejectBlockReview", () => {
  it("setzt status='rejected' im Upsert", async () => {
    const result = await rejectBlockReview({
      tenantId: VALID_TENANT,
      sessionId: VALID_SESSION,
      blockKey: "B",
      note: "Inhalt unklar",
    });
    expect(result).toEqual({ ok: true });
    expect(upsertMock.mock.calls[0][0].status).toBe("rejected");
    expect(upsertMock.mock.calls[0][0].note).toBe("Inhalt unklar");
  });

  it("haelt sich an dieselbe Auth-Guard wie approve (nur strategaize_admin)", async () => {
    profileEqMock.mockResolvedValue({ data: { role: "tenant_admin" } });
    const result = await rejectBlockReview({
      tenantId: VALID_TENANT,
      sessionId: VALID_SESSION,
      blockKey: "B",
    });
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });
});
