import { NextResponse } from "next/server";
import { requireTenant, errorResponse, validationError } from "@/lib/api-utils";
import { freeformAcceptDraftsSchema } from "@/lib/validations";
import { loadConversation, updateConversationStatus } from "@/lib/freeform";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/tenant/runs/[runId]/freeform/accept
// Accept selected draft answers from a mapped conversation as answer_submitted events
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase, profile, user } = auth;
  const { runId } = await params;

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = freeformAcceptDraftsSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { conversationId, acceptedDrafts } = parsed.data;

  // Load conversation — verify ownership and status
  const conversation = await loadConversation(conversationId, user!.id);
  if (!conversation) {
    return errorResponse("NOT_FOUND", "Conversation not found", 404);
  }
  if (conversation.run_id !== runId) {
    return errorResponse("FORBIDDEN", "Conversation does not belong to this run", 403);
  }
  if (conversation.status !== "mapped") {
    return errorResponse("FORBIDDEN", "Conversation must be in 'mapped' status to accept drafts", 403);
  }

  // Load run — verify exists and not locked
  const { data: run, error: runError } = await supabase
    .from("runs")
    .select("id, status, catalog_snapshot_id")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  if (run.status === "locked") {
    return errorResponse("FORBIDDEN", "Run is locked — no further input allowed", 403);
  }

  // Validate that all question_ids exist in this run's catalog
  const adminClient = createAdminClient();
  const draftQuestionIds = acceptedDrafts.map((d) => d.questionId);

  const { data: validQuestions } = await adminClient
    .from("questions")
    .select("frage_id")
    .eq("catalog_snapshot_id", run.catalog_snapshot_id)
    .in("frage_id", draftQuestionIds);

  const validIds = new Set((validQuestions ?? []).map((q: { frage_id: string }) => q.frage_id));
  const invalidIds = draftQuestionIds.filter((id) => !validIds.has(id));

  if (invalidIds.length > 0) {
    return errorResponse(
      "VALIDATION_ERROR",
      `Invalid question IDs: ${invalidIds.join(", ")}`,
      400
    );
  }

  // Resolve frage_id → question UUID for event insertion
  const { data: questionRows } = await adminClient
    .from("questions")
    .select("id, frage_id")
    .eq("catalog_snapshot_id", run.catalog_snapshot_id)
    .in("frage_id", draftQuestionIds);

  const frageIdToUuid = new Map(
    (questionRows ?? []).map((q: { id: string; frage_id: string }) => [q.frage_id, q.id])
  );

  // Insert answer_submitted events for each accepted draft
  let acceptedCount = 0;
  const errors: string[] = [];

  for (const draft of acceptedDrafts) {
    const questionUuid = frageIdToUuid.get(draft.questionId);
    if (!questionUuid) {
      errors.push(`Could not resolve UUID for ${draft.questionId}`);
      continue;
    }

    const { error: insertError } = await adminClient
      .from("question_events")
      .insert({
        client_event_id: crypto.randomUUID(),
        question_id: questionUuid,
        run_id: runId,
        tenant_id: profile!.tenant_id,
        event_type: "answer_submitted",
        payload: {
          text: draft.text,
          source: "freeform",
          conversation_id: conversationId,
        },
        created_by: user!.id,
      });

    if (insertError) {
      errors.push(`Failed to insert event for ${draft.questionId}: ${insertError.message}`);
      const { captureException } = await import("@/lib/logger");
      captureException(insertError, { source: "api/freeform/accept", metadata: { runId, conversationId, questionId: draft.questionId } });
    } else {
      acceptedCount++;
    }
  }

  // Close conversation
  await updateConversationStatus(conversationId, "closed");

  if (errors.length > 0) {
    return NextResponse.json({
      acceptedCount,
      totalDrafts: acceptedDrafts.length,
      conversationStatus: "closed",
      errors,
    }, { status: 207 }); // Multi-Status — partial success
  }

  return NextResponse.json({
    acceptedCount,
    conversationStatus: "closed",
  });
}
