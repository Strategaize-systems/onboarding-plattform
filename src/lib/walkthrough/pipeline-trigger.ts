// V5 Option 2 Pipeline-Trigger — SLC-076 MT-5 Foundation, von SLC-077/078 wiederverwendet.
//
// Faedelt nach Abschluss einer Pipeline-Stufe die naechste Stufe ein:
//   transcribing → redacting   (+ enqueue walkthrough_redact_pii)   — Stufe 1 (SLC-076)
//   redacting    → extracting  (+ enqueue walkthrough_extract_steps) — Stufe 2 (SLC-077)
//   extracting   → mapping     (+ enqueue walkthrough_map_subtopics) — Stufe 3 (SLC-078)
//   mapping      → pending_review                                    — Berater-Review (SLC-079)
//
// Aufrufer-Vertrag:
//   - Aufrufer setzt den NEUEN Status erst NACH Erfolg der eigenen Stufe.
//   - Der Trigger liest den AKTUELLEN Status (= abgeschlossene Stufe) und plant die naechste Stufe.
//   - Idempotent: wenn der naechste Job-Type-Handler noch nicht existiert (SLC-076-Foundation),
//     bleibt die Session in `extracting/mapping` bis SLC-077/078 deployed sind. Der pending ai_job
//     wird beim Deploy automatisch gepickt.
//
// Architecture-Pseudocode-Quelle: docs/ARCHITECTURE.md V5 Option 2 Pipeline-Trigger-Sektion.

import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

const PIPELINE_TRANSITIONS: Record<
  string,
  { nextStatus: string; nextJobType: string | null }
> = {
  // Whisper-Erfolg → Stufe 1 PII-Redaction
  transcribing: { nextStatus: "redacting", nextJobType: "walkthrough_redact_pii" },
  // Stufe 1 Erfolg → Stufe 2 Schritt-Extraktion
  redacting: { nextStatus: "extracting", nextJobType: "walkthrough_extract_steps" },
  // Stufe 2 Erfolg → Stufe 3 Auto-Mapping
  extracting: { nextStatus: "mapping", nextJobType: "walkthrough_map_subtopics" },
  // Stufe 3 Erfolg → Berater-Review
  mapping: { nextStatus: "pending_review", nextJobType: null },
};

interface AdvanceResult {
  fromStatus: string;
  toStatus: string;
  enqueuedJobType: string | null;
  enqueuedJobId: string | null;
}

/**
 * Liest den aktuellen Status der walkthrough_session, ermittelt den naechsten Status nach
 * `PIPELINE_TRANSITIONS`, schreibt den Status-Uebergang und legt ggf. den naechsten ai_job an.
 *
 * Throws wenn:
 * - die Session nicht existiert
 * - der aktuelle Status keine Pipeline-Stufe ist (kein Eintrag in PIPELINE_TRANSITIONS)
 */
export async function advanceWalkthroughPipeline(
  adminClient: AdminClient,
  walkthroughSessionId: string,
): Promise<AdvanceResult> {
  const { data: session, error: loadError } = await adminClient
    .from("walkthrough_session")
    .select("id, tenant_id, status")
    .eq("id", walkthroughSessionId)
    .single();

  if (loadError || !session) {
    throw new Error(
      `advanceWalkthroughPipeline: walkthrough_session ${walkthroughSessionId} not found: ${
        loadError?.message ?? "no row"
      }`,
    );
  }

  const transition = PIPELINE_TRANSITIONS[session.status as string];
  if (!transition) {
    throw new Error(
      `advanceWalkthroughPipeline: unexpected current status='${session.status}' for session ${walkthroughSessionId} (not a pipeline stage)`,
    );
  }

  const fromStatus = session.status as string;

  // 1. Status-Uebergang
  const { error: updateError } = await adminClient
    .from("walkthrough_session")
    .update({ status: transition.nextStatus })
    .eq("id", walkthroughSessionId);

  if (updateError) {
    throw new Error(
      `advanceWalkthroughPipeline: status update ${fromStatus} → ${transition.nextStatus} failed: ${updateError.message}`,
    );
  }

  // 2. Naechsten ai_job einfaedeln (sofern Stufe einen Folge-Job hat)
  let enqueuedJobId: string | null = null;
  if (transition.nextJobType) {
    const { data: jobRow, error: enqueueError } = await adminClient
      .from("ai_jobs")
      .insert({
        tenant_id: session.tenant_id,
        job_type: transition.nextJobType,
        payload: { walkthroughSessionId },
        status: "pending",
      })
      .select("id")
      .single();

    if (enqueueError) {
      throw new Error(
        `advanceWalkthroughPipeline: ai_jobs INSERT ${transition.nextJobType} failed: ${enqueueError.message}`,
      );
    }
    enqueuedJobId = jobRow?.id ?? null;
  }

  return {
    fromStatus,
    toStatus: transition.nextStatus,
    enqueuedJobType: transition.nextJobType,
    enqueuedJobId,
  };
}
