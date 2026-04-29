// SLC-043 MT-3 — Pending-Block-Reviews-Counts pro Tenant fuer den Quick-Stats-
// Badge in /admin/tenants. Single-Aggregation-Query, in JS gruppiert.
//
// Index `idx_block_review_status_created` (aus SLC-041 MIG-028) deckt das
// `WHERE status = 'pending'` ab. Bei einigen 100 Tenants × wenige Hundert
// Reviews ist das in einem einzigen Roundtrip aufzulisten und in JS zu
// gruppieren. Materialized View (siehe SLC-043 R1) ist nicht V4.1-Scope.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function pendingCountsByTenant(
  adminClient: SupabaseClient,
): Promise<Map<string, number>> {
  const { data, error } = await adminClient
    .from("block_review")
    .select("tenant_id")
    .eq("status", "pending");

  if (error) {
    throw new Error(`pendingCountsByTenant: ${error.message}`);
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const tid = row.tenant_id as string;
    counts.set(tid, (counts.get(tid) ?? 0) + 1);
  }
  return counts;
}
