// V9.1 SLC-V9.1-B MT-2 — Vitest fuer den Continuous-Pipeline-Trigger-Service.
//
// Hermetisch: chainable admin-Mock (kein DB-Roundtrip) + injizierter capStore +
// injiziertes notifyCapHit. capStore-Pfade (Views) sind in MT-1 separat getestet.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  runPipelineTrigger,
  resolveTriggerMinCount,
  DEFAULT_TRIGGER_MIN_COUNT,
  type PipelineTriggerDeps,
} from "../pipeline-trigger";
import type { ContinuousCapStore } from "../continuous-cost-cap";

vi.mock("@/lib/logger", () => ({
  captureInfo: vi.fn(),
  captureWarning: vi.fn(),
  captureException: vi.fn(),
}));

interface RunRow {
  id: string;
  tenant_id: string;
  status: string;
  email_count: number | null;
  created_at: string;
}

interface RecordedUpdate {
  table: string;
  id: string | undefined;
  payload: Record<string, unknown>;
}
interface RecordedInsert {
  table: string;
  payload: Record<string, unknown>;
}

function makeAdmin(runs: RunRow[]) {
  const updates: RecordedUpdate[] = [];
  const inserts: RecordedInsert[] = [];
  const client = {
    from(table: string) {
      const op: { type: string; payload: Record<string, unknown> | null } = {
        type: "select",
        payload: null,
      };
      const builder = {
        select() {
          op.type = "select";
          return builder;
        },
        update(p: Record<string, unknown>) {
          op.type = "update";
          op.payload = p;
          return builder;
        },
        insert(p: Record<string, unknown>) {
          inserts.push({ table, payload: p });
          return Promise.resolve({ error: null });
        },
        eq(col: string, val: string) {
          if (op.type === "update") {
            updates.push({
              table,
              id: col === "id" ? val : undefined,
              payload: op.payload ?? {},
            });
            return Promise.resolve({ error: null });
          }
          return builder;
        },
        in() {
          return Promise.resolve({ data: runs, error: null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, updates, inserts };
}

function makeCapStore(
  costByTenant: Record<string, { day?: number; month?: number }>,
): ContinuousCapStore {
  return {
    async getTenantDayCostEur(t) {
      return costByTenant[t]?.day ?? 0;
    },
    async getTenantMonthCostEur(t) {
      return costByTenant[t]?.month ?? 0;
    },
  };
}

const NOW = new Date("2026-06-10T12:00:00.000Z");
const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function baseDeps(
  runs: RunRow[],
  cost: Record<string, { day?: number; month?: number }> = {},
): {
  deps: PipelineTriggerDeps;
  updates: RecordedUpdate[];
  inserts: RecordedInsert[];
  notify: ReturnType<typeof vi.fn>;
} {
  const admin = makeAdmin(runs);
  const notify = vi.fn().mockResolvedValue(true);
  return {
    deps: {
      adminClient: admin.client,
      capStore: makeCapStore(cost),
      notifyCapHit: notify,
      now: NOW,
    },
    updates: admin.updates,
    inserts: admin.inserts,
    notify,
  };
}

describe("resolveTriggerMinCount", () => {
  it("Default 25, ENV-Override, Fallback bei Muell", () => {
    expect(DEFAULT_TRIGGER_MIN_COUNT).toBe(25);
    expect(resolveTriggerMinCount({})).toBe(25);
    expect(resolveTriggerMinCount({ V91_BULK_EMAIL_TRIGGER_MIN_COUNT: "10" })).toBe(10);
    expect(resolveTriggerMinCount({ V91_BULK_EMAIL_TRIGGER_MIN_COUNT: "x" })).toBe(25);
  });
});

describe("runPipelineTrigger — continuous start", () => {
  it("email_count >= 25 + cap OK -> triggered (status='parsed' + enqueue pre_filter)", async () => {
    const { deps, updates, inserts } = baseDeps([
      {
        id: "run-1",
        tenant_id: TENANT_A,
        status: "continuous",
        email_count: 30,
        created_at: "2026-06-10T08:00:00.000Z",
      },
    ]);
    const s = await runPipelineTrigger(deps);
    expect(s).toMatchObject({
      runs_evaluated: 1,
      runs_triggered: 1,
      runs_skipped_cap: 0,
      runs_skipped_threshold: 0,
    });
    expect(updates).toEqual([
      { table: "email_bulk_run", id: "run-1", payload: expect.objectContaining({ status: "parsed" }) },
    ]);
    expect(inserts[0]).toMatchObject({
      table: "ai_jobs",
      payload: expect.objectContaining({
        job_type: "email_bulk_pre_filter",
        tenant_id: TENANT_A,
        status: "pending",
        payload: { bulk_run_id: "run-1" },
      }),
    });
  });

  it("email_count 20 < 25 + selber Tag -> skipped_threshold (kein Trigger)", async () => {
    const { deps, updates, inserts } = baseDeps([
      {
        id: "run-1",
        tenant_id: TENANT_A,
        status: "continuous",
        email_count: 20,
        created_at: "2026-06-10T08:00:00.000Z",
      },
    ]);
    const s = await runPipelineTrigger(deps);
    expect(s.runs_skipped_threshold).toBe(1);
    expect(s.runs_triggered).toBe(0);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("email_count 20 < 25 ABER created gestern -> Daily-Roll-Over triggert", async () => {
    const { deps, inserts } = baseDeps([
      {
        id: "run-1",
        tenant_id: TENANT_A,
        status: "continuous",
        email_count: 20,
        created_at: "2026-06-09T23:50:00.000Z",
      },
    ]);
    const s = await runPipelineTrigger(deps);
    expect(s.runs_triggered).toBe(1);
    expect(s.runs_skipped_threshold).toBe(0);
    expect(inserts[0].payload).toMatchObject({ job_type: "email_bulk_pre_filter" });
  });

  it("Cap-Hit (Daily) -> status='paused' + notify + skipped_cap, kein Pipeline-Start", async () => {
    const { deps, updates, inserts, notify } = baseDeps(
      [
        {
          id: "run-1",
          tenant_id: TENANT_A,
          status: "continuous",
          email_count: 100,
          created_at: "2026-06-10T08:00:00.000Z",
        },
      ],
      { [TENANT_A]: { day: 6 } }, // > 5 EUR Daily-Cap
    );
    const s = await runPipelineTrigger(deps);
    expect(s.runs_skipped_cap).toBe(1);
    expect(s.runs_triggered).toBe(0);
    expect(updates).toEqual([
      { table: "email_bulk_run", id: "run-1", payload: expect.objectContaining({ status: "paused" }) },
    ]);
    expect(inserts).toHaveLength(0); // kein ai_jobs-Enqueue bei Cap-Hit
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      tenantId: TENANT_A,
      reason: "daily_cap_hit",
    });
  });
});

describe("runPipelineTrigger — stage advancement", () => {
  it("pre_filtered -> enqueue thread_redact (advanced, kein Status-Set)", async () => {
    const { deps, updates, inserts } = baseDeps([
      {
        id: "run-2",
        tenant_id: TENANT_A,
        status: "pre_filtered",
        email_count: 30,
        created_at: "2026-06-10T08:00:00.000Z",
      },
    ]);
    const s = await runPipelineTrigger(deps);
    expect(s.runs_advanced).toBe(1);
    expect(updates).toHaveLength(0);
    expect(inserts[0].payload).toMatchObject({ job_type: "email_bulk_thread_redact" });
  });

  it("thread_redacted + cap OK -> status='pattern_extracting' + enqueue pattern_extract", async () => {
    const { deps, updates, inserts } = baseDeps([
      {
        id: "run-3",
        tenant_id: TENANT_A,
        status: "thread_redacted",
        email_count: 30,
        created_at: "2026-06-10T08:00:00.000Z",
      },
    ]);
    const s = await runPipelineTrigger(deps);
    expect(s.runs_advanced).toBe(1);
    expect(updates).toEqual([
      { table: "email_bulk_run", id: "run-3", payload: expect.objectContaining({ status: "pattern_extracting" }) },
    ]);
    expect(inserts[0].payload).toMatchObject({ job_type: "email_bulk_pattern_extract" });
  });

  it("thread_redacted + Cap-Hit (Monthly) -> paused + notify, kein pattern_extract", async () => {
    const { deps, inserts, notify } = baseDeps(
      [
        {
          id: "run-3",
          tenant_id: TENANT_A,
          status: "thread_redacted",
          email_count: 30,
          created_at: "2026-06-10T08:00:00.000Z",
        },
      ],
      { [TENANT_A]: { month: 120 } }, // > 100 EUR Monthly-Cap
    );
    const s = await runPipelineTrigger(deps);
    expect(s.runs_skipped_cap).toBe(1);
    expect(inserts).toHaveLength(0);
    expect(notify.mock.calls[0][0]).toMatchObject({ reason: "monthly_cap_hit" });
  });
});

describe("runPipelineTrigger — multi-tenant (Spec MT-2 Verification)", () => {
  it("3 continuous Runs (2 unter Cap, 1 ueber Daily) -> 3 evaluated, 2 triggered, 1 skipped_cap", async () => {
    const { deps } = baseDeps(
      [
        { id: "r1", tenant_id: TENANT_A, status: "continuous", email_count: 40, created_at: "2026-06-10T08:00:00.000Z" },
        { id: "r2", tenant_id: TENANT_B, status: "continuous", email_count: 40, created_at: "2026-06-10T08:00:00.000Z" },
        { id: "r3", tenant_id: "cccccccc-cccc-cccc-cccc-cccccccccccc", status: "continuous", email_count: 40, created_at: "2026-06-10T08:00:00.000Z" },
      ],
      { "cccccccc-cccc-cccc-cccc-cccccccccccc": { day: 9 } },
    );
    const s = await runPipelineTrigger(deps);
    expect(s).toMatchObject({
      runs_evaluated: 3,
      runs_triggered: 2,
      runs_skipped_cap: 1,
      runs_skipped_threshold: 0,
    });
  });

  it("leere Run-Liste -> alles 0", async () => {
    const { deps } = baseDeps([]);
    const s = await runPipelineTrigger(deps);
    expect(s).toEqual({
      runs_evaluated: 0,
      runs_triggered: 0,
      runs_advanced: 0,
      runs_skipped_cap: 0,
      runs_skipped_threshold: 0,
    });
  });
});
