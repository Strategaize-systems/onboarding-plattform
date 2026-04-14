import { NextResponse } from "next/server";
import { requireAdmin, errorResponse } from "@/lib/api-utils";

// GET /api/admin/catalog/snapshots/[snapshotId]/questions — List all questions for a snapshot
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { adminClient } = auth;
  const { snapshotId } = await params;

  // Verify snapshot exists
  const { data: snapshot, error: snapError } = await adminClient!
    .from("question_catalog_snapshots")
    .select("id, version")
    .eq("id", snapshotId)
    .single();

  if (snapError || !snapshot) {
    return errorResponse("NOT_FOUND", "Catalog snapshot not found", 404);
  }

  const { data: questions, error } = await adminClient!
    .from("questions")
    .select(
      "id, frage_id, block, ebene, unterbereich, fragetext, owner_dependency, deal_blocker, sop_trigger, ko_hart, ko_soft, block_weight, position"
    )
    .eq("catalog_snapshot_id", snapshotId)
    .order("position", { ascending: true });

  if (error) {
    return errorResponse("INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ questions: questions ?? [] });
}
