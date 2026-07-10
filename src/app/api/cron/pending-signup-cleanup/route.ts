// V7 SLC-135 MT-1 — Cleanup-Cron fuer pending_signup TTL + DSGVO-Datensparsamkeit.
//
// Pattern reused aus src/app/api/cron/walkthrough-cleanup/route.ts (V5 SLC-074)
// + src/app/api/cron/capture-reminders/route.ts (V4.2). DEC-059 Coolify-Cron-Pattern,
// DEC-131 Pending-TTL 24h + Cleanup hourly, FEAT-053 Operational-Anteil.
//
// Zwei Cleanup-Pfade pro Run:
//   1) status='pending' + expires_at < now()                  → status='expired'
//   2) status='expired' + verified_at IS NULL + created_at < 7d → DELETE
//
// Trigger via Coolify-Scheduled-Task `pending-signup-cleanup-hourly` (0 * * * *)
// gegen GET http://localhost:3000/api/cron/pending-signup-cleanup mit Header
// `x-cron-secret: $CRON_SECRET`. fetch() default-Method = GET → Coolify-Cron
// nutzt `node -e fetch(...)`-Pattern (siehe Memory feedback_coolify_cron_node).
//
// Audit-Log via captureInfo() → error_log mit category='pending_signup_cleanup'.
// Idempotent: zweiter Aufruf im selben Stundenfenster ist Safe-No-Op (Filter
// auf status/timestamp greift wiederholt korrekt, Counts → 0).

import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth/cron-secret";

import { createAdminClient } from "@/lib/supabase/admin";
import { captureException, captureInfo, captureWarning } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DELETE_AGE_DAYS = 7;

export async function GET(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    captureWarning("CRON_SECRET ENV missing — cron endpoint disabled", {
      source: "cron:pending-signup-cleanup",
    });
    return new NextResponse("Cron not configured", { status: 503 });
  }

  if (!verifyCronSecret(secret, expected)) {
    captureWarning("cron auth fail", {
      source: "cron:pending-signup-cleanup",
      metadata: { reason: "x-cron-secret mismatch" },
    });
    return new NextResponse("Unauthorized", { status: 403 });
  }

  try {
    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();
    const deleteCutoffIso = new Date(
      Date.now() - DELETE_AGE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // Schritt 1: pending + expires_at < now() → status='expired'.
    // .select("id") returnt die geupdateten Rows, daher exakte Count-Bestimmung
    // ohne separate count()-Query (PostgREST liefert null fuer count auf
    // update-Verb wenn kein `Prefer: count=` Header gesetzt ist).
    const { data: expiredRows, error: expErr } = await supabase
      .from("pending_signup")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("expires_at", nowIso)
      .select("id");

    if (expErr) {
      throw new Error(`pending→expired update failed: ${expErr.message}`);
    }
    const expired_count = expiredRows?.length ?? 0;

    // Schritt 2: expired + verified_at NULL + created_at < 7d → DELETE.
    const { data: deletedRows, error: delErr } = await supabase
      .from("pending_signup")
      .delete()
      .eq("status", "expired")
      .is("verified_at", null)
      .lt("created_at", deleteCutoffIso)
      .select("id");

    if (delErr) {
      throw new Error(`expired→delete failed: ${delErr.message}`);
    }
    const deleted_count = deletedRows?.length ?? 0;

    captureInfo("cron pending-signup-cleanup run", {
      source: "cron:pending-signup-cleanup",
      metadata: {
        category: "pending_signup_cleanup",
        expired_count,
        deleted_count,
      },
    });

    return NextResponse.json(
      { ok: true, expired_count, deleted_count },
      { status: 200 }
    );
  } catch (e) {
    captureException(e, { source: "cron:pending-signup-cleanup" });
    return new NextResponse("Internal Error", { status: 500 });
  }
}
