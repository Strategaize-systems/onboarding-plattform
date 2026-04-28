// SLC-041 MT-3 — getReviewSummary Helper-Tests (Mock-basiert, kein DB).
// Verifiziert Aggregation-Logik aus block_review + knowledge_unit.

import { describe, it, expect, vi } from "vitest";
import { getReviewSummary } from "../get-review-summary";
import type { SupabaseClient } from "@supabase/supabase-js";

interface MockTableResult {
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
}

interface MockTracker {
  /** Tracks `.eq(column, value)` calls per table. */
  eqCalls: Record<string, Array<[string, unknown]>>;
}

/**
 * Erzeugt einen Supabase-Client-Stub. Jeder Aufruf von `.eq()` liefert ein
 * thenable Objekt zurueck — Supabase-Builder werden am Ende einfach geawait.
 * Optional: Tracker registriert die `.eq()`-Calls pro Tabelle, damit Tests
 * den Filter-Pfad verifizieren koennen (ISSUE-029).
 */
function makeMockClient(
  reviewResult: MockTableResult,
  kuResult: MockTableResult,
  tracker?: MockTracker,
): SupabaseClient {
  const buildThenable = (table: string, result: MockTableResult) => {
    const obj: Record<string, unknown> = {};
    obj.eq = vi.fn((col: string, val: unknown) => {
      if (tracker) {
        tracker.eqCalls[table] = tracker.eqCalls[table] ?? [];
        tracker.eqCalls[table].push([col, val]);
      }
      return obj;
    });
    obj.then = (resolve: (v: MockTableResult) => unknown) => resolve(result);
    return obj;
  };

  const fromFn = vi.fn((table: string) => {
    const result = table === "block_review" ? reviewResult : kuResult;
    return {
      select: vi.fn(() => buildThenable(table, result)),
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

  // ISSUE-029: captureSessionId ist optional. Wenn weggelassen, filtert der
  // Helper nur auf tenant_id (und auf source='employee_questionnaire' fuer KUs).
  // Das ist V4.1-korrekt, weil block_review-Rows in den Mitarbeiter-Sessions
  // liegen und Aufrufer nur die GF-Session kennen.
  it("filtert ohne captureSessionId nur auf tenant_id (ISSUE-029)", async () => {
    const tracker: MockTracker = { eqCalls: {} };
    const client = makeMockClient(
      {
        data: [
          { block_key: "A", status: "approved" },
          { block_key: "B", status: "pending" },
        ],
        error: null,
      },
      {
        data: [{ block_key: "A" }, { block_key: "B" }],
        error: null,
      },
      tracker,
    );
    const result = await getReviewSummary(client, TENANT_ID);

    expect(result).toEqual({
      approved: 1,
      pending: 1,
      rejected: 0,
      totalEmployeeBlocks: 2,
    });

    // block_review: nur tenant_id-Filter
    const reviewCols = (tracker.eqCalls.block_review ?? []).map(
      ([col]) => col,
    );
    expect(reviewCols).toContain("tenant_id");
    expect(reviewCols).not.toContain("capture_session_id");

    // knowledge_unit: tenant_id + source, KEIN capture_session_id
    const kuCols = (tracker.eqCalls.knowledge_unit ?? []).map(([col]) => col);
    expect(kuCols).toContain("tenant_id");
    expect(kuCols).toContain("source");
    expect(kuCols).not.toContain("capture_session_id");
  });

  it("filtert mit captureSessionId zusaetzlich auf capture_session_id", async () => {
    const tracker: MockTracker = { eqCalls: {} };
    const client = makeMockClient(
      { data: [], error: null },
      { data: [], error: null },
      tracker,
    );
    await getReviewSummary(client, TENANT_ID, SESSION_ID);

    const reviewCols = (tracker.eqCalls.block_review ?? []).map(
      ([col]) => col,
    );
    expect(reviewCols).toContain("tenant_id");
    expect(reviewCols).toContain("capture_session_id");

    const kuCols = (tracker.eqCalls.knowledge_unit ?? []).map(([col]) => col);
    expect(kuCols).toContain("tenant_id");
    expect(kuCols).toContain("source");
    expect(kuCols).toContain("capture_session_id");
  });
});
