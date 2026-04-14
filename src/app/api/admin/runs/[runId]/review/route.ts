import { NextResponse } from "next/server";
import { requireAdmin, errorResponse } from "@/lib/api-utils";

// GET /api/admin/runs/[runId]/review — Block-level progress overview
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { adminClient } = auth;
  const { runId } = await params;

  // Get run details
  const { data: run, error: runError } = await adminClient!
    .from("runs")
    .select("id, title, status, catalog_snapshot_id, created_at, submitted_at, tenant_id")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  // Get all questions for this run
  const { data: questions } = await adminClient!
    .from("questions")
    .select("id, block, frage_id, fragetext, ebene, unterbereich")
    .eq("catalog_snapshot_id", run.catalog_snapshot_id)
    .order("position");

  // Get current answers
  const { data: currentAnswers } = await adminClient!
    .from("v_current_answers")
    .select("question_id, answer_text")
    .eq("run_id", runId);

  const answerMap = new Map(
    (currentAnswers ?? []).map((a) => [a.question_id, a.answer_text])
  );

  // Get evidence counts per question
  const { data: evidenceItems } = await adminClient!
    .from("evidence_items")
    .select("id")
    .eq("run_id", runId);

  const evidenceIds = (evidenceItems ?? []).map((e) => e.id);
  const evidenceCountMap = new Map<string, number>();

  if (evidenceIds.length > 0) {
    const { data: links } = await adminClient!
      .from("evidence_links")
      .select("link_id")
      .eq("link_type", "question")
      .in("evidence_item_id", evidenceIds);

    (links ?? []).forEach((l) => {
      evidenceCountMap.set(l.link_id, (evidenceCountMap.get(l.link_id) ?? 0) + 1);
    });
  }

  // Get submissions per block
  const { data: submissions } = await adminClient!
    .from("run_submissions")
    .select("block, snapshot_version, submitted_at")
    .eq("run_id", runId)
    .order("snapshot_version", { ascending: false });

  const latestSubmissionByBlock = new Map<string, { version: number; submitted_at: string }>();
  (submissions ?? []).forEach((s) => {
    if (!latestSubmissionByBlock.has(s.block)) {
      latestSubmissionByBlock.set(s.block, {
        version: s.snapshot_version,
        submitted_at: s.submitted_at,
      });
    }
  });

  // Get latest event per block for "last activity"
  const { data: events } = await adminClient!
    .from("question_events")
    .select("question_id, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: false })
    .limit(500);

  const lastActivityByBlock = new Map<string, string>();
  const questionBlockMap = new Map<string, string>();
  (questions ?? []).forEach((q) => questionBlockMap.set(q.id, q.block));

  (events ?? []).forEach((e) => {
    const block = questionBlockMap.get(e.question_id);
    if (block && !lastActivityByBlock.has(block)) {
      lastActivityByBlock.set(block, e.created_at);
    }
  });

  // Aggregate per block
  const blockNames: Record<string, string> = {
    A: "Grundverständnis", B: "Markt & Wettbewerb", C: "Finanzen",
    D: "Organisation", E: "Prozesse", F: "IT & Systeme",
    G: "Recht & Compliance", H: "Strategie", I: "Exit-Readiness",
  };

  const blocks = Array.from(new Set((questions ?? []).map((q) => q.block))).sort();

  const blockStats = blocks.map((block) => {
    const blockQuestions = (questions ?? []).filter((q) => q.block === block);
    const answered = blockQuestions.filter((q) => answerMap.has(q.id)).length;
    const evidenceCount = blockQuestions.reduce(
      (sum, q) => sum + (evidenceCountMap.get(q.id) ?? 0), 0
    );
    const checkpoint = latestSubmissionByBlock.get(block);

    return {
      block,
      name: blockNames[block] ?? block,
      total: blockQuestions.length,
      answered,
      percent: blockQuestions.length > 0 ? Math.round((answered / blockQuestions.length) * 100) : 0,
      evidenceCount,
      checkpoint: checkpoint ?? null,
      lastActivity: lastActivityByBlock.get(block) ?? null,
    };
  });

  const totalQuestions = (questions ?? []).length;
  const totalAnswered = (questions ?? []).filter((q) => answerMap.has(q.id)).length;

  return NextResponse.json({
    run: {
      id: run.id,
      title: run.title,
      status: run.status,
      created_at: run.created_at,
      submitted_at: run.submitted_at,
    },
    overview: {
      totalQuestions,
      totalAnswered,
      totalPercent: totalQuestions > 0 ? Math.round((totalAnswered / totalQuestions) * 100) : 0,
      totalEvidence: evidenceIds.length,
      totalCheckpoints: (submissions ?? []).length,
    },
    blocks: blockStats,
  });
}
