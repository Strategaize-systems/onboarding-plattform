// Worker Entry Point — Knowledge Unit Condensation
// Runs as a standalone Node.js process alongside the Next.js app container.
// Polls ai_jobs queue and processes knowledge_unit_condensation jobs
// using an iterative Analyst+Challenger loop via AWS Bedrock.

import { startClaimLoop } from "./claim-loop";
import { handleCondensationJob } from "./handle-job";
import { handleRecondenseJob } from "./handle-recondense";
import { handleSopJob } from "../sop/handle-sop-job";
import { handleDiagnosisJob } from "../diagnosis/handle-diagnosis-job";
import { handleEvidenceJob } from "../evidence/handle-evidence-job";
import { handleTranscriptionJob } from "../dialogue/handle-transcription-job";
import { handleExtractionJob } from "../dialogue/handle-extraction-job";
import { handleBridgeJob } from "../bridge/handle-bridge-job";
import { handleWalkthroughStubJob } from "../capture-modes/walkthrough-stub/handle";
import { handleHandbookSnapshotJob } from "../handbook/handle-snapshot-job";
import { handleWalkthroughTranscribeJob } from "../walkthrough/handle-transcribe-job";
import { handleRedactPiiJob } from "../walkthrough/handle-redact-pii-job";
import { handleExtractStepsJob } from "../walkthrough/handle-extract-steps-job";

// Validate required environment variables
const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
];

function validateEnv(): void {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `[worker] Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
  }

  // Default Bedrock model if not set
  if (!process.env.LLM_MODEL) {
    process.env.LLM_MODEL = "eu.anthropic.claude-sonnet-4-20250514-v1:0";
  }

  console.log("[worker] Environment validated");
  console.log(`[worker] AWS_REGION=${process.env.AWS_REGION}`);
  console.log(`[worker] LLM_MODEL=${process.env.LLM_MODEL}`);
  console.log(
    `[worker] AI_MIN_ITERATIONS=${process.env.AI_MIN_ITERATIONS || "2"}`
  );
  console.log(
    `[worker] AI_MAX_ITERATIONS=${process.env.AI_MAX_ITERATIONS || "8"}`
  );
  console.log(
    `[worker] AI_WORKER_POLL_MS=${process.env.AI_WORKER_POLL_MS || "2000"}`
  );
}

// Graceful shutdown
function setupShutdown(): void {
  const shutdown = (signal: string) => {
    console.log(`[worker] Received ${signal}, shutting down...`);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// Main
async function main(): Promise<void> {
  console.log("[worker] Knowledge Unit Condensation Worker starting...");
  console.log("[worker] walkthrough_stub handler registered");
  console.log("[worker] handbook_snapshot_generation handler registered");
  console.log("[worker] walkthrough_transcribe handler registered");
  console.log("[worker] walkthrough_redact_pii handler registered");
  console.log("[worker] walkthrough_extract_steps handler registered");
  validateEnv();
  setupShutdown();

  // Start the claim loop — runs forever, handles all job types
  await startClaimLoop(
    handleCondensationJob,
    handleRecondenseJob,
    handleSopJob,
    handleDiagnosisJob,
    handleEvidenceJob,
    handleTranscriptionJob,
    handleExtractionJob,
    (job) => handleBridgeJob(job),
    handleWalkthroughStubJob,
    handleHandbookSnapshotJob,
    handleWalkthroughTranscribeJob,
    handleRedactPiiJob,
    handleExtractStepsJob
  );
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
