import { NextResponse } from "next/server";
import { requireTenant, errorResponse, validationError } from "@/lib/api-utils";
import { runSubmitSchema } from "@/lib/validations";

// POST /api/tenant/runs/[runId]/submit — Submit a checkpoint
export async function POST(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase } = auth;
  const { runId } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — note is optional
  }

  const parsed = runSubmitSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { block, note } = parsed.data;

  // Call SECURITY DEFINER function (validates tenant ownership, run status, block events exist)
  const { data, error } = await supabase.rpc("run_submit", {
    p_run_id: runId,
    p_block: block,
    p_note: note ?? null,
  });

  if (error) {
    if (error.message.includes("NOT_FOUND")) {
      return errorResponse("NOT_FOUND", "Run not found", 404);
    }
    if (error.message.includes("FORBIDDEN")) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    if (error.message.includes("UNPROCESSABLE") || error.message.includes("No question events")) {
      return errorResponse(
        "UNPROCESSABLE",
        "Mindestens ein Frage-Event muss existieren bevor der Run submitted werden kann",
        422
      );
    }
    if (error.message.includes("UNAUTHORIZED")) {
      return errorResponse("UNAUTHORIZED", "Not authenticated", 401);
    }
    return errorResponse("INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json(
    {
      submission: {
        id: data.id,
        run_id: data.run_id,
        block: data.block,
        snapshot_version: data.snapshot_version,
        submitted_at: data.submitted_at,
      },
    },
    { status: 201 }
  );
}
