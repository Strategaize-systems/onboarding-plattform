// SLC-039 MT-6 — Worker-Job-Handler 'handbook_snapshot_generation'
//
// Lade-Pipeline: handbook_snapshot -> capture_session -> tenant -> template (mit handbook_schema)
// + KUs (status accepted/proposed/edited) + Diagnosen (status confirmed) + SOPs.
// Validate Schema -> renderHandbook -> buildHandbookZip -> Storage-Upload -> UPDATE Snapshot.
//
// Kein Bedrock-Call (DEC-038, $0 Aggregations-Kosten).

import { createAdminClient } from "../../lib/supabase/admin";
import { captureException } from "../../lib/logger";
import type { ClaimedJob } from "../condensation/claim-loop";
import { buildHandbookZip } from "./zip-builder";
import { renderHandbook } from "./renderer";
import { validateHandbookSchema } from "./validate-schema";
import {
  applyBlockReviewFilter,
  countBlockReviewStatuses,
  loadBlockReviewState,
} from "./block-review-filter";
import type {
  DiagnosisRow,
  KnowledgeUnitRow,
  SopRow,
} from "./types";

const STORAGE_BUCKET = "handbook";

export async function handleHandbookSnapshotJob(job: ClaimedJob): Promise<void> {
  const adminClient = createAdminClient();
  const snapshotId = job.payload.handbook_snapshot_id as string | undefined;

  if (!snapshotId) {
    throw new Error(
      "Handbook snapshot job payload missing required field (handbook_snapshot_id)",
    );
  }

  console.log(
    `[handbook-job] Processing job ${job.id} for tenant ${job.tenant_id}, snapshot=${snapshotId}`,
  );

  try {
    // 1. Lade Snapshot-Row
    const { data: snapshot, error: snapErr } = await adminClient
      .from("handbook_snapshot")
      .select(
        "id, tenant_id, capture_session_id, template_id, template_version, status",
      )
      .eq("id", snapshotId)
      .single();

    if (snapErr || !snapshot) {
      throw new Error(
        `Failed to load handbook_snapshot ${snapshotId}: ${snapErr?.message ?? "not found"}`,
      );
    }

    // 2. Lade Tenant (Name fuer INDEX.md)
    const { data: tenantRow, error: tenantErr } = await adminClient
      .from("tenants")
      .select("id, name")
      .eq("id", snapshot.tenant_id)
      .single();

    if (tenantErr || !tenantRow) {
      throw new Error(
        `Failed to load tenant ${snapshot.tenant_id}: ${tenantErr?.message ?? "not found"}`,
      );
    }

    // 3. Lade Template + handbook_schema
    const { data: template, error: tplErr } = await adminClient
      .from("template")
      .select("id, handbook_schema")
      .eq("id", snapshot.template_id)
      .single();

    if (tplErr || !template) {
      throw new Error(
        `Failed to load template ${snapshot.template_id}: ${tplErr?.message ?? "not found"}`,
      );
    }

    if (!template.handbook_schema) {
      throw new Error(
        `Template ${snapshot.template_id} has no handbook_schema — cannot generate snapshot`,
      );
    }

    // 4. Validate Schema (fail fast bei Schema-Drift)
    const schema = validateHandbookSchema(template.handbook_schema);

    // 5. Lade KUs (proposed/accepted/edited) der Quell-Session
    const { data: kuRows, error: kuErr } = await adminClient
      .from("knowledge_unit")
      .select("id, block_key, source, unit_type, title, body, confidence, status")
      .eq("capture_session_id", snapshot.capture_session_id)
      .in("status", ["proposed", "accepted", "edited"])
      .order("block_key");

    if (kuErr) {
      throw new Error(`Failed to load knowledge_units: ${kuErr.message}`);
    }

    const allKnowledgeUnits: KnowledgeUnitRow[] = (kuRows ?? []).map((r) => ({
      id: r.id as string,
      block_key: r.block_key as string,
      source: r.source as string,
      unit_type: r.unit_type as string,
      title: r.title as string,
      body: r.body as string,
      confidence: r.confidence as string,
      status: r.status as string,
    }));

    // 5b. SLC-041 V4.1 Pre-Filter — block_review-Status fuer Mitarbeiter-KUs anwenden.
    // Backwards-Compat (DEC-048): Sessions ohne block_review-Eintraege laufen 1:1 wie pre-V4.1.
    // ISSUE-029 Fix: tenant-only Aggregation, weil block_review-Rows in Mitarbeiter-Sessions
    // liegen und der Worker nur die GF-Session-ID kennt. metadata-Counter (AC-14) wird
    // dadurch korrekt befuellt; Filter-Effekt auf KUs aendert sich nicht (KU-Loader laedt
    // nur GF-Session-KUs).
    const blockReviewState = await loadBlockReviewState(
      adminClient,
      snapshot.tenant_id as string,
    );
    const knowledgeUnits = applyBlockReviewFilter(allKnowledgeUnits, blockReviewState);
    const reviewCounts = countBlockReviewStatuses(blockReviewState);
    console.log(
      `[handbook-job] block_review state: hasAnyRows=${blockReviewState.hasAnyRows} approved=${reviewCounts.approved_blocks} pending=${reviewCounts.pending_blocks} rejected=${reviewCounts.rejected_blocks} — KUs gefiltert ${allKnowledgeUnits.length} -> ${knowledgeUnits.length}`,
    );

    // 6. Lade Diagnosen (alle Status — Filter passiert im Renderer per min_status)
    const { data: diagRows, error: diagErr } = await adminClient
      .from("block_diagnosis")
      .select("id, block_key, content, status")
      .eq("capture_session_id", snapshot.capture_session_id);

    if (diagErr) {
      throw new Error(`Failed to load block_diagnosis: ${diagErr.message}`);
    }

    const diagnoses: DiagnosisRow[] = (diagRows ?? []).map((r) => ({
      id: r.id as string,
      block_key: r.block_key as string,
      status: r.status as string,
      content: (r.content ?? {}) as DiagnosisRow["content"],
    }));

    // 7. Lade SOPs
    const { data: sopRows, error: sopErr } = await adminClient
      .from("sop")
      .select("id, block_key, content")
      .eq("capture_session_id", snapshot.capture_session_id);

    if (sopErr) {
      throw new Error(`Failed to load sop: ${sopErr.message}`);
    }

    const sops: SopRow[] = (sopRows ?? []).map((r) => ({
      id: r.id as string,
      block_key: r.block_key as string,
      content: (r.content ?? {}) as SopRow["content"],
    }));

    console.log(
      `[handbook-job] Loaded ${knowledgeUnits.length} KUs, ${diagnoses.length} diagnoses, ${sops.length} sops`,
    );

    // 8. Render
    const renderStart = Date.now();
    const rendered = renderHandbook({
      schema,
      tenantName: (tenantRow.name as string) ?? "",
      knowledgeUnits,
      diagnoses,
      sops,
      generatedAt: new Date(),
    });
    const renderMs = Date.now() - renderStart;
    console.log(
      `[handbook-job] Rendered ${rendered.counts.section_count} sections in ${renderMs}ms`,
    );

    // 9. ZIP bauen
    const zipResult = await buildHandbookZip({ files: rendered.files });
    const storagePath = `${snapshot.tenant_id}/${snapshot.id}.zip`;
    console.log(
      `[handbook-job] ZIP ready: ${zipResult.size} bytes, path=${storagePath}`,
    );

    // 10. Storage-Upload (service_role bypasst RLS auf storage.objects via Bucket-Policy)
    const { error: uploadErr } = await adminClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, zipResult.buffer, {
        contentType: "application/zip",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }

    // 11. UPDATE handbook_snapshot -> ready
    // SLC-041: metadata enthaelt Audit-Counter fuer Block-Review-Status (AC-14).
    const { error: updErr } = await adminClient
      .from("handbook_snapshot")
      .update({
        status: "ready",
        storage_path: storagePath,
        storage_size_bytes: zipResult.size,
        section_count: rendered.counts.section_count,
        knowledge_unit_count: rendered.counts.knowledge_unit_count,
        diagnosis_count: rendered.counts.diagnosis_count,
        sop_count: rendered.counts.sop_count,
        metadata: {
          pending_blocks: reviewCounts.pending_blocks,
          approved_blocks: reviewCounts.approved_blocks,
          rejected_blocks: reviewCounts.rejected_blocks,
        },
      })
      .eq("id", snapshot.id);

    if (updErr) {
      throw new Error(`Failed to update handbook_snapshot: ${updErr.message}`);
    }

    // 12. Optional: ai_cost_ledger-Eintrag mit cost=0 fuer Audit-Konsistenz
    try {
      await adminClient.from("ai_cost_ledger").insert({
        tenant_id: snapshot.tenant_id,
        job_id: job.id,
        model_id: "deterministic",
        tokens_in: 0,
        tokens_out: 0,
        usd_cost: 0,
        duration_ms: renderMs,
        role: "handbook_renderer",
        feature: "handbook_snapshot",
      });
    } catch (costErr) {
      captureException(costErr, {
        source: "handbook-job",
        metadata: { jobId: job.id, action: "log-costs" },
      });
    }

    // 13. Job complete
    const { error: completeErr } = await adminClient.rpc("rpc_complete_ai_job", {
      p_job_id: job.id,
    });
    if (completeErr) {
      throw new Error(`Failed to complete handbook job: ${completeErr.message}`);
    }

    console.log(
      `[handbook-job] Job ${job.id} completed (${rendered.counts.section_count} sections, ${zipResult.size} bytes)`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await adminClient
        .from("handbook_snapshot")
        .update({
          status: "failed",
          error_message: msg.slice(0, 2000),
        })
        .eq("id", snapshotId);
    } catch (updErr) {
      captureException(updErr, {
        source: "handbook-job",
        metadata: { snapshotId, action: "mark-failed" },
      });
    }
    throw err;
  }
}
