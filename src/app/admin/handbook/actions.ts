"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * SLC-040 MT-1 — tenant_admin Server-Action fuer Handbuch-Snapshot-Trigger.
 *
 * triggerHandbookSnapshot:
 *   - Auth + tenant_admin/strategaize_admin Check.
 *   - rpc_trigger_handbook_snapshot(p_capture_session_id) -> {handbook_snapshot_id}
 *   - revalidate /admin/handbook und /dashboard (Cockpit zeigt lastHandbookSnapshot).
 *
 * Download laeuft NICHT ueber eine Server-Action sondern ueber die API-Proxy-Route
 * /api/handbook/[snapshotId]/download (siehe IMP-166: Self-Hosted Public-Storage
 * Proxy-Pattern; vermeidet ISSUE-025 Signed-URL-apikey-Workaround).
 */

type ActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TriggerHandbookOptions {
  /** SLC-042: Audit der Quality-Gate-Werte zum Zeitpunkt des Triggers (DEC-045 weiches Gate). */
  reviewAudit?: {
    pendingAtTrigger: number;
    approvedCount: number;
    rejectedCount: number;
    totalEmployeeBlocks: number;
  };
}

export async function triggerHandbookSnapshot(
  captureSessionId: string,
  options?: TriggerHandbookOptions,
): Promise<ActionResult<{ handbookSnapshotId: string }>> {
  if (!captureSessionId || !UUID_RE.test(captureSessionId)) {
    return { ok: false, error: "capture_session_id_invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile || !["tenant_admin", "strategaize_admin"].includes(profile.role)) {
    return { ok: false, error: "forbidden" };
  }

  const { data, error } = await supabase.rpc("rpc_trigger_handbook_snapshot", {
    p_capture_session_id: captureSessionId,
  });

  if (error) {
    const { captureException } = await import("@/lib/logger");
    captureException(new Error(error.message), {
      source: "admin/handbook/triggerHandbookSnapshot",
    });
    return { ok: false, error: "rpc_failed" };
  }

  const result = data as Record<string, unknown> | null;
  if (!result || typeof result.error === "string") {
    return { ok: false, error: (result?.error as string) ?? "unknown_error" };
  }

  const handbookSnapshotId = result.handbook_snapshot_id;
  if (typeof handbookSnapshotId !== "string") {
    return { ok: false, error: "rpc_invalid_response" };
  }

  // SLC-042 D — Audit-Log der Quality-Gate-Werte (DEC-045 weiches Gate)
  if (options?.reviewAudit) {
    const { captureInfo } = await import("@/lib/logger");
    captureInfo("handbook_snapshot triggered with review audit", {
      source: "admin/handbook/triggerHandbookSnapshot",
      userId: user.id,
      metadata: {
        snapshot_id: handbookSnapshotId,
        capture_session_id: captureSessionId,
        pending_at_trigger: options.reviewAudit.pendingAtTrigger,
        approved_count: options.reviewAudit.approvedCount,
        rejected_count: options.reviewAudit.rejectedCount,
        total_employee_blocks: options.reviewAudit.totalEmployeeBlocks,
      },
    });
  }

  revalidatePath("/admin/handbook");
  revalidatePath("/dashboard");
  return { ok: true, handbookSnapshotId };
}
