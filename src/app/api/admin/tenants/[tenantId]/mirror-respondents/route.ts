import { NextResponse } from "next/server";
import { requireAdmin, errorResponse } from "@/lib/api-utils";

// GET /api/admin/tenants/[tenantId]/mirror-respondents
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { adminClient } = auth;
  const { tenantId } = await params;

  const { data: respondents, error } = await adminClient!
    .from("profiles")
    .select("id, email, respondent_layer, created_at")
    .eq("tenant_id", tenantId)
    .eq("role", "mirror_respondent")
    .order("created_at", { ascending: false });

  if (error) {
    return errorResponse("INTERNAL_ERROR", error.message, 500);
  }

  // Enrich with block access and invite status
  const enriched = await Promise.all(
    (respondents ?? []).map(async (r) => {
      const { data: blocks } = await adminClient!
        .from("member_block_access")
        .select("block")
        .eq("profile_id", r.id)
        .eq("survey_type", "mirror");

      const { data: authUser } = await adminClient!.auth.admin.getUserById(r.id);
      const confirmed = !!authUser?.user?.email_confirmed_at;

      return {
        id: r.id,
        email: r.email,
        respondent_layer: r.respondent_layer,
        blocks: (blocks ?? []).map((b) => b.block).sort(),
        confirmed,
        created_at: r.created_at,
      };
    })
  );

  // Load nominations for this tenant
  const { data: nominations } = await adminClient!
    .from("mirror_nominations")
    .select("id, name, email, respondent_layer, department, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ respondents: enriched, nominations: nominations ?? [] });
}
