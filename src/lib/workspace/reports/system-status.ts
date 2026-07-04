// SLC-183 MT-1 (OP V10.2) — Report #4: System-Status (cross-Mandant).
//
// Betriebs-Ampel: ai_jobs mit status in ('running','failed') (Counts + juengste
// Beispiele) plus error_log der letzten 24h (Count + juengste Beispiele).

import type { SupabaseClient } from "@supabase/supabase-js";

const JOB_SAMPLE = 10;
const ERROR_SAMPLE = 10;

export interface SystemStatusJob {
  job_type: string | null;
  status: string | null;
  error: string | null;
  created_at: string | null;
}

export interface SystemStatusError {
  source: string | null;
  level: string | null;
  message: string | null;
  created_at: string | null;
}

export interface SystemStatusReport {
  key: "system_status";
  running_jobs_count: number;
  failed_jobs_count: number;
  latest_jobs: SystemStatusJob[];
  errors_last_24h_count: number;
  latest_errors: SystemStatusError[];
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

export async function loadSystemStatus(
  admin: SupabaseClient,
): Promise<SystemStatusReport> {
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [jobsRes, errorsRes] = await Promise.all([
    admin
      .from("ai_jobs")
      .select("job_type, status, error, created_at")
      .in("status", ["running", "failed"])
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("error_log")
      .select("source, level, message, created_at")
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const jobs = jobsRes.data ?? [];
  let runningCount = 0;
  let failedCount = 0;
  const latestJobs: SystemStatusJob[] = [];
  for (const j of jobs) {
    const status = asString((j as { status?: unknown }).status);
    if (status === "running") runningCount += 1;
    else if (status === "failed") failedCount += 1;
    if (latestJobs.length < JOB_SAMPLE) {
      latestJobs.push({
        job_type: asString((j as { job_type?: unknown }).job_type),
        status,
        error: asString((j as { error?: unknown }).error),
        created_at: asString((j as { created_at?: unknown }).created_at),
      });
    }
  }

  const errors = errorsRes.data ?? [];
  const latestErrors: SystemStatusError[] = [];
  for (const e of errors) {
    if (latestErrors.length >= ERROR_SAMPLE) break;
    latestErrors.push({
      source: asString((e as { source?: unknown }).source),
      level: asString((e as { level?: unknown }).level),
      message: asString((e as { message?: unknown }).message),
      created_at: asString((e as { created_at?: unknown }).created_at),
    });
  }

  return {
    key: "system_status",
    running_jobs_count: runningCount,
    failed_jobs_count: failedCount,
    latest_jobs: latestJobs,
    errors_last_24h_count: errors.length,
    latest_errors: latestErrors,
  };
}
