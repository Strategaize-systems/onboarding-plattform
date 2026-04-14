import { NextResponse } from "next/server";
import { requireTenant, errorResponse } from "@/lib/api-utils";

// GET /api/tenant/runs/[runId] — Run details with questions and derived answers
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase } = auth;
  const { runId } = await params;

  // RLS ensures tenant isolation
  const { data: run, error } = await supabase
    .from("runs")
    .select("id, title, description, status, catalog_snapshot_id, created_at, submitted_at")
    .eq("id", runId)
    .single();

  if (error || !run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  // Load questions for this catalog
  const { data: questions } = await supabase
    .from("questions")
    .select(
      "id, frage_id, block, ebene, unterbereich, fragetext, position, ko_hart, ko_soft, owner_dependency, deal_blocker, sop_trigger, block_weight"
    )
    .eq("catalog_snapshot_id", run.catalog_snapshot_id)
    .order("position", { ascending: true });

  // Load current answers (derived)
  const { data: currentAnswers } = await supabase
    .from("v_current_answers")
    .select("question_id, answer_text")
    .eq("run_id", runId);

  const answerMap = new Map(
    (currentAnswers ?? []).map((a) => [a.question_id, a.answer_text])
  );

  // Count evidence per question (filtered at DB level)
  const { data: evidenceItems } = await supabase
    .from("evidence_items")
    .select("id")
    .eq("run_id", runId);

  const runEvidenceIds = (evidenceItems ?? []).map((e) => e.id);
  const evidenceCountMap = new Map<string, number>();

  if (runEvidenceIds.length > 0) {
    const { data: evidenceLinks } = await supabase
      .from("evidence_links")
      .select("link_id")
      .eq("link_type", "question")
      .in("evidence_item_id", runEvidenceIds);

    (evidenceLinks ?? []).forEach((l) => {
      evidenceCountMap.set(l.link_id, (evidenceCountMap.get(l.link_id) ?? 0) + 1);
    });
  }

  // Block-level access filtering for tenant_member
  // tenant_admin sees all blocks, tenant_member sees only assigned blocks
  let filteredQuestions = questions ?? [];
  if (auth.profile.role === "tenant_member") {
    const { data: blockAccess } = await supabase
      .from("member_block_access")
      .select("block")
      .eq("profile_id", auth.profile.id)
      .eq("run_id", runId);
    const allowedBlocks = (blockAccess ?? []).map((b) => b.block);
    // Secure default: no entries = no access (not all access)
    filteredQuestions = allowedBlocks.length > 0
      ? filteredQuestions.filter((q) => allowedBlocks.includes(q.block))
      : [];
  }

  const enrichedQuestions = filteredQuestions.map((q) => ({
    id: q.id,
    frage_id: q.frage_id,
    block: q.block,
    ebene: q.ebene,
    unterbereich: q.unterbereich,
    fragetext: q.fragetext,
    position: q.position,
    latest_answer: answerMap.get(q.id) ?? null,
    evidence_count: evidenceCountMap.get(q.id) ?? 0,
  }));

  return NextResponse.json({
    run: {
      id: run.id,
      title: run.title,
      description: run.description,
      status: run.status,
      created_at: run.created_at,
      submitted_at: run.submitted_at,
      questions: enrichedQuestions,
    },
  });
}
