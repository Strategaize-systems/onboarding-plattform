// SLC-043 MT-1+MT-2 — Pending-Block-Reviews Liste fuer den Berater.
//
// Liefert pendende `block_review`-Rows mit Tenant-Name + Capture-Session-Submit-
// Zeitpunkt + Mitarbeiter-KU-Count pro Block. Cross-Tenant-Aggregat (ohne
// tenantId) oder Pro-Tenant-Filter (mit tenantId) — gleiche Implementierung.
//
// ORDER BY created_at ASC (oldest-first) entspricht dem Index
// `idx_block_review_status_created` aus SLC-041 MIG-028, der diese Query
// abdeckt. Sub-Sortierung bei gleichem `created_at`: nach Tenant-Name.
//
// Authorization: ist Aufrufer-Verantwortung. Die Helper verwendet `admin_client`
// (service_role), umgeht damit RLS. Beide Pages (Cross-Tenant /admin/reviews +
// Pro-Tenant /admin/tenants/[id]/reviews) gaten via Profile-Role-Check
// (strategaize_admin only) — ohne diesen Gate gibt es keinen Aufrufer.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PendingReviewRow {
  tenantId: string;
  tenantName: string;
  captureSessionId: string;
  blockKey: string;
  createdAt: string;
  /**
   * `capture_session.updated_at` der zugehoerigen Session. Best-fit fuer
   * "letzter Submit-Zeitpunkt" — die Tabelle hat keine dedizierte
   * `last_submitted_at`-Spalte; `updated_at` wird bei jedem Block-Submit
   * via Trigger hochgesetzt.
   */
  sessionUpdatedAt: string | null;
  knowledgeUnitCount: number;
}

export async function listPendingReviews(
  adminClient: SupabaseClient,
  options: { tenantId?: string } = {},
): Promise<PendingReviewRow[]> {
  // Step 1: Pending block_review-Rows mit tenants(name) + capture_session(last_submitted_at).
  let reviewQuery = adminClient
    .from("block_review")
    .select(
      "tenant_id, capture_session_id, block_key, created_at, tenants:tenants!inner(name), capture_session:capture_session(updated_at)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (options.tenantId) {
    reviewQuery = reviewQuery.eq("tenant_id", options.tenantId);
  }

  const { data: reviewRows, error: reviewErr } = await reviewQuery;
  if (reviewErr) {
    throw new Error(`listPendingReviews: ${reviewErr.message}`);
  }

  if (!reviewRows || reviewRows.length === 0) return [];

  // Step 2: KU-Counts via Single-Aggregation-Query, gruppiert in JS.
  // Wir laden alle employee_questionnaire-KUs in den betroffenen Sessions
  // und zaehlen pro (tenantId, captureSessionId, blockKey).
  const sessionIds = Array.from(
    new Set(reviewRows.map((r) => r.capture_session_id as string)),
  );

  let kuQuery = adminClient
    .from("knowledge_unit")
    .select("tenant_id, capture_session_id, block_key")
    .eq("source", "employee_questionnaire")
    .in("capture_session_id", sessionIds);

  if (options.tenantId) {
    kuQuery = kuQuery.eq("tenant_id", options.tenantId);
  }

  const { data: kuRows, error: kuErr } = await kuQuery;
  if (kuErr) {
    throw new Error(`listPendingReviews KU-Count: ${kuErr.message}`);
  }

  const kuCountByKey = new Map<string, number>();
  for (const ku of kuRows ?? []) {
    const key = `${ku.tenant_id}|${ku.capture_session_id}|${ku.block_key}`;
    kuCountByKey.set(key, (kuCountByKey.get(key) ?? 0) + 1);
  }

  // Step 3: Joinen + sortieren. PG-Order ist primaer; Sub-Sortierung nach
  // Tenant-Name bei gleichem created_at.
  const rows: PendingReviewRow[] = (reviewRows ?? []).map((r) => {
    const tenantName =
      (r.tenants as { name?: string } | null)?.name ?? "Unbekannter Tenant";
    const sessionUpdatedAt =
      (r.capture_session as { updated_at?: string } | null)?.updated_at ?? null;
    const key = `${r.tenant_id}|${r.capture_session_id}|${r.block_key}`;

    return {
      tenantId: r.tenant_id as string,
      tenantName,
      captureSessionId: r.capture_session_id as string,
      blockKey: r.block_key as string,
      createdAt: r.created_at as string,
      sessionUpdatedAt,
      knowledgeUnitCount: kuCountByKey.get(key) ?? 0,
    };
  });

  rows.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.tenantName.localeCompare(b.tenantName, "de");
  });

  return rows;
}
