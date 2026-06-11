// V9.1 SLC-V9.1-C MT-3 — POST /api/cron/bulk-email-retention-sweep (FEAT-078).
//
// Slice: SLC-V9.1-C / Spec MT-3. OP-x-cron-secret-Pattern (1:1 analog
// src/app/api/cron/email-bulk-pipeline-trigger/route.ts). Trigger via
// Coolify-Scheduled-Task (taeglich, 0 2 * * *) gegen
// POST .../api/cron/bulk-email-retention-sweep mit Header x-cron-secret.
// Auth: 503 (kein CRON_SECRET) / 403 (Mismatch) / 200 (Pass) / 500 (Throw) —
// OP-Standard-Codes (Spec-Wortlaut "401" auf 403 angeglichen fuer Konsistenz mit
// allen anderen OP-Cron-Endpoints).
//
// Synchron (DEC-198-Scope): der Sweep laeuft im Request (V9.1-Pilot-Volumen
// minimal); Migration auf asynchronen Worker (ai_jobs) ist V9.2+.

import { NextResponse } from "next/server";

import { captureException, captureWarning } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  runRetentionSweep,
  createRetentionStoreFromSupabase,
} from "@/workers/retention/handle-bulk-email-retention-sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOG_SOURCE = "cron:bulk-email-retention-sweep";

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    captureWarning("CRON_SECRET ENV missing — cron endpoint disabled", {
      source: LOG_SOURCE,
    });
    return new NextResponse("Cron not configured", { status: 503 });
  }

  if (secret !== expected) {
    captureWarning("cron auth fail", {
      source: LOG_SOURCE,
      metadata: { reason: "x-cron-secret mismatch" },
    });
    return new NextResponse("Unauthorized", { status: 403 });
  }

  try {
    const summary = await runRetentionSweep({
      store: createRetentionStoreFromSupabase(createAdminClient()),
    });
    return NextResponse.json({ success: true, ...summary }, { status: 200 });
  } catch (e) {
    captureException(e, { source: LOG_SOURCE });
    return new NextResponse("Internal Error", { status: 500 });
  }
}
