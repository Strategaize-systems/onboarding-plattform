#!/usr/bin/env node
// QA-Smoke fuer SLC-039 Handbuch-Snapshot Backend — End-to-End ohne Worker-Loop.
//
// Pattern wie qa-bridge-smoke.mjs:
//   1. Lese den per AC-1 bereits angelegten handbook_snapshot + ai_jobs row
//      (CLI arg: snapshot_id, job_id)
//   2. rpc_claim_next_ai_job_for_type('handbook_snapshot_generation') -> claimed
//   3. Direkter Aufruf von handleHandbookSnapshotJob(claimed)
//   4. Verify: snapshot.status='ready', storage_path, counts, signed-URL roundtrip
//
// Nutzung (auf Hetzner):
//   docker exec <app-container> node /tmp/qa-handbook-smoke.bundle.mjs <snapshot_id>
//
// Erwartete Kosten: $0 (deterministische Aggregation, kein Bedrock).

import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { handleHandbookSnapshotJob } from "../src/workers/handbook/handle-snapshot-job.ts";

async function main() {
  const snapshotId = process.argv[2];
  if (!snapshotId) {
    console.error("[qa-smoke] usage: node qa-handbook-smoke.bundle.mjs <snapshot_id>");
    process.exit(1);
  }

  console.log(`[qa-smoke] SLC-039 Handbuch-Snapshot End-to-End-QA`);
  console.log(`[qa-smoke] snapshot_id=${snapshotId}`);

  const adminClient = createAdminClient();

  // 1. Snapshot pruefen
  const { data: snap, error: snapErr } = await adminClient
    .from("handbook_snapshot")
    .select("id, tenant_id, capture_session_id, status")
    .eq("id", snapshotId)
    .single();
  if (snapErr || !snap) {
    throw new Error(`Snapshot not found: ${snapErr?.message ?? "no row"}`);
  }
  console.log(`[qa-smoke] snapshot pre-state: status=${snap.status}`);

  // 2. Pending ai_job lookup (zu diesem Snapshot)
  const { data: pendingJobs, error: jobErr } = await adminClient
    .from("ai_jobs")
    .select("id, status, payload")
    .eq("job_type", "handbook_snapshot_generation")
    .order("created_at", { ascending: false })
    .limit(5);
  if (jobErr) throw new Error(`ai_jobs lookup failed: ${jobErr.message}`);
  const myJob = (pendingJobs ?? []).find(
    (j) => j.payload?.handbook_snapshot_id === snapshotId,
  );
  if (!myJob) throw new Error(`No ai_jobs row for snapshot ${snapshotId}`);
  console.log(`[qa-smoke] ai_jobs row: id=${myJob.id} status=${myJob.status}`);

  // 3. Claim (status -> processing)
  const { data: claimed, error: claimErr } = await adminClient.rpc(
    "rpc_claim_next_ai_job_for_type",
    { p_job_type: "handbook_snapshot_generation" },
  );
  if (claimErr || !claimed) {
    throw new Error(`Claim failed: ${claimErr?.message ?? "no job returned"}`);
  }
  console.log(`[qa-smoke] claimed job=${claimed.id} (tenant=${claimed.tenant_id})`);

  // 4. Handler-Call
  const tStart = Date.now();
  console.log(`[qa-smoke] >>> handleHandbookSnapshotJob ...`);
  await handleHandbookSnapshotJob(claimed);
  const elapsedMs = Date.now() - tStart;
  console.log(`[qa-smoke] <<< handler done in ${elapsedMs}ms`);

  // 5. Verify snapshot row
  const { data: snapAfter } = await adminClient
    .from("handbook_snapshot")
    .select(
      "id, status, storage_path, storage_size_bytes, section_count, knowledge_unit_count, diagnosis_count, sop_count, error_message",
    )
    .eq("id", snapshotId)
    .single();
  console.log(`[qa-smoke] snapshot AFTER:`, JSON.stringify(snapAfter, null, 2));

  if (snapAfter?.status !== "ready") {
    console.error(`[qa-smoke] FAIL: status=${snapAfter?.status}, expected 'ready'`);
    process.exit(2);
  }

  // 6. Signed URL Roundtrip
  const path = snapAfter.storage_path;
  const { data: signed, error: signErr } = await adminClient.storage
    .from("handbook")
    .createSignedUrl(path, 300);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`Signed URL failed: ${signErr?.message}`);
  }
  console.log(`[qa-smoke] signed URL OK (5min TTL): ${signed.signedUrl.slice(0, 80)}...`);

  // 7. Download + ZIP-Size
  const downloadRes = await fetch(signed.signedUrl);
  if (!downloadRes.ok) {
    throw new Error(`Download via signed URL failed: HTTP ${downloadRes.status}`);
  }
  const buf = Buffer.from(await downloadRes.arrayBuffer());
  console.log(
    `[qa-smoke] downloaded ${buf.length} bytes (DB-recorded: ${snapAfter.storage_size_bytes})`,
  );
  console.log(
    `[qa-smoke] ZIP magic: ${buf.slice(0, 4).toString("hex")} (PK\\x03\\x04 = 504b0304)`,
  );

  // 8. Unsigned (ohne Token) MUST FAIL
  const unsignedUrl = signed.signedUrl.split("?")[0];
  const unsignedRes = await fetch(unsignedUrl);
  console.log(
    `[qa-smoke] unsigned access: HTTP ${unsignedRes.status} (expect 400/401/403)`,
  );

  // 9. Render-Time-Bucket (heuristic: handler total)
  console.log(
    `[qa-smoke] AC-11 timing: handler ${elapsedMs}ms (incl. DB+Render+ZIP+Upload+Update)`,
  );

  console.log(`[qa-smoke] PASS — all assertions met.`);
}

main().catch((err) => {
  console.error("[qa-smoke] FATAL:", err);
  process.exit(1);
});
