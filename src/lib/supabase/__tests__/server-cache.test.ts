// SLC-110 F-110-H1 (ISSUE-049) — createClient() Request-Scope-cache Smoke
//
// Verifiziert: Zwei aufeinanderfolgende createClient()-Aufrufe innerhalb
// derselben Render-Phase liefern dieselbe SupabaseClient-Instanz und
// createServerClient wird nur EINMAL aufgerufen. Damit greift die
// Object.is-Args-Memoization in resolveBrandingForTenant downstream
// korrekt (Cache-Hit auf identische supabase-Referenz).
//
// Pattern: Object.is-Stand-in fuer React cache() — identisch zu
// branding/__tests__/resolve.test.ts (Case 8). Ausserhalb eines RSC-Render-
// Contexts ist React.cache() ein Passthrough; der Stand-in macht echte
// Memoization beobachtbar.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T extends (...args: unknown[]) => unknown>(fn: T): T => {
      const entries: Array<{ args: unknown[]; result: unknown }> = [];
      return ((...args: unknown[]) => {
        for (const entry of entries) {
          if (
            entry.args.length === args.length &&
            entry.args.every((v, i) => Object.is(v, args[i]))
          ) {
            return entry.result;
          }
        }
        const result = fn(...args);
        entries.push({ args, result });
        return result;
      }) as unknown as T;
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: () => {},
  })),
}));

const createServerClientMock = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}));

beforeEach(() => {
  createServerClientMock.mockReset();
  // Jeder Aufruf liefert ein FRISCHES Objekt — wuerden sich die Aufrufe
  // bis zum Client durchschlagen, waeren die Instanzen unterschiedlich.
  // Mit cache() greift nur der erste Aufruf, beide Caller bekommen
  // dasselbe Objekt.
  createServerClientMock.mockImplementation(() => ({ marker: Symbol() }));
  process.env.SUPABASE_URL = "https://stub.supabase.local";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";
});

describe("supabase/server createClient — cache() Request-Scope-Memo", () => {
  it("liefert bei zwei Aufrufen dieselbe Instanz und ruft createServerClient nur einmal", async () => {
    const { createClient } = await import("../server");

    const c1 = await createClient();
    const c2 = await createClient();

    expect(c1).toBe(c2);
    expect(createServerClientMock).toHaveBeenCalledTimes(1);
  });
});
