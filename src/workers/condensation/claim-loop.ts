// Claim-Loop: Polls ai_jobs queue via SKIP LOCKED RPC.
// Dispatches claimed jobs to the handler.

import { createAdminClient } from "../../lib/supabase/admin";
import { captureException, captureInfo } from "../../lib/logger";

export interface ClaimedJob {
  id: string;
  tenant_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export type JobHandler = (job: ClaimedJob) => Promise<void>;

const JOB_TYPES = ["knowledge_unit_condensation", "recondense_with_gaps", "sop_generation", "diagnosis_generation", "evidence_extraction", "dialogue_transcription", "dialogue_extraction", "bridge_generation", "walkthrough_stub_processing", "walkthrough_transcribe", "walkthrough_redact_pii", "handbook_snapshot_generation"] as const;

/**
 * Start the polling claim-loop.
 * Polls for multiple job types in round-robin fashion.
 * Runs indefinitely until the process is killed.
 */
export async function startClaimLoop(
  handler: JobHandler,
  recondenseHandler?: JobHandler,
  sopHandler?: JobHandler,
  diagnosisHandler?: JobHandler,
  evidenceHandler?: JobHandler,
  dialogueTranscriptionHandler?: JobHandler,
  dialogueExtractionHandler?: JobHandler,
  bridgeHandler?: JobHandler,
  walkthroughStubHandler?: JobHandler,
  handbookSnapshotHandler?: JobHandler,
  walkthroughTranscribeHandler?: JobHandler,
  walkthroughRedactPiiHandler?: JobHandler
): Promise<never> {
  const pollMs = parseInt(process.env.AI_WORKER_POLL_MS || "2000", 10);
  const adminClient = createAdminClient();

  captureInfo(`Worker claim-loop started (poll=${pollMs}ms, types=${JOB_TYPES.join(",")})`, {
    source: "claim-loop",
  });

  let typeIndex = 0;

  while (true) {
    try {
      // Round-robin across job types
      const jobType = JOB_TYPES[typeIndex % JOB_TYPES.length];
      typeIndex++;

      // Claim next pending job via SKIP LOCKED RPC
      const { data, error } = await adminClient.rpc(
        "rpc_claim_next_ai_job_for_type",
        { p_job_type: jobType }
      );

      if (error) {
        captureException(new Error(`Claim RPC error: ${error.message}`), {
          source: "claim-loop",
          metadata: { code: error.code },
        });
        await sleep(pollMs);
        continue;
      }

      // No job available — sleep and retry
      if (!data) {
        await sleep(pollMs);
        continue;
      }

      const job = data as ClaimedJob;
      console.log(`[claim-loop] Claimed job ${job.id} (tenant=${job.tenant_id})`);

      // Dispatch to correct handler based on job_type
      try {
        if (job.job_type === "recondense_with_gaps" && recondenseHandler) {
          await recondenseHandler(job);
        } else if (job.job_type === "sop_generation" && sopHandler) {
          await sopHandler(job);
        } else if (job.job_type === "diagnosis_generation" && diagnosisHandler) {
          await diagnosisHandler(job);
        } else if (job.job_type === "evidence_extraction" && evidenceHandler) {
          await evidenceHandler(job);
        } else if (job.job_type === "dialogue_transcription" && dialogueTranscriptionHandler) {
          await dialogueTranscriptionHandler(job);
        } else if (job.job_type === "dialogue_extraction" && dialogueExtractionHandler) {
          await dialogueExtractionHandler(job);
        } else if (job.job_type === "bridge_generation" && bridgeHandler) {
          await bridgeHandler(job);
        } else if (
          job.job_type === "walkthrough_stub_processing" &&
          walkthroughStubHandler
        ) {
          await walkthroughStubHandler(job);
        } else if (
          job.job_type === "handbook_snapshot_generation" &&
          handbookSnapshotHandler
        ) {
          await handbookSnapshotHandler(job);
        } else if (
          job.job_type === "walkthrough_transcribe" &&
          walkthroughTranscribeHandler
        ) {
          await walkthroughTranscribeHandler(job);
        } else if (
          job.job_type === "walkthrough_redact_pii" &&
          walkthroughRedactPiiHandler
        ) {
          await walkthroughRedactPiiHandler(job);
        } else {
          await handler(job);
        }
      } catch (handlerError) {
        // Handler failed — mark job as failed
        captureException(handlerError, {
          source: "claim-loop",
          metadata: { jobId: job.id, tenantId: job.tenant_id },
        });

        try {
          await adminClient.rpc("rpc_fail_ai_job", {
            p_job_id: job.id,
            p_error:
              handlerError instanceof Error
                ? handlerError.message
                : String(handlerError),
          });
        } catch (failError) {
          captureException(failError, {
            source: "claim-loop",
            metadata: { jobId: job.id, action: "rpc_fail_ai_job" },
          });
        }
      }
    } catch (loopError) {
      // Unexpected top-level error — log and continue
      captureException(loopError, { source: "claim-loop" });
      await sleep(pollMs * 2);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
