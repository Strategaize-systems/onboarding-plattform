import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant, errorResponse, validationError } from "@/lib/api-utils";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_QUESTION_KEYS = ["coverage", "clarity", "improvements", "overall"] as const;

const feedbackItemSchema = z.object({
  question_key: z.enum(ALLOWED_QUESTION_KEYS),
  response_text: z.string().nullable().optional(),
  response_rating: z.number().int().min(1).max(5).nullable().optional(),
});

const feedbackBodySchema = z.object({
  items: z.array(feedbackItemSchema).min(1).max(4),
});

// GET /api/tenant/runs/[runId]/feedback — All feedback entries for this run
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { profile, supabase } = auth;
  const { runId } = await params;

  // Role check: only tenant_admin (tenant_owner was migrated to tenant_admin in 004)
  if (profile.role !== "tenant_admin") {
    return errorResponse("FORBIDDEN", "Only tenant admins can access feedback", 403);
  }

  // RLS enforces tenant isolation on runs
  const { data: run, error: runError } = await supabase
    .from("runs")
    .select("id, status, survey_type")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  // Feedback is only for management runs
  if (run.survey_type !== "management") {
    return errorResponse("FORBIDDEN", "Feedback is only available for management runs", 403);
  }

  // Use adminClient for reading feedback (RLS on run_feedback requires tenant_admin/owner,
  // but we've already verified role + tenant via requireTenant + run lookup)
  const adminClient = createAdminClient();
  const { data: feedback, error: feedbackError } = await adminClient
    .from("run_feedback")
    .select("id, question_key, response_text, response_rating, created_at, updated_at")
    .eq("run_id", runId)
    .eq("tenant_id", profile.tenant_id)
    .order("created_at", { ascending: true });

  if (feedbackError) {
    return errorResponse("INTERNAL_ERROR", feedbackError.message, 500);
  }

  return NextResponse.json({ feedback: feedback ?? [] });
}

// POST /api/tenant/runs/[runId]/feedback — UPSERT feedback items
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { profile, supabase } = auth;
  const { runId } = await params;

  // Role check: only tenant_admin
  if (profile.role !== "tenant_admin") {
    return errorResponse("FORBIDDEN", "Only tenant admins can submit feedback", 403);
  }

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = feedbackBodySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  // Verify run exists, belongs to tenant (RLS), and has correct status + type
  const { data: run, error: runError } = await supabase
    .from("runs")
    .select("id, status, survey_type")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  if (run.survey_type !== "management") {
    return errorResponse("FORBIDDEN", "Feedback is only available for management runs", 403);
  }

  if (!["submitted", "locked"].includes(run.status)) {
    return errorResponse(
      "CONFLICT",
      "Feedback can only be submitted for runs with status submitted or locked",
      409
    );
  }

  // UPSERT feedback items via adminClient (already validated role + tenant + run)
  const adminClient = createAdminClient();
  const now = new Date().toISOString();

  const upsertData = parsed.data.items.map((item) => ({
    run_id: runId,
    tenant_id: profile.tenant_id,
    question_key: item.question_key,
    response_text: item.response_text ?? null,
    response_rating: item.question_key === "overall" ? (item.response_rating ?? null) : null,
    updated_at: now,
  }));

  const { data: result, error: upsertError } = await adminClient
    .from("run_feedback")
    .upsert(upsertData, { onConflict: "run_id,question_key" })
    .select("id, question_key, response_text, response_rating, created_at, updated_at");

  if (upsertError) {
    return errorResponse("INTERNAL_ERROR", upsertError.message, 500);
  }

  return NextResponse.json({ feedback: result ?? [] }, { status: 200 });
}
