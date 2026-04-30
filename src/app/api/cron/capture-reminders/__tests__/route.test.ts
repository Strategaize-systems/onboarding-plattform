import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  captureWarning: vi.fn(),
  captureInfo: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("admin client must not be constructed in unit tests");
  },
}));

import {
  processReminders,
  type ReminderCandidate,
  type ReminderStore,
} from "@/lib/reminders/process-reminders";
import { POST } from "../route";

function makeStore(args: {
  candidates: ReminderCandidate[];
  alreadyLogged?: Array<{ user_id: string; stage: "stage1" | "stage2"; date: string }>;
}): ReminderStore & { inserted: Array<{ key: string; status: string }> } {
  const seen = new Set(
    (args.alreadyLogged ?? []).map((r) => `${r.user_id}:${r.stage}:${r.date}`)
  );
  const inserted: Array<{ key: string; status: string }> = [];
  return {
    async loadCandidates() {
      return args.candidates;
    },
    async insertLog(row) {
      const key = `${row.employee_user_id}:${row.reminder_stage}:${row.sent_date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      inserted.push({ key, status: row.status });
      return true;
    },
    async updateLogStatus() {
      // no-op for tests
    },
    inserted,
  };
}

const NOW = new Date("2026-04-30T09:00:00Z"); // Thursday
function daysAgo(workdays: number): string {
  // accepted_at = NOW - <workdays>*calendar-days, rough but good enough
  // for fixed-week test cases. We use carefully chosen Mondays.
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - workdays);
  return d.toISOString();
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://onboarding.strategaizetransition.com";
  process.env.SMTP_FROM = "noreply@strategaizetransition.com";
});

describe("processReminders — Stage selection + Idempotency", () => {
  it("triggers a stage-1 reminder after 3 workdays", async () => {
    // accepted_at = Mon W1, NOW = Thu W1 → 3 workdays
    const acceptedAt = new Date("2026-04-27T09:00:00Z").toISOString();
    const candidate: ReminderCandidate = {
      user_id: "u1",
      email: "u1@example.com",
      tenant_id: "t1",
      tenant_name: "Acme",
      accepted_at: acceptedAt,
      reminders_opt_out: false,
      unsubscribe_token: "tok-u1",
    };
    const store = makeStore({ candidates: [candidate] });
    // mock SMTP transport
    const sendMail = vi.fn().mockResolvedValue({});
    const result = await processReminders({
      store,
      transport: { sendMail },
      captureUrl: "https://onboarding.strategaizetransition.com/dashboard",
      now: NOW,
    });
    expect(result.stage1_sent).toBe(1);
    expect(result.stage2_sent).toBe(0);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].subject).toContain("Erinnerung");
    expect(store.inserted[0]?.status).toBe("sent");
  });

  it("triggers a stage-2 reminder after 7 workdays", async () => {
    // accepted_at = Mon two weeks back, NOW = Wed W2 → ~7 workdays
    const acceptedAt = new Date("2026-04-20T09:00:00Z").toISOString();
    const stage2Now = new Date("2026-04-29T09:00:00Z"); // Wed of 2nd week
    const candidate: ReminderCandidate = {
      user_id: "u2",
      email: "u2@example.com",
      tenant_id: "t1",
      tenant_name: "Acme",
      accepted_at: acceptedAt,
      reminders_opt_out: false,
      unsubscribe_token: "tok-u2",
    };
    const store = makeStore({ candidates: [candidate] });
    const sendMail = vi.fn().mockResolvedValue({});
    const result = await processReminders({
      store,
      transport: { sendMail },
      captureUrl: "https://onboarding.strategaizetransition.com/dashboard",
      now: stage2Now,
    });
    expect(result.stage2_sent).toBe(1);
    expect(result.stage1_sent).toBe(0);
    expect(sendMail.mock.calls[0][0].subject).toContain("Letzte Erinnerung");
  });

  it("skips opt-out users with status='skipped_opt_out' and does not send", async () => {
    const acceptedAt = new Date("2026-04-27T09:00:00Z").toISOString();
    const candidate: ReminderCandidate = {
      user_id: "u3",
      email: "u3@example.com",
      tenant_id: "t1",
      tenant_name: "Acme",
      accepted_at: acceptedAt,
      reminders_opt_out: true,
      unsubscribe_token: "tok-u3",
    };
    const store = makeStore({ candidates: [candidate] });
    const sendMail = vi.fn().mockResolvedValue({});
    const result = await processReminders({
      store,
      transport: { sendMail },
      captureUrl: "https://onboarding.strategaizetransition.com/dashboard",
      now: NOW,
    });
    expect(result.skipped_opt_out).toBe(1);
    expect(result.stage1_sent).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
    expect(store.inserted[0]?.status).toBe("skipped_opt_out");
  });

  it("PFLICHT-Test: two cron runs on the same day produce 0 duplicate mails (Idempotency, SC-V4.2-12)", async () => {
    const acceptedAt = new Date("2026-04-27T09:00:00Z").toISOString();
    const candidate: ReminderCandidate = {
      user_id: "u-idem",
      email: "u-idem@example.com",
      tenant_id: "t1",
      tenant_name: "Acme",
      accepted_at: acceptedAt,
      reminders_opt_out: false,
      unsubscribe_token: "tok-idem",
    };
    const store = makeStore({ candidates: [candidate] });
    const sendMail = vi.fn().mockResolvedValue({});

    // First run: should send.
    const r1 = await processReminders({
      store,
      transport: { sendMail },
      captureUrl: "https://onboarding.strategaizetransition.com/dashboard",
      now: NOW,
    });
    // Second run on the same day: should NOT send again (idempotency).
    const r2 = await processReminders({
      store,
      transport: { sendMail },
      captureUrl: "https://onboarding.strategaizetransition.com/dashboard",
      now: NOW,
    });

    expect(r1.stage1_sent).toBe(1);
    expect(r2.stage1_sent).toBe(0);
    expect(r2.skipped_already_sent).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1); // <- the gate
  });
});

describe("POST /api/cron/capture-reminders — Auth", () => {
  it("returns 503 when CRON_SECRET ENV is missing", async () => {
    delete process.env.CRON_SECRET;
    const req = new Request("http://localhost/api/cron/capture-reminders", {
      method: "POST",
      headers: { "x-cron-secret": "anything" },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("returns 403 when x-cron-secret header is missing or wrong", async () => {
    process.env.CRON_SECRET = "test-secret";
    const req = new Request("http://localhost/api/cron/capture-reminders", {
      method: "POST",
      headers: { "x-cron-secret": "wrong" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
