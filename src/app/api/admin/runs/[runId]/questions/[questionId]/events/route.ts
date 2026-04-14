import { NextResponse } from "next/server";
import { requireAdmin, errorResponse } from "@/lib/api-utils";

// GET /api/admin/runs/[runId]/questions/[questionId]/events — Admin: list all events for a question
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string; questionId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { adminClient } = auth;
  const { runId, questionId } = await params;

  const { data: events, error } = await adminClient!
    .from("question_events")
    .select("id, event_type, payload, created_at, created_by")
    .eq("run_id", runId)
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return errorResponse("INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ events: events ?? [] });
}
