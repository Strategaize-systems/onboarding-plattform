import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureWarning, captureInfo, captureException } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SLC-074 MT-3 — Cleanup-Cron fuer V5 Option 2 walkthrough_session.
//
// Drei Cleanup-Pfade pro Run:
//   1) rejected age > 30d        → Storage-Delete + DB-Delete
//   2) failed age > 7d           → Storage-Delete + DB-Delete
//   3) stale-pipeline > 1h       → status='failed' + error_log (kein
//      Storage-Delete, weil das File zur Forensik bleiben soll)
//
// Pattern uebernommen aus BL-076 (Cross-Day-Idempotenz):
// "skip wenn schon erledigt" — Stale-Pipeline-Recovery setzt status='failed',
// danach faellt der Eintrag in den failed-Pfad und wird nach 7d geloescht.
// Doppellauf am gleichen Tag findet die schon-recovered-Sessions in 'failed'
// statt 'transcribing' → idempotent.

export const STALE_PIPELINE_THRESHOLD_MS = 60 * 60 * 1000; // 1h
export const STALE_PIPELINE_STAGES = [
  "transcribing",
  "redacting",
  "extracting",
  "mapping",
] as const;

const REJECTED_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FAILED_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface CleanupResult {
  ok: true;
  rejected_count: number;
  failed_count: number;
  stale_pipeline_count: number;
}

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    captureWarning("CRON_SECRET ENV missing — cron endpoint disabled", {
      source: "cron:walkthrough-cleanup",
    });
    return new NextResponse("Cron not configured", { status: 503 });
  }

  if (secret !== expected) {
    captureWarning("cron auth fail", {
      source: "cron:walkthrough-cleanup",
      metadata: { reason: "x-cron-secret mismatch" },
    });
    return new NextResponse("Unauthorized", { status: 403 });
  }

  try {
    const supabase = createAdminClient();
    const now = Date.now();
    const rejectedCutoff = new Date(now - REJECTED_AGE_MS).toISOString();
    const failedCutoff = new Date(now - FAILED_AGE_MS).toISOString();
    const staleCutoff = new Date(now - STALE_PIPELINE_THRESHOLD_MS).toISOString();

    // 1. Rejected age > 30d → Storage + DB delete
    const { data: rejectedRows, error: rejErr } = await supabase
      .from("walkthrough_session")
      .select("id, storage_path, storage_bucket")
      .eq("status", "rejected")
      .lt("reviewed_at", rejectedCutoff);
    if (rejErr) {
      throw new Error(`rejected query failed: ${rejErr.message}`);
    }

    let rejected_count = 0;
    for (const row of (rejectedRows ?? []) as Array<{
      id: string;
      storage_path: string | null;
      storage_bucket: string | null;
    }>) {
      if (row.storage_path) {
        await supabase.storage
          .from(row.storage_bucket ?? "walkthroughs")
          .remove([row.storage_path]);
      }
      const { error: delErr } = await supabase
        .from("walkthrough_session")
        .delete()
        .eq("id", row.id);
      if (!delErr) rejected_count++;
    }

    // 2. Failed age > 7d → Storage + DB delete
    const { data: failedRows, error: failErr } = await supabase
      .from("walkthrough_session")
      .select("id, storage_path, storage_bucket")
      .eq("status", "failed")
      .lt("created_at", failedCutoff);
    if (failErr) {
      throw new Error(`failed query failed: ${failErr.message}`);
    }

    let failed_count = 0;
    for (const row of (failedRows ?? []) as Array<{
      id: string;
      storage_path: string | null;
      storage_bucket: string | null;
    }>) {
      if (row.storage_path) {
        await supabase.storage
          .from(row.storage_bucket ?? "walkthroughs")
          .remove([row.storage_path]);
      }
      const { error: delErr } = await supabase
        .from("walkthrough_session")
        .delete()
        .eq("id", row.id);
      if (!delErr) failed_count++;
    }

    // 3. Stale pipeline > 1h → mark as failed (forensic file stays)
    const { data: staleRows, error: staleErr } = await supabase
      .from("walkthrough_session")
      .select("id, status")
      .in("status", [...STALE_PIPELINE_STAGES])
      .lt("updated_at", staleCutoff);
    if (staleErr) {
      throw new Error(`stale pipeline query failed: ${staleErr.message}`);
    }

    let stale_pipeline_count = 0;
    for (const row of (staleRows ?? []) as Array<{ id: string; status: string }>) {
      const { error: upErr } = await supabase
        .from("walkthrough_session")
        .update({ status: "failed" })
        .eq("id", row.id);
      if (upErr) continue;

      captureWarning("walkthrough pipeline stale-recovery → failed", {
        source: "cron:walkthrough-cleanup",
        metadata: {
          category: "walkthrough_pipeline_failure",
          walkthrough_session_id: row.id,
          stage: row.status,
          recovery_reason: "stale_pipeline",
          threshold_ms: STALE_PIPELINE_THRESHOLD_MS,
        },
      });
      stale_pipeline_count++;
    }

    captureInfo("cron walkthrough-cleanup run", {
      source: "cron:walkthrough-cleanup",
      metadata: {
        category: "walkthrough_cleanup",
        rejected_count,
        failed_count,
        stale_pipeline_count,
      },
    });

    const result: CleanupResult = {
      ok: true,
      rejected_count,
      failed_count,
      stale_pipeline_count,
    };
    return NextResponse.json(result);
  } catch (e) {
    captureException(e, { source: "cron:walkthrough-cleanup" });
    return new NextResponse("Internal Error", { status: 500 });
  }
}
