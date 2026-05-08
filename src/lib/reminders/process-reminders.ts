import { workdaysSince } from "./workdays";
import { sendReminder, type ReminderStage, type ReminderTransport } from "./send-reminder";

export interface ReminderCandidate {
  user_id: string;
  email: string;
  tenant_id: string;
  tenant_name: string;
  accepted_at: string;
  reminders_opt_out: boolean;
  unsubscribe_token: string;
  // Stages that already have a status='sent' log entry for this user
  // (regardless of date). Cross-day idempotency: prevents Stage1 spam
  // across consecutive days when workdays-since stays in [3, 7).
  // Optional for backwards-compat with older callers; treated as [] if absent.
  already_sent_stages?: ReminderStage[];
}

export interface ReminderLogRow {
  employee_user_id: string;
  tenant_id: string;
  reminder_stage: ReminderStage;
  sent_date: string;
  email_to: string;
  status: "sent" | "failed" | "skipped_opt_out";
  error_message?: string | null;
}

export interface ReminderStore {
  loadCandidates(): Promise<ReminderCandidate[]>;
  // Returns true if the row was newly inserted (no UNIQUE conflict).
  insertLog(row: ReminderLogRow): Promise<boolean>;
  updateLogStatus(args: {
    employee_user_id: string;
    reminder_stage: ReminderStage;
    sent_date: string;
    status: "sent" | "failed";
    error_message?: string | null;
  }): Promise<void>;
}

export interface ProcessResult {
  stage1_sent: number;
  stage2_sent: number;
  skipped_opt_out: number;
  skipped_already_sent: number;
  failed: number;
  errors: Array<{ user_id: string; stage: ReminderStage; error: string }>;
}

function pickStage(
  acceptedAt: string,
  now: Date = new Date()
): ReminderStage | null {
  const start = new Date(acceptedAt);
  const workdays = workdaysSince(start, now);
  if (workdays >= 14) return null; // max. 2 Stufen — danach Resignation
  if (workdays >= 7) return "stage2";
  if (workdays >= 3) return "stage1";
  return null;
}

function todayUtcDate(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export interface ProcessOptions {
  store: ReminderStore;
  transport?: ReminderTransport;
  captureUrl: string;
  now?: Date;
}

export async function processReminders(opts: ProcessOptions): Promise<ProcessResult> {
  const result: ProcessResult = {
    stage1_sent: 0,
    stage2_sent: 0,
    skipped_opt_out: 0,
    skipped_already_sent: 0,
    failed: 0,
    errors: [],
  };

  const now = opts.now ?? new Date();
  const sentDate = todayUtcDate(now);
  const candidates = await opts.store.loadCandidates();

  for (const c of candidates) {
    const stage = pickStage(c.accepted_at, now);
    if (!stage) continue;

    // Cross-day idempotency: ISSUE-035 / BL-076.
    // pickStage returns "stage1" for any workday in [3, 7), so without this
    // guard the cron would resend Stage1 every day from W3 to W6. The
    // (user, stage, sent_date) UNIQUE-constraint only blocks same-day dupes.
    if ((c.already_sent_stages ?? []).includes(stage)) {
      result.skipped_already_sent++;
      continue;
    }

    if (c.reminders_opt_out) {
      // Idempotent log: if already logged today, ON CONFLICT keeps it as is.
      await opts.store.insertLog({
        employee_user_id: c.user_id,
        tenant_id: c.tenant_id,
        reminder_stage: stage,
        sent_date: sentDate,
        email_to: c.email,
        status: "skipped_opt_out",
      });
      result.skipped_opt_out++;
      continue;
    }

    // Idempotency: claim the slot first. If a row already exists for
    // (user, stage, date), insertLog returns false and we skip the send.
    const claimed = await opts.store.insertLog({
      employee_user_id: c.user_id,
      tenant_id: c.tenant_id,
      reminder_stage: stage,
      sent_date: sentDate,
      email_to: c.email,
      status: "sent",
    });

    if (!claimed) {
      result.skipped_already_sent++;
      continue;
    }

    const send = await sendReminder(
      {
        to: c.email,
        tenantName: c.tenant_name,
        stage,
        unsubscribeToken: c.unsubscribe_token,
        captureUrl: opts.captureUrl,
      },
      opts.transport
    );

    if (send.ok) {
      if (stage === "stage1") result.stage1_sent++;
      else result.stage2_sent++;
    } else {
      await opts.store.updateLogStatus({
        employee_user_id: c.user_id,
        reminder_stage: stage,
        sent_date: sentDate,
        status: "failed",
        error_message: send.error ?? "unknown",
      });
      result.failed++;
      result.errors.push({
        user_id: c.user_id,
        stage,
        error: send.error ?? "unknown",
      });
    }
  }

  return result;
}
