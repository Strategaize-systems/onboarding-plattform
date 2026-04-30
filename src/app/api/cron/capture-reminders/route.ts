import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureWarning, captureInfo, captureException } from "@/lib/logger";
import {
  processReminders,
  type ReminderStore,
  type ReminderCandidate,
  type ReminderLogRow,
} from "@/lib/reminders/process-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupabaseLike = ReturnType<typeof createAdminClient>;

function buildStore(supabase: SupabaseLike): ReminderStore {
  return {
    async loadCandidates(): Promise<ReminderCandidate[]> {
      // 1. Accepted employee invitations + tenant name (PostgREST embed via FK).
      const { data: invitations, error: invErr } = await supabase
        .from("employee_invitation")
        .select(
          "accepted_user_id, email, tenant_id, accepted_at, tenants!inner(name)"
        )
        .eq("status", "accepted")
        .not("accepted_user_id", "is", null);

      if (invErr) {
        throw new Error(`loadCandidates(invitations) failed: ${invErr.message}`);
      }

      const accepted = (invitations ?? []) as Array<{
        accepted_user_id: string;
        email: string;
        tenant_id: string;
        accepted_at: string;
        tenants: { name: string } | { name: string }[];
      }>;

      if (accepted.length === 0) return [];

      const userIds = Array.from(
        new Set(accepted.map((i) => i.accepted_user_id).filter(Boolean))
      );

      // 2. Exclusion set: users that already have a block_checkpoint.
      const { data: checkpoints, error: cpErr } = await supabase
        .from("block_checkpoint")
        .select("created_by")
        .in("created_by", userIds);

      if (cpErr) {
        throw new Error(`loadCandidates(block_checkpoint) failed: ${cpErr.message}`);
      }
      const active = new Set(
        ((checkpoints ?? []) as Array<{ created_by: string }>).map((r) => r.created_by)
      );

      // 3. user_settings (opt-out + unsubscribe-token).
      const { data: settings, error: sErr } = await supabase
        .from("user_settings")
        .select("user_id, reminders_opt_out, unsubscribe_token")
        .in("user_id", userIds);

      if (sErr) {
        throw new Error(`loadCandidates(user_settings) failed: ${sErr.message}`);
      }
      const settingsMap = new Map<
        string,
        { reminders_opt_out: boolean; unsubscribe_token: string }
      >();
      for (const s of (settings ?? []) as Array<{
        user_id: string;
        reminders_opt_out: boolean;
        unsubscribe_token: string;
      }>) {
        settingsMap.set(s.user_id, {
          reminders_opt_out: s.reminders_opt_out,
          unsubscribe_token: s.unsubscribe_token,
        });
      }

      const result: ReminderCandidate[] = [];
      for (const inv of accepted) {
        if (active.has(inv.accepted_user_id)) continue; // already started
        const s = settingsMap.get(inv.accepted_user_id);
        if (!s) continue; // no settings row yet → trigger may not have run; safe-skip
        const tenantName = Array.isArray(inv.tenants)
          ? inv.tenants[0]?.name
          : inv.tenants?.name;
        result.push({
          user_id: inv.accepted_user_id,
          email: inv.email,
          tenant_id: inv.tenant_id,
          tenant_name: tenantName ?? "",
          accepted_at: inv.accepted_at,
          reminders_opt_out: s.reminders_opt_out,
          unsubscribe_token: s.unsubscribe_token,
        });
      }
      return result;
    },

    async insertLog(row: ReminderLogRow): Promise<boolean> {
      const { data, error } = await supabase
        .from("reminder_log")
        .upsert(
          {
            employee_user_id: row.employee_user_id,
            tenant_id: row.tenant_id,
            reminder_stage: row.reminder_stage,
            sent_date: row.sent_date,
            email_to: row.email_to,
            status: row.status,
            error_message: row.error_message ?? null,
          },
          {
            onConflict: "employee_user_id,reminder_stage,sent_date",
            ignoreDuplicates: true,
          }
        )
        .select("id");

      if (error) {
        throw new Error(`insertLog failed: ${error.message}`);
      }
      // ignoreDuplicates: true → empty array on conflict, [{id}] on insert.
      return Array.isArray(data) && data.length > 0;
    },

    async updateLogStatus(args): Promise<void> {
      const { error } = await supabase
        .from("reminder_log")
        .update({
          status: args.status,
          error_message: args.error_message ?? null,
        })
        .eq("employee_user_id", args.employee_user_id)
        .eq("reminder_stage", args.reminder_stage)
        .eq("sent_date", args.sent_date);

      if (error) {
        throw new Error(`updateLogStatus failed: ${error.message}`);
      }
    },
  };
}

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    captureWarning("CRON_SECRET ENV missing — cron endpoint disabled", {
      source: "cron:capture-reminders",
    });
    return new NextResponse("Cron not configured", { status: 503 });
  }

  if (secret !== expected) {
    captureWarning("cron auth fail", {
      source: "cron:capture-reminders",
      metadata: { reason: "x-cron-secret mismatch" },
    });
    return new NextResponse("Unauthorized", { status: 403 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const captureUrl = `${appUrl}/dashboard`;

  try {
    const store = buildStore(createAdminClient());
    const result = await processReminders({ store, captureUrl });

    captureInfo("cron capture-reminders run", {
      source: "cron:capture-reminders",
      metadata: {
        stage1_sent: result.stage1_sent,
        stage2_sent: result.stage2_sent,
        skipped_opt_out: result.skipped_opt_out,
        skipped_already_sent: result.skipped_already_sent,
        failed: result.failed,
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    captureException(e, { source: "cron:capture-reminders" });
    return new NextResponse("Internal Error", { status: 500 });
  }
}
