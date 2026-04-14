import { NextResponse } from "next/server";
import { requireAdmin, errorResponse } from "@/lib/api-utils";

// GET /api/admin/runs/[runId] — Run details with questions and derived answer state
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { adminClient } = auth;
  const { runId } = await params;

  // Load run with tenant + catalog info
  const { data: run, error } = await adminClient!
    .from("runs")
    .select(
      `
      id, tenant_id, title, description, status, survey_type,
      catalog_snapshot_id, contract_version,
      created_at, submitted_at
    `
    )
    .eq("id", runId)
    .single();

  if (error || !run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  // Load questions for this run's catalog
  const { data: questions } = await adminClient!
    .from("questions")
    .select(
      "id, frage_id, block, ebene, unterbereich, fragetext, position, owner_dependency, deal_blocker, sop_trigger, ko_hart, ko_soft, block_weight"
    )
    .eq("catalog_snapshot_id", run.catalog_snapshot_id)
    .order("position", { ascending: true });

  // Load current answers (derived from events)
  const { data: currentAnswers } = await adminClient!
    .from("v_current_answers")
    .select("question_id, answer_text")
    .eq("run_id", runId);

  // Build answer map
  const answerMap = new Map(
    (currentAnswers ?? []).map((a) => [a.question_id, a.answer_text])
  );

  // Count events per question
  const { data: eventCounts } = await adminClient!
    .from("question_events")
    .select("question_id")
    .eq("run_id", runId);

  const eventCountMap = new Map<string, number>();
  (eventCounts ?? []).forEach((e) => {
    eventCountMap.set(e.question_id, (eventCountMap.get(e.question_id) ?? 0) + 1);
  });

  // Count evidence per question (via evidence_links, filtered at DB level)
  const { data: runEvidenceItems } = await adminClient!
    .from("evidence_items")
    .select("id")
    .eq("run_id", runId);

  const runEvidenceIds = (runEvidenceItems ?? []).map((e) => e.id);

  const evidenceCountMap = new Map<string, number>();

  if (runEvidenceIds.length > 0) {
    const { data: evidenceLinks } = await adminClient!
      .from("evidence_links")
      .select("link_id")
      .eq("link_type", "question")
      .in("evidence_item_id", runEvidenceIds);

    (evidenceLinks ?? []).forEach((e) => {
      evidenceCountMap.set(e.link_id, (evidenceCountMap.get(e.link_id) ?? 0) + 1);
    });
  }

  const enrichedQuestions = (questions ?? []).map((q) => ({
    id: q.id,
    frage_id: q.frage_id,
    block: q.block,
    ebene: q.ebene,
    unterbereich: q.unterbereich,
    fragetext: q.fragetext,
    position: q.position,
    ko_hart: q.ko_hart,
    ko_soft: q.ko_soft,
    latest_answer: answerMap.get(q.id) ?? null,
    event_count: eventCountMap.get(q.id) ?? 0,
    evidence_count: evidenceCountMap.get(q.id) ?? 0,
  }));

  return NextResponse.json({
    run: {
      ...run,
      questions: enrichedQuestions,
    },
  });
}
