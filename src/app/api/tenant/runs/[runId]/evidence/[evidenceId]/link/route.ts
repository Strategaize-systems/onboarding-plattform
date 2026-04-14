import { NextResponse } from "next/server";
import { requireTenant, errorResponse, validationError } from "@/lib/api-utils";
import { createEvidenceLinkSchema } from "@/lib/validations";

// POST /api/tenant/runs/[runId]/evidence/[evidenceId]/link — Create evidence link
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string; evidenceId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { user, profile, supabase } = auth;
  const { runId, evidenceId } = await params;

  // Verify run belongs to tenant and is not locked
  const { data: run, error: runError } = await supabase
    .from("runs")
    .select("id, status, tenant_id, catalog_snapshot_id")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  if (run.status === "locked") {
    return errorResponse("FORBIDDEN", "Run is locked", 403);
  }

  // Verify evidence_item belongs to this run
  const { data: evidenceItem } = await supabase
    .from("evidence_items")
    .select("id")
    .eq("id", evidenceId)
    .eq("run_id", runId)
    .single();

  if (!evidenceItem) {
    return errorResponse("NOT_FOUND", "Evidence item not found in this run", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = createEvidenceLinkSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { link_type, link_id, relation } = parsed.data;

  // If linking to a question, verify it belongs to the run's catalog
  if (link_type === "question") {
    const { data: q } = await supabase
      .from("questions")
      .select("id")
      .eq("id", link_id)
      .eq("catalog_snapshot_id", run.catalog_snapshot_id)
      .single();

    if (!q) {
      return errorResponse("NOT_FOUND", "Question not found in this run's catalog", 404);
    }
  }

  // If linking to a run, verify it's this run
  if (link_type === "run" && link_id !== runId) {
    return errorResponse("VALIDATION_ERROR", "link_id must match the current run", 400);
  }

  // INSERT evidence_link (append-only)
  const { data: link, error: insertError } = await supabase
    .from("evidence_links")
    .insert({
      evidence_item_id: evidenceId,
      tenant_id: profile!.tenant_id,
      link_type,
      link_id,
      relation,
    })
    .select("id, evidence_item_id, link_type, link_id, relation, created_at")
    .single();

  if (insertError) {
    return errorResponse("INTERNAL_ERROR", insertError.message, 500);
  }

  // Log evidence_attached event if linking to a question
  if (link_type === "question") {
    await supabase.from("question_events").insert({
      client_event_id: crypto.randomUUID(),
      question_id: link_id,
      run_id: runId,
      tenant_id: profile!.tenant_id,
      event_type: "evidence_attached",
      payload: { evidence_item_id: evidenceId },
      created_by: user!.id,
    });
  }

  return NextResponse.json({ evidence_link: link }, { status: 201 });
}
