import { NextResponse } from "next/server";
import { requireAdmin, errorResponse } from "@/lib/api-utils";

// GET /api/admin/errors — List recent errors
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { adminClient } = auth;
  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  let query = adminClient!
    .from("error_log")
    .select("id, level, source, message, stack, metadata, user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (level) {
    query = query.eq("level", level);
  }

  const { data: errors, error } = await query;

  if (error) {
    return errorResponse("INTERNAL_ERROR", error.message, 500);
  }

  return NextResponse.json({ errors: errors ?? [] });
}
