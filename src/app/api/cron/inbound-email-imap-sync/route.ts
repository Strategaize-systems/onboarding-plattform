// V9.1 SLC-V9.1-A MT-R6 — Cron-Endpoint fuer den IONOS-IMAP-Inbound-Sync.
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer + IMAP-Sync (REVISION R1)
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-R6)
//
// OP-x-cron-secret-Pattern (analog src/app/api/cron/pending-signup-cleanup/route.ts
// + capture-reminders/route.ts). Trigger via Coolify-Scheduled-Task (>=5 Min,
// R-R1-4 Overlap-Mitigation) gegen POST .../api/cron/inbound-email-imap-sync mit
// Header `x-cron-secret: $CRON_SECRET`. Audit-Log via captureInfo() -> error_log.

import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/cron-guard";

import { captureException, captureInfo } from "@/lib/logger";
import { syncInboundEmails } from "@/lib/inbound-email/imap-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LOG_SOURCE = "cron:inbound-email-imap-sync";

export async function POST(req: Request): Promise<Response> {
  const denied = requireCronSecret(req, LOG_SOURCE);
  if (denied) return denied;

  try {
    const result = await syncInboundEmails();

    captureInfo("cron inbound-email-imap-sync run", {
      source: LOG_SOURCE,
      metadata: {
        category: "inbound_email_imap_sync",
        synced: result.synced,
        skipped: result.skipped,
        errors: result.errors,
        last_uid: result.lastUid,
      },
    });

    return NextResponse.json(
      {
        success: true,
        synced: result.synced,
        skipped: result.skipped,
        errors: result.errors,
        lastUid: result.lastUid,
      },
      { status: 200 },
    );
  } catch (e) {
    captureException(e, { source: LOG_SOURCE });
    return new NextResponse("Internal Error", { status: 500 });
  }
}
