// SLC-041 MT-2 — Worker-Pre-Filter Helper fuer V4.1 Berater-Review-Workflow
//
// Liest block_review-Tabelle und filtert Mitarbeiter-KUs, die nicht 'approved' sind.
// Backwards-Compat (DEC-048): Wenn fuer eine Session noch kein einziger block_review-Eintrag
// existiert, wird die KU-Liste 1:1 durchgereicht — alte V4-Snapshots werden ohne Bruch
// re-generierbar. GF-KUs (`source != 'employee_questionnaire'`) sind vom Filter unbeeinflusst.
//
// Architektur: docs/ARCHITECTURE.md V4.1-Addendum, Worker-Pre-Filter-Skizze.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnowledgeUnitRow } from "./types";

export interface BlockReviewState {
  /** Block-Keys mit status='approved' fuer die Session. */
  approved: Set<string>;
  /** Block-Keys mit status='pending' fuer die Session. */
  pending: Set<string>;
  /** Block-Keys mit status='rejected' fuer die Session. */
  rejected: Set<string>;
  /** True, wenn die Session ueberhaupt block_review-Eintraege hat (steuert Backwards-Compat). */
  hasAnyRows: boolean;
}

const EMPTY_STATE: BlockReviewState = Object.freeze({
  approved: new Set<string>(),
  pending: new Set<string>(),
  rejected: new Set<string>(),
  hasAnyRows: false,
}) as BlockReviewState;

/**
 * Laedt alle block_review-Eintraege fuer eine (tenant, session) und gruppiert sie
 * nach Status. Erwartet einen service-role Supabase-Client (RLS bypass).
 */
export async function loadBlockReviewState(
  client: SupabaseClient,
  tenantId: string,
  captureSessionId: string,
): Promise<BlockReviewState> {
  const { data, error } = await client
    .from("block_review")
    .select("block_key, status")
    .eq("tenant_id", tenantId)
    .eq("capture_session_id", captureSessionId);

  if (error) {
    throw new Error(`Failed to load block_review: ${error.message}`);
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    return { ...EMPTY_STATE };
  }

  const approved = new Set<string>();
  const pending = new Set<string>();
  const rejected = new Set<string>();

  for (const row of rows) {
    const key = row.block_key as string;
    const status = row.status as string;
    if (status === "approved") approved.add(key);
    else if (status === "pending") pending.add(key);
    else if (status === "rejected") rejected.add(key);
  }

  return { approved, pending, rejected, hasAnyRows: true };
}

/**
 * Pure Filter-Funktion (kein DB-Zugriff).
 *
 * Backwards-Compat (DEC-048):
 *   - Wenn die Session keine block_review-Eintraege hat (`hasAnyRows = false`),
 *     werden ALLE KUs durchgereicht. Pre-V4.1 Snapshots laufen weiter ohne Bruch.
 *   - Wenn block_review-Eintraege existieren, werden Mitarbeiter-KUs nur
 *     durchgelassen, deren block_key in `approved` ist.
 *
 * GF-KUs (`source != 'employee_questionnaire'`) sind unbeeinflusst.
 */
export function applyBlockReviewFilter(
  allKus: KnowledgeUnitRow[],
  state: BlockReviewState,
): KnowledgeUnitRow[] {
  if (!state.hasAnyRows) {
    return allKus;
  }
  return allKus.filter((ku) => {
    if (ku.source !== "employee_questionnaire") return true;
    return state.approved.has(ku.block_key);
  });
}

/**
 * Audit-Counter fuer handbook_snapshot.metadata (DEC-048 Audit-Field).
 * Zaehlt Bloecke pro Status — nicht KUs.
 */
export function countBlockReviewStatuses(state: BlockReviewState): {
  pending_blocks: number;
  approved_blocks: number;
  rejected_blocks: number;
} {
  return {
    pending_blocks: state.pending.size,
    approved_blocks: state.approved.size,
    rejected_blocks: state.rejected.size,
  };
}
