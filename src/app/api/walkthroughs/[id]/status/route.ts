import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * SLC-071 MT-7 — Status-Polling-Endpoint.
 *
 * GET /api/walkthroughs/[id]/status
 *
 * Returns the current `walkthrough_session` status. Visibility is enforced by
 * the `walkthrough_session_select` RLS policy from MIG-031/083: users see only
 * sessions they recorded; tenant_admins see their tenant; strategaize_admin
 * sees all. A row that the policy hides surfaces as 404 here on purpose — we
 * don't tell unauthorised callers whether the id exists.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Nicht authentifiziert" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("walkthrough_session")
    .select(
      "id, status, transcript_completed_at, reviewed_at, reviewer_note, failure_reason, created_at, duration_sec"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `walkthrough_session lookup fehlgeschlagen: ${error.message}` },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "Walkthrough nicht gefunden" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}
