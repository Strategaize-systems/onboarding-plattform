// SLC-041 MT-3 — getReviewSummary Helper-Tests (Mock-basiert, kein DB).
// Verifiziert Aggregation-Logik aus block_review + knowledge_unit.

import { describe, it, expect, vi } from "vitest";
import { getReviewSummary } from "../get-review-summary";
import type { SupabaseClient } from "@supabase/supabase-js";

interface MockTableResult {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
}

/**
 * Erzeugt einen Supabase-Client-Stub. Jeder Aufruf von `.eq()` liefert ein
 * thenable Objekt zurueck — Supabase-Builder werden am Ende einfach geawait.
 */
function makeMockClient(
  reviewResult: MockTableResult,
  kuResult: MockTableResult,
): SupabaseClient {
  const buildThenable = (result: MockTableResult) => {
    const obj: Record<string, unknown> = {};
    obj.eq = vi.fn(() => obj);
    obj.then = (resolve: (v: MockTableResult) => unknown) => resolve(result);
    return obj;
  };

  const fromFn = vi.fn((table: string) => {
    const result = table === "block_review" ? reviewResult : kuResult;
    return {
      select: vi.fn(() => buildThenable(result)),
    };
  });
  return { from: fromFn } as unknown as SupabaseClient;
}

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "22222222-2222-2222-2222-222222222222";

describe("getReviewSummary", () => {
  it("liefert 0/0/0/0 wenn keine block_review und keine Mitarbeiter-KUs", async () => {
    const client = makeMockClient(
      { data: [], error: null },
      { data: [], error: null },
    );
    const result = await getReviewSummary(client, TENANT_ID, SESSION_ID);
    expect(result).toEqual({
      approved: 0,
      pending: 0,
      rejected: 0,
      totalEmployeeBlocks: 0,
    });
  });

  it("aggregiert Mixed-Status korrekt (2 approved, 1 pending, 1 rejected)", async () => {
    const client = makeMockClient(
      {
        data: [
          { block_key: "A", status: "approved" },
          { block_key: "B", status: "approved" },
          { block_key: "C", status: "pending" },
          { block_key: "D", status: "rejected" },
        ],
        error: null,
      },
      {
        data: [
          { block_key: "A" },
          { block_key: "A" },
          { block_key: "B" },
          { block_key: "C" },
          { block_key: "D" },
        ],
        error: null,
      },
    );
    const result = await getReviewSummary(client, TENANT_ID, SESSION_ID);
    expect(result).toEqual({
      approved: 2,
      pending: 1,
      rejected: 1,
      totalEmployeeBlocks: 4,
    });
  });

  it("zaehlt totalEmployeeBlocks DISTINCT (Duplikate werden zusammengefasst)", async () => {
    const client = makeMockClient(
      { data: [], error: null },
      {
        data: [
          { block_key: "A" },
          { block_key: "A" },
          { block_key: "A" },
          { block_key: "B" },
        ],
        error: null,
      },
    );
    const result = await getReviewSummary(client, TENANT_ID, SESSION_ID);
    expect(result.totalEmployeeBlocks).toBe(2);
  });

  it("wirft beim block_review-Lade-Fehler", async () => {
    const client = makeMockClient(
      { data: null, error: { message: "rls denied" } },
      { data: [], error: null },
    );
    await expect(
      getReviewSummary(client, TENANT_ID, SESSION_ID),
    ).rejects.toThrow(/Failed to load block_review/);
  });

  it("wirft beim knowledge_unit-Lade-Fehler", async () => {
    const client = makeMockClient(
      { data: [{ block_key: "A", status: "approved" }], error: null },
      { data: null, error: { message: "rls denied" } },
    );
    await expect(
      getReviewSummary(client, TENANT_ID, SESSION_ID),
    ).rejects.toThrow(/Failed to load knowledge_unit/);
  });
});
