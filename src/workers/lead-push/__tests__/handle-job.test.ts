import { describe, it, expect, vi } from "vitest";

import {
  executeLeadPushRetry,
  nextBackoffMs,
  type HandleLeadPushRetryDeps,
} from "../handle-job";
import type { ClaimedJob } from "../../condensation/claim-loop";
import type {
  LeadIntakePayload,
  LeadIntakeResponse,
} from "../../../lib/integrations/business-system/types";

/**
 * V6 SLC-106 MT-6 — Vitest fuer handleLeadPushRetryJob.
 *
 * 5 Faelle (Slice-Spec):
 *   1. Happy (Attempt 2 → success): pushFn ok → audit success, KEIN neuer ai_jobs.
 *   2. Retry-2 (Attempt 2 fail → enqueue Attempt 3 mit 30min Backoff).
 *   3. Retry-3 (Attempt 3 fail → markAuditFailed final, KEIN neuer ai_jobs).
 *   4. Max-Attempts (Attempt 4 darf nicht passieren — Safety-Branch).
 *   5. Backoff-Schedule-Verify: nextBackoffMs(1)=5min, nextBackoffMs(2)=30min.
 *
 * Pattern: mocked `adminClient` (chainable Supabase-shape) + injizierte `pushFn`
 * + injizierte `now()`. Wir verifizieren SQL-Aufrufe via call-recording statt
 * gegen die DB zu fahren — DB-Constraints sind in MT-5 `lead-push-actions-db.
 * test.ts` bereits live abgedeckt. Dieser Test verifiziert die Worker-LOGIK
 * (Branching, Backoff-Berechnung, Enqueue-Pfad, Idempotenz).
 */

interface MockCall {
  table: string;
  op: "select" | "update" | "insert" | "delete";
  filters?: Record<string, unknown>;
  payload?: unknown;
}

interface MockResponse {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

interface MockTableProgram {
  select?: () => MockResponse;
  update?: (payload: unknown) => MockResponse;
  insert?: (payload: unknown) => MockResponse;
}

function makeMockAdminClient(program: {
  tables: Record<string, MockTableProgram>;
  auth?: { getUserById?: () => MockResponse };
  rpc?: () => MockResponse;
}) {
  const calls: MockCall[] = [];

  const fromBuilder = (table: string) => {
    const cfg = program.tables[table] ?? {};
    return {
      // SELECT-Chain
      select(_cols?: string) {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq(col: string, val: unknown) {
            filters[col] = val;
            return chain;
          },
          single() {
            calls.push({ table, op: "select", filters });
            const res = cfg.select?.() ?? { data: null, error: null };
            return Promise.resolve(res);
          },
          maybeSingle() {
            calls.push({ table, op: "select", filters });
            const res = cfg.select?.() ?? { data: null, error: null };
            return Promise.resolve(res);
          },
        };
        return chain;
      },
      // UPDATE-Chain
      update(payload: unknown) {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq(col: string, val: unknown) {
            filters[col] = val;
            calls.push({ table, op: "update", filters, payload });
            const res = cfg.update?.(payload) ?? { data: null, error: null };
            return Promise.resolve(res);
          },
        };
        return chain;
      },
      // INSERT (kein chain, direkt Promise)
      insert(payload: unknown) {
        calls.push({ table, op: "insert", payload });
        const res = cfg.insert?.(payload) ?? { data: null, error: null };
        return Promise.resolve(res);
      },
    };
  };

  const adminClient = {
    from: vi.fn(fromBuilder),
    auth: {
      admin: {
        getUserById: vi.fn(async (_id: string) => {
          return program.auth?.getUserById?.() ?? { data: null, error: null };
        }),
      },
    },
    rpc: vi.fn(async (_name: string, _params: unknown) => {
      return program.rpc?.() ?? { data: null, error: null };
    }),
  };

  return { adminClient, calls };
}

const AUDIT_ID = "11111111-1111-4111-8111-111111111111";
const CONSENT_ID = "22222222-2222-4222-8222-222222222222";
const CAPTURE_ID = "33333333-3333-4333-8333-333333333333";
const MANDANT_USER_ID = "44444444-4444-4444-8444-444444444444";
const MANDANT_TENANT_ID = "55555555-5555-4555-8555-555555555555";
const PARTNER_TENANT_ID = "66666666-6666-4666-8666-666666666666";
const JOB_ID = "77777777-7777-4777-8777-777777777777";

function buildJob(payload: Record<string, unknown>): ClaimedJob {
  return {
    id: JOB_ID,
    tenant_id: MANDANT_TENANT_ID,
    job_type: "lead_push_retry",
    payload,
    created_at: new Date().toISOString(),
  };
}

function happyTablesProgram(auditStatus: string) {
  return {
    lead_push_audit: {
      select: () => ({
        data: { id: AUDIT_ID, consent_id: CONSENT_ID, status: auditStatus },
        error: null,
      }),
      update: () => ({ data: null, error: null }),
    },
    lead_push_consent: {
      select: () => ({
        data: {
          id: CONSENT_ID,
          capture_session_id: CAPTURE_ID,
          mandant_user_id: MANDANT_USER_ID,
          mandant_tenant_id: MANDANT_TENANT_ID,
          partner_tenant_id: PARTNER_TENANT_ID,
        },
        error: null,
      }),
    },
    profiles: {
      select: () => ({ data: { id: MANDANT_USER_ID, email: "m@example.com" }, error: null }),
    },
    partner_organization: {
      select: () => ({ data: { display_name: "Partner-Org" }, error: null }),
    },
    block_diagnosis: {
      select: () => ({ data: [], error: null }),
    },
    ai_jobs: {
      insert: () => ({ data: null, error: null }),
    },
  } as Record<string, MockTableProgram>;
}

function happyAuthProgram() {
  return {
    getUserById: () => ({
      data: {
        user: {
          id: MANDANT_USER_ID,
          email: "m@example.com",
          user_metadata: { first_name: "Max", last_name: "Mandant" },
        },
      },
      error: null,
    }),
  };
}

describe("handleLeadPushRetryJob — V6 SLC-106 MT-6", () => {
  it("Test 1 — Happy (Attempt 2 success): pushFn.ok → audit success, KEIN neuer ai_jobs", async () => {
    const tables = happyTablesProgram("pending");
    const { adminClient, calls } = makeMockAdminClient({
      tables,
      auth: happyAuthProgram(),
    });

    const pushFn = vi.fn(
      async (_p: LeadIntakePayload): Promise<LeadIntakeResponse> => ({
        ok: true,
        contact_id: "00000000-0000-0000-0000-0000000000a1",
        was_new: true,
      }),
    );

    await executeLeadPushRetry(
      buildJob({
        audit_id: AUDIT_ID,
        attempt: 2,
        scheduled_at: new Date().toISOString(),
      }),
      {
        adminClient: adminClient as unknown as HandleLeadPushRetryDeps["adminClient"],
        pushFn,
      },
    );

    expect(pushFn).toHaveBeenCalledTimes(1);
    const lead = pushFn.mock.calls[0][0];
    expect(lead.first_name).toBe("Max");
    expect(lead.last_name).toBe("Mandant");
    expect(lead.email).toBe("m@example.com");
    expect(lead.utm_source).toBe(`partner_${PARTNER_TENANT_ID}`);
    expect(lead.utm_campaign).toBe("partner_diagnostic_v1");
    expect(lead.utm_medium).toBe("referral");

    // Audit auf success geupdated
    const auditUpdate = calls.find(
      (c) => c.table === "lead_push_audit" && c.op === "update",
    );
    expect(auditUpdate).toBeDefined();
    const upPayload = auditUpdate!.payload as Record<string, unknown>;
    expect(upPayload.status).toBe("success");
    expect(upPayload.attempt_number).toBe(2);
    expect(upPayload.business_system_contact_id).toBe(
      "00000000-0000-0000-0000-0000000000a1",
    );
    expect(upPayload.business_system_was_new).toBe(true);

    // KEIN neuer ai_jobs Retry
    const enqueue = calls.find(
      (c) => c.table === "ai_jobs" && c.op === "insert",
    );
    expect(enqueue).toBeUndefined();

    // rpc_complete_ai_job aufgerufen
    expect(adminClient.rpc).toHaveBeenCalledWith("rpc_complete_ai_job", {
      p_job_id: JOB_ID,
    });
  });

  it("Test 2 — Retry-2 (Attempt 2 fail): markAuditFailed + enqueue Attempt 3 mit 30min Backoff", async () => {
    const tables = happyTablesProgram("pending");
    const { adminClient, calls } = makeMockAdminClient({
      tables,
      auth: happyAuthProgram(),
    });

    const pushFn = vi.fn(
      async (_p: LeadIntakePayload): Promise<LeadIntakeResponse> => ({
        ok: false,
        error: "HTTP 500",
      }),
    );

    const fixedNow = new Date("2026-05-14T10:00:00.000Z").getTime();
    await executeLeadPushRetry(
      buildJob({
        audit_id: AUDIT_ID,
        attempt: 2,
        scheduled_at: new Date(fixedNow).toISOString(),
      }),
      {
        adminClient: adminClient as unknown as HandleLeadPushRetryDeps["adminClient"],
        pushFn,
        now: () => fixedNow,
      },
    );

    // Audit auf failed (mit error_message)
    const auditUpdate = calls.find(
      (c) => c.table === "lead_push_audit" && c.op === "update",
    );
    expect(auditUpdate).toBeDefined();
    const upPayload = auditUpdate!.payload as Record<string, unknown>;
    expect(upPayload.status).toBe("failed");
    expect(upPayload.attempt_number).toBe(2);
    expect(upPayload.error_message).toBe("HTTP 500");

    // ai_jobs.insert mit Attempt 3 + scheduled_at + 30min
    const enqueue = calls.find(
      (c) => c.table === "ai_jobs" && c.op === "insert",
    );
    expect(enqueue).toBeDefined();
    const enqueuePayload = enqueue!.payload as Record<string, unknown>;
    expect(enqueuePayload.job_type).toBe("lead_push_retry");
    expect(enqueuePayload.tenant_id).toBe(MANDANT_TENANT_ID);
    expect(enqueuePayload.status).toBe("pending");
    const subPayload = enqueuePayload.payload as Record<string, unknown>;
    expect(subPayload.audit_id).toBe(AUDIT_ID);
    expect(subPayload.attempt).toBe(3);
    expect(new Date(subPayload.scheduled_at as string).getTime()).toBe(
      fixedNow + 30 * 60 * 1000,
    );
  });

  it("Test 3 — Retry-3 (Attempt 3 fail): markAuditFailed final, KEIN neuer ai_jobs", async () => {
    const tables = happyTablesProgram("pending");
    const { adminClient, calls } = makeMockAdminClient({
      tables,
      auth: happyAuthProgram(),
    });

    const pushFn = vi.fn(
      async (_p: LeadIntakePayload): Promise<LeadIntakeResponse> => ({
        ok: false,
        error: "Timeout (10s)",
      }),
    );

    await executeLeadPushRetry(
      buildJob({
        audit_id: AUDIT_ID,
        attempt: 3,
        scheduled_at: new Date().toISOString(),
      }),
      {
        adminClient: adminClient as unknown as HandleLeadPushRetryDeps["adminClient"],
        pushFn,
      },
    );

    // Audit final failed
    const auditUpdate = calls.find(
      (c) => c.table === "lead_push_audit" && c.op === "update",
    );
    expect(auditUpdate).toBeDefined();
    const upPayload = auditUpdate!.payload as Record<string, unknown>;
    expect(upPayload.status).toBe("failed");
    expect(upPayload.attempt_number).toBe(3);
    expect(upPayload.error_message).toBe("Timeout (10s)");

    // KEIN neuer ai_jobs
    const enqueue = calls.find(
      (c) => c.table === "ai_jobs" && c.op === "insert",
    );
    expect(enqueue).toBeUndefined();

    // rpc_complete_ai_job aufgerufen
    expect(adminClient.rpc).toHaveBeenCalledWith("rpc_complete_ai_job", {
      p_job_id: JOB_ID,
    });
  });

  it("Test 4 — Max-Attempts (Attempt 4 darf nicht passieren): Safety-Branch, markAuditFailed ohne Push", async () => {
    const tables = happyTablesProgram("pending");
    const { adminClient, calls } = makeMockAdminClient({
      tables,
      auth: happyAuthProgram(),
    });

    const pushFn = vi.fn(
      async (): Promise<LeadIntakeResponse> => ({
        ok: true,
        contact_id: "should-not-be-called",
        was_new: false,
      }),
    );

    await executeLeadPushRetry(
      buildJob({
        audit_id: AUDIT_ID,
        attempt: 4,
        scheduled_at: new Date().toISOString(),
      }),
      {
        adminClient: adminClient as unknown as HandleLeadPushRetryDeps["adminClient"],
        pushFn,
      },
    );

    // pushFn NIE aufgerufen
    expect(pushFn).not.toHaveBeenCalled();

    // Audit markiert failed mit max_attempts_exceeded; attempt_number auf MAX=3 gecapped
    const auditUpdate = calls.find(
      (c) => c.table === "lead_push_audit" && c.op === "update",
    );
    expect(auditUpdate).toBeDefined();
    const upPayload = auditUpdate!.payload as Record<string, unknown>;
    expect(upPayload.status).toBe("failed");
    expect(upPayload.attempt_number).toBe(3);
    expect(upPayload.error_message).toBe("max_attempts_exceeded");

    // KEIN neuer ai_jobs
    const enqueue = calls.find(
      (c) => c.table === "ai_jobs" && c.op === "insert",
    );
    expect(enqueue).toBeUndefined();

    // Job sauber completed
    expect(adminClient.rpc).toHaveBeenCalledWith("rpc_complete_ai_job", {
      p_job_id: JOB_ID,
    });
  });

  it("Test 5 — Backoff-Schedule-Verify: nextBackoffMs(1)=5min, nextBackoffMs(2)=30min (DEC-112)", () => {
    expect(nextBackoffMs(1)).toBe(5 * 60 * 1000);
    expect(nextBackoffMs(2)).toBe(30 * 60 * 1000);
    // Attempt 3 wuerde nicht enqueued (Final-Fail-Branch), aber Helper liefert
    // dennoch 30min als "naechster waere ..." — deterministisch nach Spec.
    expect(nextBackoffMs(3)).toBe(30 * 60 * 1000);
  });
});

describe("handleLeadPushRetryJob — Idempotenz", () => {
  it("audit.status='success' → skip ohne pushFn-Aufruf, Job completed", async () => {
    const tables = happyTablesProgram("success");
    const { adminClient, calls } = makeMockAdminClient({
      tables,
      auth: happyAuthProgram(),
    });
    const pushFn = vi.fn();

    await executeLeadPushRetry(
      buildJob({
        audit_id: AUDIT_ID,
        attempt: 2,
        scheduled_at: new Date().toISOString(),
      }),
      {
        adminClient: adminClient as unknown as HandleLeadPushRetryDeps["adminClient"],
        pushFn,
      },
    );

    expect(pushFn).not.toHaveBeenCalled();
    const auditUpdate = calls.find(
      (c) => c.table === "lead_push_audit" && c.op === "update",
    );
    expect(auditUpdate).toBeUndefined();
    expect(adminClient.rpc).toHaveBeenCalledWith("rpc_complete_ai_job", {
      p_job_id: JOB_ID,
    });
  });
});
