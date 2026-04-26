// SLC-038 — walkthrough_stub Capture-Mode Worker-Handler.
//
// Pseudo-Mode-Spike, der SC-V4-6 validiert: ein neuer Capture-Mode kann ohne
// Schema-Aenderung eingefuehrt werden. Dieser Handler ist die Vorlage fuer
// V5/V6-Modes (Walkthrough, Diary).
//
// Verhalten:
//   - Empfaengt einen ai_job mit job_type='walkthrough_stub_processing'
//   - Loggt ein Marker-Statement
//   - Markiert den Job als completed (kein Bedrock-Call, keine KU-Erzeugung)
//
// Hook-Konvention (DEC-040):
//   - Worker-Pipeline-Slot: Job-Type-Naming `{mode}_processing` ist Pflicht.
//   - Wird in `claim-loop.ts` per JOB_TYPES registriert und in `condensation/run.ts`
//     an `startClaimLoop` als optional Handler uebergeben.

import { createAdminClient } from "../../../lib/supabase/admin";
import type { ClaimedJob } from "../../condensation/claim-loop";

export async function handleWalkthroughStubJob(job: ClaimedJob): Promise<void> {
  console.log(
    `[walkthrough_stub] received job ${job.id} (tenant=${job.tenant_id})`
  );

  const adminClient = createAdminClient();

  const { error } = await adminClient.rpc("rpc_complete_ai_job", {
    p_job_id: job.id,
  });

  if (error) {
    throw new Error(
      `walkthrough_stub: failed to complete job ${job.id}: ${error.message}`
    );
  }

  console.log(`[walkthrough_stub] completed job ${job.id}`);
}
