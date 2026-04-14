import { NextResponse } from "next/server";
import { requireTenant, errorResponse, validationError } from "@/lib/api-utils";
import { createEventSchema } from "@/lib/validations";

// POST /api/tenant/runs/[runId]/questions/[questionId]/events — Create a new event
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string; questionId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { user, profile, supabase } = auth;
  const { runId, questionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { client_event_id, event_type, payload } = parsed.data;

  // Verify run belongs to tenant and is not locked (RLS handles tenant check on SELECT)
  const { data: run, error: runError } = await supabase
    .from("runs")
    .select("id, status, tenant_id, catalog_snapshot_id")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  if (run.status === "locked") {
    return errorResponse("FORBIDDEN", "Run is locked — no further events allowed", 403);
  }

  // Verify question exists AND belongs to this run's catalog snapshot
  const { data: question, error: qError } = await supabase
    .from("questions")
    .select("id")
    .eq("id", questionId)
    .eq("catalog_snapshot_id", run.catalog_snapshot_id)
    .single();

  if (qError || !question) {
    return errorResponse("NOT_FOUND", "Question not found in this run's catalog", 404);
  }

  // Idempotency check: does event with this client_event_id already exist?
  const { data: existing } = await supabase
    .from("question_events")
    .select("id, client_event_id, question_id, run_id, event_type, payload, created_at")
    .eq("run_id", runId)
    .eq("client_event_id", client_event_id)
    .single();

  if (existing) {
    // Idempotent retry — return existing event with 200
    return NextResponse.json({ event: existing }, { status: 200 });
  }

  // Insert new event (RLS checks tenant_id + run not locked)
  const { data: event, error: insertError } = await supabase
    .from("question_events")
    .insert({
      client_event_id,
      question_id: questionId,
      run_id: runId,
      tenant_id: profile!.tenant_id,
      event_type,
      payload,
      created_by: user!.id,
    })
    .select("id, client_event_id, question_id, run_id, event_type, payload, created_at")
    .single();

  if (insertError) {
    // Handle unique constraint violation (race condition)
    if (insertError.code === "23505") {
      const { data: retryExisting } = await supabase
        .from("question_events")
        .select("id, client_event_id, question_id, run_id, event_type, payload, created_at")
        .eq("run_id", runId)
        .eq("client_event_id", client_event_id)
        .single();

      if (retryExisting) {
        return NextResponse.json({ event: retryExisting }, { status: 200 });
      }
    }
    return errorResponse("INTERNAL_ERROR", insertError.message, 500);
  }

  return NextResponse.json({ event }, { status: 201 });
}

// GET /api/tenant/runs/[runId]/questions/[questionId]/events — List events
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string; questionId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase } = auth;
  const { runId, questionId } = await params;

  const { data: events, error } = await supabase
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
