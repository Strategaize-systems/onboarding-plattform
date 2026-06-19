// V9.8 SLC-V9.8-B MT-1 — Hermetische Vitest fuer getTenantTagVocabulary.
//
// Spec: slices/SLC-V9.8-B-controlled-tag-vokabular.md (MT-1 Verification)
// Coverage: Frequenz-Zaehlung, Sort (freq desc, tie alpha asc), Cap,
//   leer→[], nur-leere-themes→[], Trim/Skip-Empty, tenant_id-Scope-Filter,
//   DB-Fehler→throw.
//
// Die DB-Sidecar Tenant-Isolation (Cross-Tenant-Leak, AC-B-4 / SC-4) liegt in
// tag-vocabulary-tenant-isolation-db.test.ts (node:20-Sidecar, im /qa).

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getTenantTagVocabulary, DEFAULT_TAG_VOCABULARY_CAP } from "../tag-vocabulary";

interface StubOptions {
  rows?: { themes: string[] | null }[];
  error?: { message: string } | null;
}

interface EqCall {
  col: string;
  val: unknown;
}

function makeClient(opts: StubOptions): {
  client: SupabaseClient;
  eqCalls: EqCall[];
  selectedTable: string[];
} {
  const eqCalls: EqCall[] = [];
  const selectedTable: string[] = [];
  const client = {
    from(table: string) {
      selectedTable.push(table);
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: unknown) {
              eqCalls.push({ col, val });
              return Promise.resolve({
                data: opts.rows ?? [],
                error: opts.error ?? null,
              });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, eqCalls, selectedTable };
}

const TENANT = "11111111-1111-1111-1111-111111111111";

describe("getTenantTagVocabulary", () => {
  it("counts frequency and sorts desc (tie-break alpha asc)", async () => {
    const { client } = makeClient({
      rows: [
        { themes: ["pricing", "prozesse"] },
        { themes: ["pricing", "lieferung"] },
        { themes: ["pricing"] },
        { themes: ["prozesse"] },
        { themes: ["lieferung"] },
      ],
    });
    // pricing=3, lieferung=2, prozesse=2 → pricing, then lieferung < prozesse (alpha)
    const result = await getTenantTagVocabulary(client, TENANT);
    expect(result).toEqual(["pricing", "lieferung", "prozesse"]);
  });

  it("applies the cap (top-N by frequency)", async () => {
    const { client } = makeClient({
      rows: [
        { themes: ["a", "a", "a"] },
        { themes: ["b", "b"] },
        { themes: ["c"] },
      ],
    });
    const result = await getTenantTagVocabulary(client, TENANT, 2);
    expect(result).toEqual(["a", "b"]);
  });

  it("defaults the cap to 60", async () => {
    expect(DEFAULT_TAG_VOCABULARY_CAP).toBe(60);
    const rows = Array.from({ length: 80 }, (_, i) => ({
      // each tag i appears (80 - i) times so order is deterministic desc
      themes: Array.from({ length: 80 - i }, () => `tag-${String(i).padStart(2, "0")}`),
    }));
    const { client } = makeClient({ rows });
    const result = await getTenantTagVocabulary(client, TENANT);
    expect(result).toHaveLength(60);
    expect(result[0]).toBe("tag-00");
    expect(result[59]).toBe("tag-59");
  });

  it("returns [] for no rows", async () => {
    const { client } = makeClient({ rows: [] });
    expect(await getTenantTagVocabulary(client, TENANT)).toEqual([]);
  });

  it("returns [] when all themes arrays are empty/null", async () => {
    const { client } = makeClient({
      rows: [{ themes: [] }, { themes: null }, { themes: [] }],
    });
    expect(await getTenantTagVocabulary(client, TENANT)).toEqual([]);
  });

  it("trims whitespace and skips empty/non-string tags", async () => {
    const { client } = makeClient({
      rows: [
        { themes: ["  pricing  ", "", "   "] },
        { themes: ["pricing"] },
        // a malformed non-string entry must not break aggregation
        { themes: ["lieferung", 42 as unknown as string] },
      ],
    });
    const result = await getTenantTagVocabulary(client, TENANT);
    expect(result).toEqual(["pricing", "lieferung"]);
  });

  it("scopes the query strictly to the given tenant_id", async () => {
    const { client, eqCalls, selectedTable } = makeClient({ rows: [] });
    await getTenantTagVocabulary(client, TENANT);
    expect(selectedTable).toEqual(["knowledge_unit"]);
    expect(eqCalls).toEqual([{ col: "tenant_id", val: TENANT }]);
  });

  it("throws on DB error", async () => {
    const { client } = makeClient({ error: { message: "boom" } });
    await expect(getTenantTagVocabulary(client, TENANT)).rejects.toThrow(/boom/);
  });

  it("cap <= 0 yields []", async () => {
    const { client } = makeClient({ rows: [{ themes: ["a"] }] });
    expect(await getTenantTagVocabulary(client, TENANT, 0)).toEqual([]);
  });
});
