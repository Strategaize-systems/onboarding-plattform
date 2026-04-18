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

const JOB_TYPE = "knowledge_unit_condensation";

/**
 * Start the polling claim-loop.
 * Runs indefinitely until the process is killed.
 */
export async function startClaimLoop(handler: JobHandler): Promise<never> {
  const pollMs = parseInt(process.env.AI_WORKER_POLL_MS || "2000", 10);
  const adminClient = createAdminClient();

  captureInfo(`Worker claim-loop started (poll=${pollMs}ms, type=${JOB_TYPE})`, {
    source: "claim-loop",
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // Claim next pending job via SKIP LOCKED RPC
      const { data, error } = await adminClient.rpc(
        "rpc_claim_next_ai_job_for_type",
        { p_job_type: JOB_TYPE }
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

      // Dispatch to handler
      try {
        await handler(job);
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
