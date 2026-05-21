// V7.1 SLC-136 MT-3 — Server-Action Vitest fuer saveTextOverride + resetTextOverride.
//
// Test-Strategy: Strategaize-Standard-Mock-Set (next/cache + @/lib/supabase/server)
// gemaess [[feedback-nextjs-server-action-test-mocks]] (IS SLC-202 IMP-629).
// Chain-Mocks pro Test inline gebaut weil unterschiedliche Pfade (existing-Read
// vs Insert vs Update vs Delete vs History-Insert vs Profile-Read) verschiedene
// Chain-Endpunkte haben.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Hoisted Mocks — MUSS vor `import { saveTextOverride, ... }` stehen
// ============================================================

const revalidatePathMock = vi.fn();
const resetOverrideCacheMock = vi.fn();
const getUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (path: string, scope?: "page" | "layout") =>
    revalidatePathMock(path, scope),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => getUserMock() },
    from: (table: string) => fromMock(table),
  }),
}));

// Cache-Reset-Mock — V7.1 SLC-137 /qa Auto-Fix (F-4): actions rufen jetzt
// resetOverrideCache() statt invalidateOverrideCache(scope_id, locale).
vi.mock("../resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../resolver")>();
  return {
    ...actual,
    resetOverrideCache: () => resetOverrideCacheMock(),
  };
});

import { saveTextOverride, resetTextOverride } from "../actions";

// ============================================================
// Helpers — Chain-Builder fuer wiederkehrende Patterns
// ============================================================

/**
 * Baut den from()-Mock so dass nacheinander zwei Tabellen-Aufrufe abgehandelt
 * werden: zuerst `profiles` (Auth-Check), dann `text_override` (Existing-Read /
 * Insert / Update / Delete) und ggf. `text_override_history`.
 *
 * Akzeptiert pro Tabelle einen Chain-Builder. Wenn ein Builder nicht gesetzt
 * ist, wird ein Fallback verwendet der NICHT erwarteter Aufrufe via expect.fail
 * fangen wuerde.
 */
type ChainBuilder = () => Record<string, (...args: unknown[]) => unknown>;

function setupFromMock(builders: {
  profiles?: ChainBuilder;
  text_override?: ChainBuilder;
  text_override_history?: ChainBuilder;
}): void {
  fromMock.mockImplementation((table: string) => {
    const builder = builders[table as keyof typeof builders];
    if (!builder) {
      throw new Error(`unexpected from(${table}) call`);
    }
    return builder();
  });
}

function profileFound(role: string, tenantId: string | null = "tenant-1"): ChainBuilder {
  return () => ({
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({ data: { role, tenant_id: tenantId }, error: null }),
      }),
    }),
  });
}

// ============================================================
// Auth-Setup-Helper
// ============================================================

function setUser(userId: string | null) {
  getUserMock.mockResolvedValue({ data: { user: userId ? { id: userId } : null } });
}

// ============================================================
// beforeEach
// ============================================================

beforeEach(() => {
  revalidatePathMock.mockReset();
  resetOverrideCacheMock.mockReset();
  getUserMock.mockReset();
  fromMock.mockReset();
});

// ============================================================
// Validation (vor Auth — keine DB-Touches noetig)
// ============================================================

describe("saveTextOverride validation", () => {
  it("rejects invalid scope", async () => {
    const result = await saveTextOverride({
      scope: "garbage" as never,
      scopeId: null,
      textKey: "k",
      newValue: "v",
    });
    expect(result).toEqual({ ok: false, error: "invalid_scope" });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("rejects scope='global' with scope_id set", async () => {
    const result = await saveTextOverride({
      scope: "global",
      scopeId: "tmpl-1",
      textKey: "k",
      newValue: "v",
    });
    expect(result).toEqual({ ok: false, error: "scope_id_must_be_null_for_global" });
  });

  it("rejects scope='partner' without scope_id", async () => {
    const result = await saveTextOverride({
      scope: "partner",
      scopeId: null,
      textKey: "k",
      newValue: "v",
    });
    expect(result).toEqual({
      ok: false,
      error: "scope_id_required_for_template_or_partner",
    });
  });

  it("rejects invalid text_key (uppercase)", async () => {
    const result = await saveTextOverride({
      scope: "global",
      scopeId: null,
      textKey: "BadKey",
      newValue: "v",
    });
    expect(result).toEqual({ ok: false, error: "invalid_text_key" });
  });

  it("rejects text_value > 8000 chars", async () => {
    const result = await saveTextOverride({
      scope: "global",
      scopeId: null,
      textKey: "k",
      newValue: "x".repeat(8001),
    });
    expect(result).toEqual({ ok: false, error: "value_too_long" });
  });
});

// ============================================================
// Auth-Check
// ============================================================

describe("saveTextOverride auth", () => {
  it("rejects unauthenticated requests", async () => {
    setUser(null);
    const result = await saveTextOverride({
      scope: "global",
      scopeId: null,
      textKey: "k",
      newValue: "v",
    });
    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("rejects role tenant_member as forbidden", async () => {
    setUser("u-1");
    setupFromMock({ profiles: profileFound("tenant_member") });
    const result = await saveTextOverride({
      scope: "global",
      scopeId: null,
      textKey: "k",
      newValue: "v",
    });
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("accepts role strategaize_admin", async () => {
    setUser("u-1");
    setupFromMock({
      profiles: profileFound("strategaize_admin"),
      text_override: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({ data: { id: "ovr-1" }, error: null }),
          }),
        }),
      }),
      text_override_history: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
    });
    const result = await saveTextOverride({
      scope: "global",
      scopeId: null,
      textKey: "header.title",
      newValue: "New Title",
    });
    expect(result).toEqual({ ok: true, data: { created: true } });
  });
});

// ============================================================
// saveTextOverride happy paths
// ============================================================

describe("saveTextOverride create", () => {
  beforeEach(() => setUser("u-admin"));

  it("creates new override + history (action=create) + invalidates cache + revalidates paths", async () => {
    const insertHistorySpy = vi.fn().mockResolvedValue({ error: null });
    setupFromMock({
      profiles: profileFound("strategaize_admin"),
      text_override: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({ data: { id: "ovr-new" }, error: null }),
          }),
        }),
      }),
      text_override_history: () => ({ insert: insertHistorySpy }),
    });

    const result = await saveTextOverride({
      scope: "global",
      scopeId: null,
      textKey: "cta.button",
      newValue: "Jetzt starten",
    });

    expect(result).toEqual({ ok: true, data: { created: true } });
    expect(insertHistorySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        text_override_id: "ovr-new",
        scope: "global",
        scope_id: null,
        text_key: "cta.button",
        old_value: null,
        new_value: "Jetzt starten",
        editor_id: "u-admin",
        editor_role: "strategaize_admin",
        action: "create",
      }),
    );
    expect(resetOverrideCacheMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalled();
  });
});

describe("saveTextOverride update", () => {
  beforeEach(() => setUser("u-partner"));

  it("updates existing override + history (action=update, old_value captured)", async () => {
    const updateSpy = vi.fn(() => ({
      eq: () => ({
        select: () => ({
          single: () =>
            Promise.resolve({ data: { id: "ovr-existing" }, error: null }),
        }),
      }),
    }));
    const insertHistorySpy = vi.fn().mockResolvedValue({ error: null });

    setupFromMock({
      profiles: profileFound("partner_admin"),
      text_override: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: "ovr-existing", text_value: "OldText" },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        }),
        update: updateSpy,
      }),
      text_override_history: () => ({ insert: insertHistorySpy }),
    });

    const result = await saveTextOverride({
      scope: "partner",
      scopeId: "part-1",
      textKey: "footer.legal",
      newValue: "NewText",
    });

    expect(result).toEqual({ ok: true, data: { created: false } });
    expect(updateSpy).toHaveBeenCalled();
    expect(insertHistorySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        text_override_id: "ovr-existing",
        scope: "partner",
        scope_id: "part-1",
        old_value: "OldText",
        new_value: "NewText",
        editor_role: "partner_admin",
        action: "update",
      }),
    );
    expect(resetOverrideCacheMock).toHaveBeenCalled();
  });

  it("no-op when newValue === oldValue (no history spam, no cache-invalidate)", async () => {
    const insertHistorySpy = vi.fn().mockResolvedValue({ error: null });

    setupFromMock({
      profiles: profileFound("strategaize_admin"),
      text_override: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: "ovr-1", text_value: "Same" },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        }),
      }),
      text_override_history: () => ({ insert: insertHistorySpy }),
    });

    const result = await saveTextOverride({
      scope: "global",
      scopeId: null,
      textKey: "k",
      newValue: "Same",
    });

    expect(result).toEqual({ ok: true, data: { created: false } });
    expect(insertHistorySpy).not.toHaveBeenCalled();
    expect(resetOverrideCacheMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// resetTextOverride
// ============================================================

describe("resetTextOverride", () => {
  beforeEach(() => setUser("u-admin"));

  it("deletes existing override + writes history (action=delete)", async () => {
    const deleteSpy = vi.fn(() => ({
      eq: () => Promise.resolve({ error: null }),
    }));
    const insertHistorySpy = vi.fn().mockResolvedValue({ error: null });

    setupFromMock({
      profiles: profileFound("strategaize_admin"),
      text_override: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: "ovr-x", text_value: "ToDelete" },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        }),
        delete: deleteSpy,
      }),
      text_override_history: () => ({ insert: insertHistorySpy }),
    });

    const result = await resetTextOverride({
      scope: "global",
      scopeId: null,
      textKey: "k",
    });

    expect(result).toEqual({ ok: true, data: { existed: true } });
    expect(deleteSpy).toHaveBeenCalled();
    expect(insertHistorySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        text_override_id: null,
        old_value: "ToDelete",
        new_value: null,
        action: "delete",
      }),
    );
    expect(resetOverrideCacheMock).toHaveBeenCalled();
  });

  it("returns existed=false when no override row present (no-op, no history, no cache-bust)", async () => {
    const insertHistorySpy = vi.fn().mockResolvedValue({ error: null });

    setupFromMock({
      profiles: profileFound("strategaize_admin"),
      text_override: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: () =>
                    Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
      text_override_history: () => ({ insert: insertHistorySpy }),
    });

    const result = await resetTextOverride({
      scope: "global",
      scopeId: null,
      textKey: "k",
    });

    expect(result).toEqual({ ok: true, data: { existed: false } });
    expect(insertHistorySpy).not.toHaveBeenCalled();
    expect(resetOverrideCacheMock).not.toHaveBeenCalled();
  });

  it("propagates RLS-DELETE-Error", async () => {
    setupFromMock({
      profiles: profileFound("partner_admin"),
      text_override: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: "ovr-1", text_value: "v" },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        }),
        delete: () => ({
          eq: () =>
            Promise.resolve({
              error: { message: "row-level security violation" },
            }),
        }),
      }),
    });

    const result = await resetTextOverride({
      scope: "partner",
      scopeId: "other-partner",
      textKey: "k",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/row-level security/);
    }
  });
});
