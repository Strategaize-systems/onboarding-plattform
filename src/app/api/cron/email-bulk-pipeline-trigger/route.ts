// V9.1 SLC-V9.1-B MT-2 — POST /api/cron/email-bulk-pipeline-trigger.
//
// Slice: SLC-V9.1-B (FEAT-077) / Spec MT-2.
// OP-x-cron-secret-Pattern (1:1 analog src/app/api/cron/inbound-email-imap-sync/
// route.ts). Trigger via Coolify-Scheduled-Task (stuendlich, 0 * * * *) gegen
// POST .../api/cron/email-bulk-pipeline-trigger mit Header x-cron-secret.
// Auth: 503 (kein CRON_SECRET) / 403 (Mismatch) / 200 (Pass) / 500 (Throw).

import { NextResponse } from "next/server";

import { captureException, captureInfo, captureWarning } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPipelineTrigger } from "@/lib/bulk-email/pipeline-trigger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOG_SOURCE = "cron:email-bulk-pipeline-trigger";

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
    const summary = await runPipelineTrigger({
      adminClient: createAdminClient(),
    });

    captureInfo("cron email-bulk-pipeline-trigger run", {
      source: LOG_SOURCE,
      metadata: { category: "email_bulk_pipeline_trigger", ...summary },
    });

    return NextResponse.json({ success: true, ...summary }, { status: 200 });
  } catch (e) {
    captureException(e, { source: LOG_SOURCE });
    return new NextResponse("Internal Error", { status: 500 });
  }
}
