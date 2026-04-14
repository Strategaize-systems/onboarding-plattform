import { NextResponse } from "next/server";
import { requireAdmin, errorResponse } from "@/lib/api-utils";
import archiver from "archiver";
import { PassThrough } from "stream";

// GET /api/admin/runs/[runId]/export — Generate ZIP matching Data Contract v1.0
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { user, supabase, adminClient } = auth;
  const { runId } = await params;

  // Load run
  const { data: run, error: runError } = await adminClient!
    .from("runs")
    .select("id, tenant_id, title, description, status, survey_type, catalog_snapshot_id, contract_version, due_date, created_at, submitted_at")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  // Load tenant
  const { data: tenant } = await adminClient!
    .from("tenants")
    .select("id, name")
    .eq("id", run.tenant_id)
    .single();

  // Load catalog snapshot
  const { data: snapshot } = await adminClient!
    .from("question_catalog_snapshots")
    .select("id, version, blueprint_version, hash, question_count, created_at")
    .eq("id", run.catalog_snapshot_id)
    .single();

  // Load questions
  const { data: questions } = await adminClient!
    .from("questions")
    .select("id, frage_id, block, ebene, unterbereich, fragetext, owner_dependency, deal_blocker, sop_trigger, ko_hart, ko_soft, block_weight, position")
    .eq("catalog_snapshot_id", run.catalog_snapshot_id)
    .order("position", { ascending: true });

  // Load all question_events for this run (SoT) — sorted ascending
  const { data: events } = await adminClient!
    .from("question_events")
    .select("id, client_event_id, question_id, run_id, tenant_id, event_type, payload, created_at, created_by")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  // Load current answers (derived from v_current_answers)
  const { data: currentAnswers } = await adminClient!
    .from("v_current_answers")
    .select("event_id, run_id, question_id, tenant_id, answer_text, answered_at, created_by")
    .eq("run_id", runId);

  // Load evidence items
  const { data: evidenceItems } = await adminClient!
    .from("evidence_items")
    .select("id, tenant_id, run_id, item_type, label, file_path, file_name, file_size_bytes, file_mime_type, sha256, note_text, created_at, created_by")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  // Load evidence links (scoped to this run's evidence)
  const evidenceIds = (evidenceItems ?? []).map((e) => e.id);
  let evidenceLinks: Array<{
    id: string;
    evidence_item_id: string;
    link_type: string;
    link_id: string;
    relation: string;
    question_event_id: string | null;
    created_at: string;
  }> = [];

  if (evidenceIds.length > 0) {
    const { data } = await adminClient!
      .from("evidence_links")
      .select("id, evidence_item_id, link_type, link_id, relation, question_event_id, created_at")
      .in("evidence_item_id", evidenceIds)
      .order("created_at", { ascending: true });
    evidenceLinks = data ?? [];
  }

  // Load submissions
  const { data: submissions } = await adminClient!
    .from("run_submissions")
    .select("id, run_id, tenant_id, submitted_by, submitted_at, snapshot_version, note")
    .eq("run_id", runId)
    .order("submitted_at", { ascending: true });

  // V3.4: Load feedback (depersonalized — no created_by in table)
  const { data: feedbackData } = await adminClient!
    .from("run_feedback")
    .select("question_key, response_text, response_rating, created_at, updated_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });

  const allFeedback = feedbackData ?? [];

  // V3.4: Load freeform conversations (only for management runs — COMPLIANCE DEC-044)
  const isMirror = run.survey_type === "mirror";
  let freeformConversations: Array<{
    id: string;
    conversation_number: number;
    messages: unknown;
    status: string;
    message_count: number;
    mapping_result: unknown;
    created_at: string;
    updated_at: string;
  }> = [];

  if (!isMirror) {
    // Management: include freeform conversations in export
    const { data: freeformData } = await adminClient!
      .from("freeform_conversations")
      .select("id, conversation_number, messages, status, message_count, mapping_result, created_at, updated_at")
      .eq("run_id", runId)
      .order("conversation_number", { ascending: true });
    freeformConversations = freeformData ?? [];
  }
  // Mirror: freeform explicitly NOT loaded (COMPLIANCE DEC-044: Mirror raw conversations must never be exported)

  // Mirror depersonalization: map profile_id → respondent_layer
  let respondentLayerMap = new Map<string, string>();

  if (isMirror) {
    const { data: profiles } = await adminClient!
      .from("profiles")
      .select("id, respondent_layer")
      .eq("tenant_id", run.tenant_id)
      .eq("role", "mirror_respondent");

    respondentLayerMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.respondent_layer ?? "unknown"])
    );
  }

  // Build frage_id map for export (question UUID -> frage_id)
  const questionIdToFrageId = new Map(
    (questions ?? []).map((q) => [q.id, q.frage_id])
  );

  const exportedAt = new Date().toISOString();
  const allQuestions = questions ?? [];
  const allEvents = events ?? [];
  const allAnswers = currentAnswers ?? [];
  const allEvidenceItems = evidenceItems ?? [];
  const allSubmissions = submissions ?? [];

  // Build file list for manifest
  const fileList = [
    "manifest.json",
    "run.json",
    "question_catalog_snapshot.json",
    "questions_meta.json",
    "answer_revisions.json",
    "answers.json",
    "evidence/index.json",
    "evidence_links.json",
    "submissions.json",
  ];

  // V3.4: Add feedback.json if feedback exists
  const hasFeedback = allFeedback.length > 0;
  if (hasFeedback) {
    fileList.push("feedback.json");
  }

  // V3.4: Add freeform conversation files (management only)
  const includesFreeform = freeformConversations.length > 0;
  for (const conv of freeformConversations) {
    fileList.push(`freeform/conversation_${conv.conversation_number}.json`);
  }

  // Add physical evidence files
  const fileEvidenceItems = allEvidenceItems.filter((e) => e.item_type === "file" && e.file_path);
  for (const e of fileEvidenceItems) {
    fileList.push(`evidence/${e.id}/${e.file_name}`);
  }

  // === Build JSON content ===

  const manifestJson = {
    contract_version: isMirror ? "v2.0" : "v1.0",
    survey_type: run.survey_type ?? "management",
    exported_at: exportedAt,
    exported_by: user!.email ?? user!.id,
    tenant_id: run.tenant_id,
    tenant_name: tenant?.name ?? "Unknown",
    run_id: run.id,
    run_title: run.title,
    run_status: run.status,
    run_due_date: run.due_date ?? null,
    blueprint_version: snapshot?.blueprint_version ?? "unknown",
    catalog_snapshot_hash: snapshot?.hash ?? "unknown",
    total_questions: allQuestions.length,
    total_answers_derived: allAnswers.length,
    total_events: allEvents.length,
    total_evidence_items: allEvidenceItems.length,
    total_submissions: allSubmissions.length,
    has_feedback: hasFeedback,
    includes_freeform: includesFreeform,
    files: fileList,
    missing_files: [] as string[],
  };

  const runJson = {
    id: run.id,
    tenant_id: run.tenant_id,
    title: run.title,
    description: run.description,
    status: run.status,
    survey_type: run.survey_type ?? "management",
    catalog_snapshot_id: run.catalog_snapshot_id,
    contract_version: run.contract_version,
    blueprint_version: snapshot?.blueprint_version ?? "unknown",
    due_date: run.due_date ?? null,
    created_at: run.created_at,
    submitted_at: run.submitted_at,
  };

  const catalogSnapshotJson = {
    id: snapshot?.id,
    version: snapshot?.version,
    blueprint_version: snapshot?.blueprint_version,
    hash: snapshot?.hash,
    question_count: snapshot?.question_count,
    created_at: snapshot?.created_at,
  };

  const questionsMetaJson = allQuestions.map((q) => ({
    id: q.id,
    frage_id: q.frage_id,
    block: q.block,
    ebene: q.ebene,
    unterbereich: q.unterbereich,
    fragetext: q.fragetext,
    owner_dependency: q.owner_dependency,
    deal_blocker: q.deal_blocker,
    sop_trigger: q.sop_trigger,
    ko_hart: q.ko_hart,
    ko_soft: q.ko_soft,
    block_weight: q.block_weight,
    position: q.position,
  }));

  // Helper: depersonalize created_by for mirror exports
  const depersonalize = (profileId: string | null) =>
    isMirror ? (respondentLayerMap.get(profileId ?? "") ?? "unknown") : profileId;

  // answer_revisions.json = SoT (all events, sorted ascending)
  const answerRevisionsJson = allEvents.map((e) => ({
    id: e.id,
    client_event_id: e.client_event_id,
    question_id: questionIdToFrageId.get(e.question_id) ?? e.question_id,
    run_id: e.run_id,
    tenant_id: e.tenant_id,
    event_type: e.event_type,
    payload: e.payload,
    created_at: e.created_at,
    ...(isMirror
      ? { respondent_layer: depersonalize(e.created_by) }
      : { created_by: e.created_by }),
  }));

  // answers.json = derived (latest answer per question)
  const answersJson = allAnswers.map((a) => ({
    tenant_id: a.tenant_id,
    run_id: a.run_id,
    question_id: questionIdToFrageId.get(a.question_id) ?? a.question_id,
    answer_text: a.answer_text,
    answered_at: a.answered_at,
    answer_source: "platform_input",
    ...(isMirror
      ? { respondent_layer: depersonalize(a.created_by) }
      : { created_by: a.created_by }),
    derived_from_event_id: a.event_id,
    derived_at: exportedAt,
  }));

  // evidence/index.json
  const evidenceIndexJson = allEvidenceItems.map((e) => ({
    id: e.id,
    tenant_id: e.tenant_id,
    run_id: e.run_id,
    item_type: e.item_type,
    label: e.label,
    file_name: e.file_name,
    file_size_bytes: e.file_size_bytes,
    file_mime_type: e.file_mime_type,
    sha256: e.sha256,
    note_text: e.note_text,
    storage_uri: e.file_path ?? null,
    created_at: e.created_at,
    ...(isMirror
      ? { respondent_layer: depersonalize(e.created_by) }
      : { created_by: e.created_by }),
  }));

  const evidenceLinksJson = evidenceLinks.map((l) => ({
    id: l.id,
    evidence_item_id: l.evidence_item_id,
    link_type: l.link_type,
    link_id: l.link_type === "question"
      ? (questionIdToFrageId.get(l.link_id) ?? l.link_id)
      : l.link_id,
    relation: l.relation,
    question_event_id: l.question_event_id,
    created_at: l.created_at,
  }));

  const submissionsJson = allSubmissions.map((s) => ({
    id: s.id,
    run_id: s.run_id,
    tenant_id: s.tenant_id,
    ...(isMirror
      ? { respondent_layer: depersonalize(s.submitted_by) }
      : { submitted_by: s.submitted_by }),
    submitted_at: s.submitted_at,
    snapshot_version: s.snapshot_version,
    note: s.note,
  }));

  // === Stream ZIP ===

  const passthrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.pipe(passthrough);

  // Append JSON files
  archive.append(JSON.stringify(runJson, null, 2), { name: "run.json" });
  archive.append(JSON.stringify(catalogSnapshotJson, null, 2), { name: "question_catalog_snapshot.json" });
  archive.append(JSON.stringify(questionsMetaJson, null, 2), { name: "questions_meta.json" });
  archive.append(JSON.stringify(answerRevisionsJson, null, 2), { name: "answer_revisions.json" });
  archive.append(JSON.stringify(answersJson, null, 2), { name: "answers.json" });
  archive.append(JSON.stringify(evidenceIndexJson, null, 2), { name: "evidence/index.json" });
  archive.append(JSON.stringify(evidenceLinksJson, null, 2), { name: "evidence_links.json" });
  archive.append(JSON.stringify(submissionsJson, null, 2), { name: "submissions.json" });

  // V3.4: Append feedback.json (depersonalized — no user reference)
  if (hasFeedback) {
    const feedbackJson = {
      run_id: runId,
      feedback: allFeedback.map((f) => ({
        question_key: f.question_key,
        response_text: f.response_text,
        response_rating: f.response_rating,
      })),
      submitted_at: allFeedback[allFeedback.length - 1]?.updated_at ?? exportedAt,
    };
    archive.append(JSON.stringify(feedbackJson, null, 2), { name: "feedback.json" });
  }

  // V3.4: Append freeform conversations (management only — COMPLIANCE DEC-044)
  for (const conv of freeformConversations) {
    const convJson = {
      conversation_number: conv.conversation_number,
      status: conv.status,
      message_count: conv.message_count,
      messages: conv.messages,
      mapping_result: conv.mapping_result,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
    };
    archive.append(
      JSON.stringify(convJson, null, 2),
      { name: `freeform/conversation_${conv.conversation_number}.json` }
    );
  }

  // Download and append physical evidence files
  for (const item of fileEvidenceItems) {
    if (!item.file_path) continue;
    const storagePath = item.file_path.replace(/^evidence\//, "");
    try {
      const { data: fileData, error: dlError } = await adminClient!.storage
        .from("evidence")
        .download(storagePath);

      if (dlError || !fileData) {
        manifestJson.missing_files.push(`evidence/${item.id}/${item.file_name}`);
        continue;
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      archive.append(buffer, { name: `evidence/${item.id}/${item.file_name}` });
    } catch {
      manifestJson.missing_files.push(`evidence/${item.id}/${item.file_name}`);
    }
  }

  // Append manifest LAST (so missing_files is populated)
  archive.append(JSON.stringify(manifestJson, null, 2), { name: "manifest.json" });

  archive.finalize();

  // Build filename
  const now = new Date();
  // Build yyyyMMdd_HHmmss from ISO string (avoid regex that Tailwind scanner picks up)
  const isoStr = now.toISOString();
  const timestamp = isoStr.slice(0, 10).replace(/-/g, "") + "_" + isoStr.slice(11, 19).replace(/:/g, "");
  const zipFilename = `export_${run.tenant_id}_${runId}_${timestamp}.zip`;

  // Log export event (use user session so auth.uid() resolves)
  await supabase.rpc("log_admin_event", {
    p_event_type: "export_generated",
    p_run_id: runId,
    p_tenant_id: run.tenant_id,
    p_payload: {
      contract_version: isMirror ? "v2.0" : "v1.0",
      survey_type: run.survey_type ?? "management",
      total_events: allEvents.length,
      total_evidence: allEvidenceItems.length,
      has_feedback: hasFeedback,
      includes_freeform: includesFreeform,
    },
  });

  // Convert Node.js stream to Web ReadableStream
  const readable = new ReadableStream({
    start(controller) {
      passthrough.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      passthrough.on("end", () => {
        controller.close();
      });
      passthrough.on("error", (err) => {
        controller.error(err);
      });
    },
  });

  return new NextResponse(readable, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFilename}"`,
      "Cache-Control": "no-store",
    },
  });
}
