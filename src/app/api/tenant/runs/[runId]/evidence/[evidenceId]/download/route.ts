import { NextResponse } from "next/server";
import { requireTenant, errorResponse } from "@/lib/api-utils";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/tenant/runs/[runId]/evidence/[evidenceId]/download — Generate signed URL
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string; evidenceId: string }> }
) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase } = auth;
  const { runId, evidenceId } = await params;

  // Verify run access (RLS handles tenant isolation)
  const { data: run } = await supabase
    .from("runs")
    .select("id")
    .eq("id", runId)
    .single();

  if (!run) {
    return errorResponse("NOT_FOUND", "Run not found", 404);
  }

  // Verify evidence item belongs to this run and is a file
  const { data: item } = await supabase
    .from("evidence_items")
    .select("id, item_type, file_path, file_name")
    .eq("id", evidenceId)
    .eq("run_id", runId)
    .single();

  if (!item) {
    return errorResponse("NOT_FOUND", "Evidence item not found", 404);
  }

  if (item.item_type !== "file" || !item.file_path) {
    return errorResponse("VALIDATION_ERROR", "Evidence item is not a file", 400);
  }

  // Generate signed URL using admin client (15 min expiry)
  const adminClient = createAdminClient();
  const storagePath = item.file_path.replace(/^evidence\//, "");

  const { data: signedUrl, error } = await adminClient.storage
    .from("evidence")
    .createSignedUrl(storagePath, 900); // 15 minutes

  if (error || !signedUrl) {
    return errorResponse("INTERNAL_ERROR", "Could not generate download URL", 500);
  }

  return NextResponse.json({
    download_url: signedUrl.signedUrl,
    file_name: item.file_name,
    expires_in: 900,
  });
}
