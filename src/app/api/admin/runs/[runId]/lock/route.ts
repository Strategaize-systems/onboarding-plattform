import { NextResponse } from "next/server";
import { requireAdmin, errorResponse } from "@/lib/api-utils";

// PATCH /api/admin/runs/[runId]/lock — Lock a run
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase } = auth;
  const { runId } = await params;

  // Call SECURITY DEFINER function via user session (validates admin role internally)
  const { data, error } = await supabase
    .rpc("run_lock", { p_run_id: runId });

  if (error) {
    if (error.message.includes("NOT_FOUND")) {
      return errorResponse("NOT_FOUND", "Run not found", 404);
    }
    if (error.message.includes("already locked")) {
      return errorResponse("UNPROCESSABLE", "Run is already locked", 422);
    }
    if (error.message.includes("FORBIDDEN")) {
      return errorResponse("FORBIDDEN", error.message, 403);
    }
    return errorResponse("INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ run: { id: data.id, status: data.status } });
}
