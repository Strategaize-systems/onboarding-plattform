import { NextResponse } from "next/server";
import { requireTenant, errorResponse } from "@/lib/api-utils";

// GET /api/tenant/runs/[runId]/memory — Load run memory for display
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase } = auth;
  const { runId } = await params;

  const { data, error } = await supabase
    .from("run_memory")
    .select("memory_text, version, updated_at")
    .eq("run_id", runId)
    .single();

  if (error || !data) {
    return NextResponse.json({ memory: null });
  }

  return NextResponse.json({
    memory: {
      text: data.memory_text,
      version: data.version,
      updatedAt: data.updated_at,
    },
  });
}
