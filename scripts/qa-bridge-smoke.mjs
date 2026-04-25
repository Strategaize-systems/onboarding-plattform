#!/usr/bin/env node
// QA-Smoke fuer SLC-035 Bridge-Engine — End-to-End mit echtem Bedrock-Call.
//
// Startet einen Bridge-Run gegen Demo-Tenant ohne den deployed Worker zu brauchen:
// 1. INSERT bridge_run (status=running)
// 2. INSERT ai_jobs (job_type=bridge_generation, status=pending)
// 3. rpc_claim_next_ai_job_for_type -> claimed job (status=processing)
// 4. Direkter Aufruf von handleBridgeJob mit echter chatWithLLM-Bridge
// 5. SELECT bridge_run, bridge_proposal, ai_cost_ledger -> Verify
//
// Nutzung (auf Hetzner):
//   docker exec <app-container> node /app/scripts/qa-bridge-smoke.mjs
//
// Erwartete Kosten: ~$0.05-0.20 (max 4 Subtopic-Calls + 1 Free-Form-Call).

// Bundled mit esbuild aus den TS-Sourcen — siehe scripts/build-qa-smoke.mjs.
// Importe kommen via Bundle aus src/lib/supabase/admin.ts +
// src/workers/bridge/handle-bridge-job.ts und werden bei build-time aufgeloest.
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { handleBridgeJob } from "../src/workers/bridge/handle-bridge-job.ts";

const DEMO_TENANT_ID = "00000000-0000-0000-0000-0000000000de";
const DEMO_SESSION_ID = "64ad04eb-63ef-4b01-ab12-fc4f09474246";
const DEMO_TENANT_ADMIN_USER_ID = "a317e861-60fc-493c-bbab-9c90d6a5cca9";

async function main() {
  console.log("[qa-smoke] SLC-035 Bridge-Engine End-to-End-QA");
  console.log(`[qa-smoke] Tenant: ${DEMO_TENANT_ID}`);
  console.log(`[qa-smoke] Session: ${DEMO_SESSION_ID}`);

  const adminClient = createAdminClient();

  // ---- 1. Hole Session-Metadaten fuer bridge_run ----
  const { data: session, error: sessErr } = await adminClient
    .from("capture_session")
    .select("id, tenant_id, template_id, template_version")
    .eq("id", DEMO_SESSION_ID)
    .single();

  if (sessErr || !session) {
    throw new Error(`Session not found: ${sessErr?.message}`);
  }
  console.log(`[qa-smoke] Template: ${session.template_id} v${session.template_version}`);

  // ---- 2. Sammle source_checkpoint_ids ----
  const { data: checkpoints } = await adminClient
    .from("block_checkpoint")
    .select("id")
    .eq("capture_session_id", DEMO_SESSION_ID)
    .in("checkpoint_type", ["questionnaire_submit", "meeting_final"]);

  const checkpointIds = (checkpoints ?? []).map((c) => c.id);
  console.log(`[qa-smoke] source_checkpoint_ids: ${checkpointIds.length}`);

  // ---- 3. INSERT bridge_run (status=running) ----
  const { data: bridgeRun, error: brErr } = await adminClient
    .from("bridge_run")
    .insert({
      tenant_id: session.tenant_id,
      capture_session_id: session.id,
      template_id: session.template_id,
      template_version: session.template_version,
      status: "running",
      triggered_by_user_id: DEMO_TENANT_ADMIN_USER_ID,
      source_checkpoint_ids: checkpointIds,
    })
    .select()
    .single();

  if (brErr || !bridgeRun) {
    throw new Error(`Failed to insert bridge_run: ${brErr?.message}`);
  }
  console.log(`[qa-smoke] bridge_run.id=${bridgeRun.id}`);

  // ---- 4. INSERT ai_jobs (status=pending) ----
  const { data: aiJob, error: jobErr } = await adminClient
    .from("ai_jobs")
    .insert({
      tenant_id: session.tenant_id,
      job_type: "bridge_generation",
      payload: { bridge_run_id: bridgeRun.id },
      status: "pending",
    })
    .select()
    .single();

  if (jobErr || !aiJob) {
    throw new Error(`Failed to insert ai_jobs: ${jobErr?.message}`);
  }
  console.log(`[qa-smoke] ai_jobs.id=${aiJob.id}`);

  // ---- 5. Claim via SKIP-LOCKED-RPC (status -> processing) ----
  const { data: claimed, error: claimErr } = await adminClient.rpc(
    "rpc_claim_next_ai_job_for_type",
    { p_job_type: "bridge_generation" }
  );

  if (claimErr || !claimed) {
    throw new Error(`Failed to claim job: ${claimErr?.message ?? "no job returned"}`);
  }
  console.log(`[qa-smoke] claimed job=${claimed.id} (tenant=${claimed.tenant_id})`);

  // ---- 6. handleBridgeJob mit defaultBedrockCall (echter Bedrock-Call) ----
  const tStart = Date.now();
  console.log(`[qa-smoke] >>> Calling handleBridgeJob with real Bedrock... (~30-60s)`);
  await handleBridgeJob(claimed);
  const elapsedMs = Date.now() - tStart;
  console.log(`[qa-smoke] <<< handleBridgeJob done in ${(elapsedMs / 1000).toFixed(1)}s`);

  // ---- 7. Verify bridge_run ----
  const { data: finalRun } = await adminClient
    .from("bridge_run")
    .select("status, proposal_count, cost_usd, generated_by_model, completed_at, error_message")
    .eq("id", bridgeRun.id)
    .single();

  console.log("\n=== AC-3 + AC-5 VERIFICATION ===");
  console.log(`bridge_run.status:             ${finalRun?.status}`);
  console.log(`bridge_run.proposal_count:     ${finalRun?.proposal_count}`);
  console.log(`bridge_run.cost_usd:           ${finalRun?.cost_usd}`);
  console.log(`bridge_run.generated_by_model: ${finalRun?.generated_by_model}`);
  console.log(`bridge_run.completed_at:       ${finalRun?.completed_at}`);
  console.log(`bridge_run.error_message:      ${finalRun?.error_message ?? "(null)"}`);

  // ---- 8. Verify bridge_proposals ----
  const { data: proposals } = await adminClient
    .from("bridge_proposal")
    .select("proposal_mode, source_subtopic_key, proposed_block_title, proposed_employee_user_id, proposed_employee_role_hint, status")
    .eq("bridge_run_id", bridgeRun.id);

  console.log(`\n=== AC-2 VERIFICATION (proposals) ===`);
  console.log(`bridge_proposal rows:          ${proposals?.length ?? 0}`);
  for (const p of proposals ?? []) {
    console.log(
      `  [${p.proposal_mode}] sub=${p.source_subtopic_key ?? "(free)"} title="${p.proposed_block_title?.slice(0, 60)}" emp_id=${p.proposed_employee_user_id ?? "null"} role_hint=${p.proposed_employee_role_hint ?? "null"} status=${p.status}`
    );
  }

  // ---- 9. Verify ai_cost_ledger ----
  const { data: ledger } = await adminClient
    .from("ai_cost_ledger")
    .select("model_id, tokens_in, tokens_out, usd_cost, role, feature, duration_ms")
    .eq("job_id", claimed.id)
    .order("created_at", { ascending: true });

  console.log(`\n=== AC-4 VERIFICATION (cost-ledger) ===`);
  console.log(`ai_cost_ledger rows:           ${ledger?.length ?? 0}`);
  let totalCost = 0;
  for (const l of ledger ?? []) {
    console.log(
      `  role=${l.role} feature=${l.feature} model=${l.model_id} in=${l.tokens_in} out=${l.tokens_out} cost=$${l.usd_cost} duration=${l.duration_ms}ms`
    );
    totalCost += parseFloat(l.usd_cost ?? "0");
  }
  console.log(`Total cost from ledger:        $${totalCost.toFixed(4)}`);

  // ---- 10. Verify ai_jobs.status=completed ----
  const { data: finalJob } = await adminClient
    .from("ai_jobs")
    .select("status, error")
    .eq("id", claimed.id)
    .single();

  console.log(`\n=== JOB STATUS ===`);
  console.log(`ai_jobs.status:                ${finalJob?.status}`);
  console.log(`ai_jobs.error:                 ${finalJob?.error ?? "(null)"}`);

  // ---- 11. PASS/FAIL Summary ----
  const passes = [];
  const fails = [];

  if (finalRun?.status === "completed") passes.push("AC-3: bridge_run completed");
  else fails.push(`AC-3: bridge_run.status=${finalRun?.status}`);

  if (finalRun?.cost_usd && parseFloat(finalRun.cost_usd) > 0) passes.push("AC-3: cost_usd > 0");
  else fails.push(`AC-3: cost_usd=${finalRun?.cost_usd}`);

  if (finalRun?.generated_by_model) passes.push(`AC-3: generated_by_model=${finalRun.generated_by_model}`);
  else fails.push("AC-3: generated_by_model missing");

  if ((proposals?.length ?? 0) > 0) passes.push(`AC-2: ${proposals.length} proposals generated`);
  else fails.push("AC-2: 0 proposals (lookup gap?)");

  if ((ledger?.length ?? 0) > 0) passes.push(`AC-4: ${ledger.length} cost-ledger entries`);
  else fails.push("AC-4: 0 cost-ledger entries");

  console.log(`\n=== SUMMARY ===`);
  for (const p of passes) console.log(`  ✓ ${p}`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  console.log(`\nResult: ${fails.length === 0 ? "PASS" : "MIXED"} (${passes.length} pass, ${fails.length} fail)`);

  // Exit-Code
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[qa-smoke] FATAL:", err);
  process.exit(2);
});
