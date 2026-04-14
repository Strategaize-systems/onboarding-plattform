import { NextResponse } from "next/server";
import { requireTenant, errorResponse } from "@/lib/api-utils";

// GET /api/tenant/runs/[runId]/submissions?block=A — List checkpoint history
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase } = auth;
  const { runId } = await params;
  const { searchParams } = new URL(request.url);
  const block = searchParams.get("block");

  let query = supabase
    .from("run_submissions")
    .select("id, run_id, block, snapshot_version, submitted_at, note")
    .eq("run_id", runId)
    .order("snapshot_version", { ascending: false });

  if (block) {
    query = query.eq("block", block);
  }

  const { data: submissions, error } = await query;

  if (error) {
    return errorResponse("INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ submissions: submissions ?? [] });
}
