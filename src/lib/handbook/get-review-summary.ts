// SLC-041 MT-3 — getReviewSummary Helper fuer Trigger-Dialog (SLC-042) und
// Cockpit-Card "Mitarbeiter-Bloecke reviewed".
//
// Aggregiert ueber block_review (Status-Counts) plus knowledge_unit (Total
// Mitarbeiter-Bloecke = DISTINCT(block_key) WHERE source='employee_questionnaire').
// Dadurch laesst sich auch der Fall "Mitarbeiter-KU existiert, block_review fehlt"
// (Race-Condition zwischen Trigger und Worker-Verdichtung) im UI als 'pending'
// behandeln.
//
// ISSUE-029 Fix (2026-04-28): captureSessionId ist optional. block_review-Rows und
// employee_questionnaire-KUs liegen in den Mitarbeiter-Sessions, nicht in der
// GF-Session des Beraters. Aufrufer (/dashboard und /admin/handbook) haben die
// GF-Session, koennen aber die Mitarbeiter-Sessions nicht direkt enumerieren.
// Daher: wenn captureSessionId nicht uebergeben wird, aggregiert der Helper
// ueber den gesamten Tenant. V4.1 hat 1 GF-Session + N Mitarbeiter-Sessions pro
// Tenant — Tenant-Filter ist semantisch korrekt fuer den Quality-Gate-Use-Case.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ReviewSummary {
  approved: number;
  pending: number;
  rejected: number;
  /** DISTINCT(block_key) Mitarbeiter-KUs im Tenant — Referenz fuer Quality-Gate. */
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
  captureSessionId?: string,
): Promise<ReviewSummary> {
  // 1. Status-Counts aus block_review
  let reviewQuery = client
    .from("block_review")
    .select("block_key, status")
    .eq("tenant_id", tenantId);
  if (captureSessionId) {
    reviewQuery = reviewQuery.eq("capture_session_id", captureSessionId);
  }
  const { data: reviewRows, error: reviewError } = await reviewQuery;

  if (reviewError) {
    throw new Error(`Failed to load block_review: ${reviewError.message}`);
  }

  // 2. DISTINCT block_key der Mitarbeiter-KUs (im Tenant oder optional in der Session)
  let kuQuery = client
    .from("knowledge_unit")
    .select("block_key")
    .eq("tenant_id", tenantId)
    .eq("source", "employee_questionnaire");
  if (captureSessionId) {
    kuQuery = kuQuery.eq("capture_session_id", captureSessionId);
  }
  const { data: kuRows, error: kuError } = await kuQuery;

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
