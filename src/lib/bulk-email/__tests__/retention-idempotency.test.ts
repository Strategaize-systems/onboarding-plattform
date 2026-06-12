// V9.1 SLC-V9.1-C MT-1 — Vitest fuer isRunImportedToHandbook.
// Hermetisch: chainable supabase-Mock, der die Filter-Args aufzeichnet und ein
// konfigurierbares {data,error} aus .limit() aufloest.

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isRunImportedToHandbook } from "../retention-idempotency";

interface RecordedQuery {
  table: string;
  filters: Array<[string, unknown]>;
}

function makeAdmin(
  result: { data: unknown[] | null; error: { message: string } | null },
) {
  const recorded: RecordedQuery = { table: "", filters: [] };
  const client = {
    from(table: string) {
      recorded.table = table;
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          recorded.filters.push([col, val]);
          return builder;
        },
        limit() {
          return Promise.resolve(result);
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, recorded };
}

describe("isRunImportedToHandbook", () => {
  it("true bei mindestens einer KU-Row", async () => {
    const { client } = makeAdmin({ data: [{ id: "ku-1" }], error: null });
    await expect(isRunImportedToHandbook(client, "run-1")).resolves.toBe(true);
  });

  it("false ohne Match", async () => {
    const { client } = makeAdmin({ data: [], error: null });
    await expect(isRunImportedToHandbook(client, "run-1")).resolves.toBe(false);
  });

  it("false bei data=null", async () => {
    const { client } = makeAdmin({ data: null, error: null });
    await expect(isRunImportedToHandbook(client, "run-1")).resolves.toBe(false);
  });

  it("filtert auf source='email_bulk' und metadata->>bulk_run_id", async () => {
    const { client, recorded } = makeAdmin({ data: [], error: null });
    await isRunImportedToHandbook(client, "run-42");
    expect(recorded.table).toBe("knowledge_unit");
    expect(recorded.filters).toEqual([
      ["source", "email_bulk"],
      ["metadata->>bulk_run_id", "run-42"],
    ]);
  });

  it("wirft bei DB-Fehler", async () => {
    const { client } = makeAdmin({ data: null, error: { message: "boom" } });
    await expect(isRunImportedToHandbook(client, "run-1")).rejects.toThrow(
      /knowledge_unit SELECT failed/,
    );
  });
});
