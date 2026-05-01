import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveInactiveCardDisplay,
  getInactiveEmployeesCount,
} from "../inactive-employees";

interface MockResult {
  data: unknown;
  error: { message: string } | null;
}

function makeChainable(result: MockResult) {
  const promise = Promise.resolve(result);
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return promise.then.bind(promise);
        if (prop === "catch") return promise.catch.bind(promise);
        if (prop === "finally") return promise.finally.bind(promise);
        return () => proxy;
      },
    }
  );
  return proxy;
}

function buildMockClient(args: {
  invitations: MockResult;
  checkpoints?: MockResult;
}): SupabaseClient {
  const from = vi.fn((table: string) => {
    if (table === "employee_invitation") return makeChainable(args.invitations);
    if (table === "block_checkpoint") {
      if (!args.checkpoints) {
        throw new Error("block_checkpoint queried but no checkpoints mock provided");
      }
      return makeChainable(args.checkpoints);
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from } as unknown as SupabaseClient;
}

const TENANT = "tenant-A";

describe("getInactiveEmployeesCount", () => {
  it("returns 0/0 when no accepted invitations exist", async () => {
    const supabase = buildMockClient({
      invitations: { data: [], error: null },
    });
    const result = await getInactiveEmployeesCount(supabase, TENANT);
    expect(result).toEqual({ inactiveCount: 0, totalAccepted: 0 });
  });

  it("counts 1 inactive when 2 accepted but only 1 has a block_checkpoint", async () => {
    const supabase = buildMockClient({
      invitations: {
        data: [
          { accepted_user_id: "user-1" },
          { accepted_user_id: "user-2" },
        ],
        error: null,
      },
      checkpoints: {
        data: [{ created_by: "user-1" }],
        error: null,
      },
    });
    const result = await getInactiveEmployeesCount(supabase, TENANT);
    expect(result).toEqual({ inactiveCount: 1, totalAccepted: 2 });
  });

  it("returns 0 inactive when every accepted user has at least one block_checkpoint", async () => {
    const supabase = buildMockClient({
      invitations: {
        data: [
          { accepted_user_id: "user-1" },
          { accepted_user_id: "user-2" },
        ],
        error: null,
      },
      checkpoints: {
        data: [{ created_by: "user-1" }, { created_by: "user-2" }],
        error: null,
      },
    });
    const result = await getInactiveEmployeesCount(supabase, TENANT);
    expect(result).toEqual({ inactiveCount: 0, totalAccepted: 2 });
  });

  it("dedupes accepted_user_ids when multiple invitations point to same user", async () => {
    const supabase = buildMockClient({
      invitations: {
        data: [
          { accepted_user_id: "user-1" },
          { accepted_user_id: "user-1" },
        ],
        error: null,
      },
      checkpoints: { data: [], error: null },
    });
    const result = await getInactiveEmployeesCount(supabase, TENANT);
    expect(result).toEqual({ inactiveCount: 1, totalAccepted: 1 });
  });

  it("throws when employee_invitation query fails", async () => {
    const supabase = buildMockClient({
      invitations: { data: null, error: { message: "boom" } },
    });
    await expect(getInactiveEmployeesCount(supabase, TENANT)).rejects.toThrow(/boom/);
  });
});

describe("deriveInactiveCardDisplay", () => {
  it("renders dash + default tone when no employees were accepted yet", () => {
    expect(
      deriveInactiveCardDisplay({ inactiveCount: 0, totalAccepted: 0 })
    ).toEqual({
      value: "–",
      hint: "Noch keine Mitarbeiter eingeladen",
      tone: "default",
    });
  });

  it("renders zero + success tone when all accepted users are active", () => {
    expect(
      deriveInactiveCardDisplay({ inactiveCount: 0, totalAccepted: 4 })
    ).toEqual({
      value: "0",
      hint: "von 4 eingeladenen",
      tone: "success",
    });
  });

  it("renders count + warning tone when at least one is inactive", () => {
    expect(
      deriveInactiveCardDisplay({ inactiveCount: 3, totalAccepted: 5 })
    ).toEqual({
      value: "3",
      hint: "von 5 eingeladenen",
      tone: "warning",
    });
  });
});
