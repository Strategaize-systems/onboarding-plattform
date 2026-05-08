// V5 Option 2 Hotfix — Walkthrough-Review-Summary fuer Cockpit-Card.
//
// Liefert pro Tenant die Zahlen pending/approved/rejected, analog
// `lib/handbook/get-review-summary.ts` fuer block_review. Wird von
// `dashboard/page.tsx` aufgerufen, um die `WalkthroughReviewStatusCard`
// zu fuettern.
//
// Performance: 1 Query mit kompletter status-Liste, JS-side aggregiert.
// Internal-Test-Mode mit <50 Walkthroughs pro Tenant unkritisch.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface WalkthroughReviewSummary {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

const REVIEW_STATUSES = ["pending_review", "approved", "rejected"] as const;

export async function getWalkthroughReviewSummary(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<WalkthroughReviewSummary> {
  const { data, error } = await supabase
    .from("walkthrough_session")
    .select("status")
    .eq("tenant_id", tenantId)
    .in("status", [...REVIEW_STATUSES]);

  if (error) {
    throw new Error(`getWalkthroughReviewSummary failed: ${error.message}`);
  }

  let pending = 0;
  let approved = 0;
  let rejected = 0;
  for (const row of data ?? []) {
    const status = row.status as string;
    if (status === "pending_review") pending++;
    else if (status === "approved") approved++;
    else if (status === "rejected") rejected++;
  }

  return {
    pending,
    approved,
    rejected,
    total: pending + approved + rejected,
  };
}
