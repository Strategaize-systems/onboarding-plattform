// V7.1 SLC-136 MT-2 — Resolver Vitest (FEAT-055)
//
// Deckt alle in SLC-136 MT-2 geforderten 6+ Cases ab:
//   1. global-only        (kein template, kein partner)
//   2. template-only      (override gewinnt vs default)
//   3. partner-only       (override gewinnt vs default)
//   4. Precedence         partner > template > global fuer selben Key
//   5. missing key        -> resolveText returnt defaultText
//   6. Cache-Hit          innerhalb 60s, gleicher Cache-Key
//   7. Cache-Invalidate   explizit via invalidateOverrideCache()
//   8. loadOverrides      Supabase-Error -> Exception
//   9. loadOverrides      kein partnerOrgId -> Query ohne partner-Filter
//  10. resetOverrideCache -> alle Caches gleichzeitig kalt

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mergeRowsToMap,
  resolveText,
  loadOverrides,
  loadOverridesWithCache,
  invalidateOverrideCache,
  resetOverrideCache,
  type TextOverrideRow,
} from "../resolver";

// ============================================================
// Mock-Builder
// ============================================================

interface QueryResult {
  data: TextOverrideRow[] | null;
  error: { message: string } | null;
}

function mockSupabaseClient(result: QueryResult, capture?: { lastFilters?: string }): SupabaseClient {
  const eq = vi.fn().mockResolvedValue(result);
  const or = vi.fn((filters: string) => {
    if (capture) capture.lastFilters = filters;
    return { eq };
  });
  const select = vi.fn(() => ({ or }));
  const from = vi.fn(() => ({ select }));
  return { from } as unknown as SupabaseClient;
}

// ============================================================
// mergeRowsToMap
// ============================================================

describe("mergeRowsToMap (pure precedence)", () => {
  it("Case 1: global-only — set wird gemerged", () => {
    const rows: TextOverrideRow[] = [
      { scope: "global", scope_id: null, text_key: "header.title", text_value: "Global Title" },
    ];
    const map = mergeRowsToMap(rows);
    expect(map.get("header.title")).toBe("Global Title");
    expect(map.size).toBe(1);
  });

  it("Case 2: template-only — gewinnt vs leerer global-Scope", () => {
    const rows: TextOverrideRow[] = [
      { scope: "template", scope_id: "tmpl-1", text_key: "intro.text", text_value: "Template Intro" },
    ];
    const map = mergeRowsToMap(rows);
    expect(map.get("intro.text")).toBe("Template Intro");
  });

  it("Case 3: partner-only — partner wird gemerged", () => {
    const rows: TextOverrideRow[] = [
      { scope: "partner", scope_id: "part-1", text_key: "footer.legal", text_value: "Partner Legal" },
    ];
    const map = mergeRowsToMap(rows);
    expect(map.get("footer.legal")).toBe("Partner Legal");
  });

  it("Case 4: precedence partner > template > global fuer denselben text_key", () => {
    const rows: TextOverrideRow[] = [
      { scope: "global", scope_id: null, text_key: "cta.button", text_value: "Global CTA" },
      { scope: "template", scope_id: "tmpl-1", text_key: "cta.button", text_value: "Template CTA" },
      { scope: "partner", scope_id: "part-1", text_key: "cta.button", text_value: "Partner CTA" },
    ];
    const map = mergeRowsToMap(rows);
    expect(map.get("cta.button")).toBe("Partner CTA");
  });

  it("Case 4b: precedence template > global wenn kein partner-Row vorhanden", () => {
    const rows: TextOverrideRow[] = [
      { scope: "global", scope_id: null, text_key: "cta.button", text_value: "Global CTA" },
      { scope: "template", scope_id: "tmpl-1", text_key: "cta.button", text_value: "Template CTA" },
    ];
    const map = mergeRowsToMap(rows);
    expect(map.get("cta.button")).toBe("Template CTA");
  });
});

// ============================================================
// resolveText
// ============================================================

describe("resolveText (pure lookup)", () => {
  it("Case 5: missing key returnt defaultText", () => {
    const map = new Map<string, string>();
    expect(resolveText(map, "unknown.key", "Default Fallback")).toBe("Default Fallback");
  });

  it("Case 5b: existing key gewinnt vs defaultText", () => {
    const map = new Map<string, string>([["x", "OverrideValue"]]);
    expect(resolveText(map, "x", "Default")).toBe("OverrideValue");
  });

  it("Case 5c: empty-string override gewinnt vs defaultText (intentional clear)", () => {
    // Wichtig: nutzt ?? (nullish), nicht || — empty string ist gueltige Override-Wahl.
    const map = new Map<string, string>([["x", ""]]);
    expect(resolveText(map, "x", "Default")).toBe("");
  });
});

// ============================================================
// loadOverrides (mit Mock-Client)
// ============================================================

describe("loadOverrides (Supabase-DI)", () => {
  it("Case 8: Supabase-Error wird zu Exception", async () => {
    const supabase = mockSupabaseClient({ data: null, error: { message: "permission denied" } });
    await expect(loadOverrides(supabase, "part-1")).rejects.toThrow(/permission denied/);
  });

  it("Case 9a: partnerOrgId=null fuegt KEINEN partner-Filter ein", async () => {
    const capture = { lastFilters: "" };
    const supabase = mockSupabaseClient({ data: [], error: null }, capture);
    await loadOverrides(supabase, null);
    expect(capture.lastFilters).toBe("scope.eq.global,scope.eq.template");
  });

  it("Case 9b: partnerOrgId gesetzt fuegt and(scope.eq.partner,scope_id.eq.<id>) ein", async () => {
    const capture = { lastFilters: "" };
    const supabase = mockSupabaseClient({ data: [], error: null }, capture);
    await loadOverrides(supabase, "part-abc");
    expect(capture.lastFilters).toBe(
      "scope.eq.global,scope.eq.template,and(scope.eq.partner,scope_id.eq.part-abc)",
    );
  });

  it("Case 9c: Rows aus Query werden via mergeRowsToMap zu Map", async () => {
    const supabase = mockSupabaseClient({
      data: [
        { scope: "global", scope_id: null, text_key: "k", text_value: "g" },
        { scope: "partner", scope_id: "p", text_key: "k", text_value: "p-override" },
      ],
      error: null,
    });
    const map = await loadOverrides(supabase, "p");
    expect(map.get("k")).toBe("p-override");
  });
});

// ============================================================
// loadOverridesWithCache + invalidate + reset
// ============================================================

describe("loadOverridesWithCache", () => {
  beforeEach(() => {
    resetOverrideCache();
  });

  it("Case 6: Cache-Hit innerhalb 60s ruft Supabase nur einmal", async () => {
    const supabase = mockSupabaseClient({
      data: [{ scope: "global", scope_id: null, text_key: "a", text_value: "A" }],
      error: null,
    });
    const first = await loadOverridesWithCache(supabase, "part-1");
    const second = await loadOverridesWithCache(supabase, "part-1");
    expect(first.get("a")).toBe("A");
    expect(second.get("a")).toBe("A");
    // from() darf nur einmal aufgerufen worden sein, weil der zweite Call gecached war.
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("Case 7: invalidateOverrideCache zwingt Supabase-Re-Query", async () => {
    const supabase = mockSupabaseClient({
      data: [{ scope: "global", scope_id: null, text_key: "a", text_value: "A" }],
      error: null,
    });
    await loadOverridesWithCache(supabase, "part-1");
    invalidateOverrideCache("part-1");
    await loadOverridesWithCache(supabase, "part-1");
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it("Case 10: resetOverrideCache loescht ALLE Cache-Keys", async () => {
    const supabase = mockSupabaseClient({ data: [], error: null });
    await loadOverridesWithCache(supabase, "part-1");
    await loadOverridesWithCache(supabase, "part-2");
    resetOverrideCache();
    await loadOverridesWithCache(supabase, "part-1");
    await loadOverridesWithCache(supabase, "part-2");
    // 2 vor reset + 2 nach reset = 4 Calls; ohne reset waeren es nur 2
    expect(supabase.from).toHaveBeenCalledTimes(4);
  });

  it("Different cache-keys (partnerOrgId vs locale) sind getrennt", async () => {
    const supabase = mockSupabaseClient({ data: [], error: null });
    await loadOverridesWithCache(supabase, "part-1", "de");
    await loadOverridesWithCache(supabase, "part-1", "nl");
    await loadOverridesWithCache(supabase, "part-2", "de");
    expect(supabase.from).toHaveBeenCalledTimes(3);
  });
});
