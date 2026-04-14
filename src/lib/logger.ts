// Abstracted error logging — currently writes to DB, can be swapped to Sentry later.
// To switch to Sentry: replace the logToDb() call with Sentry.captureException()

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface LogEntry {
  level: "error" | "warning" | "info";
  source: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
}

async function logToDb(entry: LogEntry): Promise<void> {
  try {
    await supabaseAdmin.from("error_log").insert({
      level: entry.level,
      source: entry.source,
      message: entry.message,
      stack: entry.stack ?? null,
      metadata: entry.metadata ?? {},
      user_id: entry.userId ?? null,
    });
  } catch (dbError) {
    // Fallback to console if DB logging fails (prevents infinite loops)
    console.error("[logger] Failed to write to error_log:", dbError);
    console.error("[logger] Original error:", entry);
  }
}

// ─── Public API (Sentry-compatible interface) ───────────────────────────

export function captureException(
  error: Error | unknown,
  context?: { source?: string; userId?: string; metadata?: Record<string, unknown> }
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const entry: LogEntry = {
    level: "error",
    source: context?.source ?? "unknown",
    message: err.message,
    stack: err.stack,
    metadata: context?.metadata,
    userId: context?.userId,
  };

  // Log to console (always, for container logs)
  console.error(`[${entry.source}] ${entry.message}`);

  // Log to DB (async, non-blocking)
  logToDb(entry).catch(() => {});

  // Send email notification for errors (async, non-blocking)
  import("@/lib/email")
    .then(({ sendErrorNotification }) =>
      sendErrorNotification({
        level: entry.level,
        source: entry.source,
        message: entry.message,
        stack: entry.stack,
      })
    )
    .catch(() => {});
}

export function captureWarning(
  message: string,
  context?: { source?: string; userId?: string; metadata?: Record<string, unknown> }
): void {
  const entry: LogEntry = {
    level: "warning",
    source: context?.source ?? "unknown",
    message,
    metadata: context?.metadata,
    userId: context?.userId,
  };

  console.warn(`[${entry.source}] ${message}`);
  logToDb(entry).catch(() => {});
}

export function captureInfo(
  message: string,
  context?: { source?: string; userId?: string; metadata?: Record<string, unknown> }
): void {
  const entry: LogEntry = {
    level: "info",
    source: context?.source ?? "unknown",
    message,
    metadata: context?.metadata,
    userId: context?.userId,
  };

  logToDb(entry).catch(() => {});
}
