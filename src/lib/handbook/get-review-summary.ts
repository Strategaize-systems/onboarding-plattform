// SLC-041 MT-3 — getReviewSummary Helper fuer Trigger-Dialog (SLC-042) und
// Cockpit-Card "Mitarbeiter-Bloecke reviewed".
//
// Aggregiert ueber block_review (Status-Counts) plus knowledge_unit (Total
// Mitarbeiter-Bloecke = DISTINCT(block_key) WHERE source='employee_questionnaire').
// Dadurch laesst sich auch der Fall "Mitarbeiter-KU existiert, block_review fehlt"
// (Race-Condition zwischen Trigger und Worker-Verdichtung) im UI als 'pending'
// behandeln.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReviewSummary {
  approved: number;
  pending: number;
  rejected: number;
  /** DISTINCT(block_key) Mitarbeiter-KUs in der Session — Referenz fuer Quality-Gate. */
  totalEmployeeBlocks: number;
}

const EMPTY_SUMMARY: ReviewSummary = Object.freeze({
  approved: 0,
  pending: 0,
  rejected: 0,
  totalEmployeeBlocks: 0,
});

export async function getReviewSummary(
  client: SupabaseClient,
  tenantId: string,
  captureSessionId: string,
): Promise<ReviewSummary> {
  // 1. Status-Counts aus block_review
  const { data: reviewRows, error: reviewError } = await client
    .from("block_review")
    .select("block_key, status")
    .eq("tenant_id", tenantId)
    .eq("capture_session_id", captureSessionId);

  if (reviewError) {
    throw new Error(`Failed to load block_review: ${reviewError.message}`);
  }

  // 2. DISTINCT block_key der Mitarbeiter-KUs in der Session
  const { data: kuRows, error: kuError } = await client
    .from("knowledge_unit")
    .select("block_key")
    .eq("tenant_id", tenantId)
    .eq("capture_session_id", captureSessionId)
    .eq("source", "employee_questionnaire");

  if (kuError) {
    throw new Error(`Failed to load knowledge_unit: ${kuError.message}`);
  }

  const employeeBlockKeys = new Set<string>(
    (kuRows ?? []).map((r) => r.block_key as string),
  );

  if ((reviewRows ?? []).length === 0 && employeeBlockKeys.size === 0) {
    return { ...EMPTY_SUMMARY };
  }

  let approved = 0;
  let pending = 0;
  let rejected = 0;
  for (const row of reviewRows ?? []) {
    const status = row.status as string;
    if (status === "approved") approved++;
    else if (status === "pending") pending++;
    else if (status === "rejected") rejected++;
  }

  return {
    approved,
    pending,
    rejected,
    totalEmployeeBlocks: employeeBlockKeys.size,
  };
}
