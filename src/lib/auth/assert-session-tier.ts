// V9.75 SLC-V9.75-A MT-3 — TS-Dispatch-Gate (Schicht 1).
//
// Gemeinsamer Tier-Guard fuer alle TS-Eintrittspunkte, die einen gated ai_job
// enqueuen (diagnosis / sop / dialogue / walkthrough / bulk-email). Single
// Source of Truth ist die SQL-Funktion `fn_session_tier_allows` (Migration 121,
// DEC-220/221, ARCHITECTURE.md "## V9.75 Architecture Addendum" §4). Der Guard
// spiegelt die Matrix NICHT als TS-Konstante (§10.3-Empfehlung: RPC-Roundtrip =
// eine Wahrheit, kein Paritaets-Drift) und liefert zusaetzlich den aktuellen
// `tier` zum Stempeln von `ai_jobs.session_tier` (Worker-Defense MT-4).
//
// Fail-closed: bei RPC-Fehler -> allowed=false (ein gated Job darf bei einer
// gescheiterten Pruefung nicht durchrutschen).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SessionTierDecision {
  /** true, wenn die Session-Stufe den job_type ausloesen darf. */
  allowed: boolean;
  /**
   * Aktueller tier der Session (oder null, wenn nicht gefunden/lesbar) — wird
   * auf `ai_jobs.session_tier` gestempelt, damit der Worker (MT-4) ohne
   * capture_session-Join nachpruefen kann.
   */
  tier: string | null;
}

/**
 * Prueft server-side, ob `sessionId` den `jobType` ausloesen darf, und liefert
 * den aktuellen tier zum Stempeln. Erwartet eine konkrete Session-ID — der
 * NULL-Fall (z.B. session-lose Forward-Bucket-Bulk-Runs) wird bewusst NICHT hier
 * behandelt, sondern explizit am jeweiligen Aufrufer entschieden, damit der
 * Guard fuer session-gebundene Pfade strikt fail-closed bleibt.
 */
export async function assertSessionTierAllows(
  client: SupabaseClient,
  sessionId: string,
  jobType: string,
): Promise<SessionTierDecision> {
  // Erlaubnis: SQL-Matrix ist die einzige Wahrheitsquelle.
  const { data: allowed, error } = await client.rpc("fn_session_tier_allows", {
    p_session_id: sessionId,
    p_job_type: jobType,
  });

  // tier-Wert fuer den session_tier-Stempel. RLS: strategaize_admin / Owner
  // liest die eigene Session (capture_session_admin_full / _tenant_read);
  // service_role (createAdminClient) bypassed RLS.
  const { data: sessionRow } = await client
    .from("capture_session")
    .select("tier")
    .eq("id", sessionId)
    .maybeSingle();
  const tier = (sessionRow?.tier as string | undefined) ?? null;

  if (error) {
    return { allowed: false, tier };
  }
  return { allowed: Boolean(allowed), tier };
}
