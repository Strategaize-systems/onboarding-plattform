// SLC-092 MT-2 — Stale-Check fuer den In-App-Reader (V5.1, FEAT-038).
//
// Vor V5.1: Stale-Trigger waren ausschliesslich block_checkpoints, die nach der
// Snapshot-Erzeugung an der GF-Capture-Session hinzukamen (V4.1 SLC-042).
//
// V5.1: zusaetzlich approved Walkthroughs des Tenants. Logik:
//   walkthrough_session.status='approved' AND reviewed_at > snapshot.created_at
//   → Reader zeigt Banner "Es gibt neuere Daten — neuen Snapshot generieren".
//
// Schema-Note: Slice-Spec sprach von `approved_at`. Die Tabelle hat aber nur
// `reviewed_at` (gesetzt beim approve UND reject — semantisch korrekt fuer
// `status='approved'`-Filter, weil rejected-Sessions ueber den Status-Filter
// ohnehin draussen bleiben).
//
// Tenant-weit (nicht GF-Session-weit), weil approved Walkthroughs in Mitarbeiter-
// Sessions liegen koennen — analog zur ISSUE-029-Loesung in
// `lib/handbook/get-review-summary.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface StaleCheckSnapshot {
  capture_session_id: string;
  tenant_id: string;
  created_at: string;
}

/**
 * Liefert true, wenn nach `snapshot.created_at` mind. ein neuerer Datenpunkt
 * existiert, der einen Re-Snapshot rechtfertigt:
 *   - block_checkpoint der GF-Capture-Session (V4.1)
 *   - approved walkthrough_session des Tenants (V5.1, DEC-097)
 */
export async function checkSnapshotStale(
  adminClient: SupabaseClient,
  snapshot: StaleCheckSnapshot,
): Promise<boolean> {
  const { count: checkpointCount } = await adminClient
    .from("block_checkpoint")
    .select("id", { count: "exact", head: true })
    .eq("capture_session_id", snapshot.capture_session_id)
    .gt("created_at", snapshot.created_at);

  if ((checkpointCount ?? 0) > 0) {
    return true;
  }

  const { count: walkthroughCount } = await adminClient
    .from("walkthrough_session")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", snapshot.tenant_id)
    .eq("status", "approved")
    .gt("reviewed_at", snapshot.created_at);

  return (walkthroughCount ?? 0) > 0;
}
