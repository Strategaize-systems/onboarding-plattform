import { NextResponse } from "next/server";
import { getAuthUserWithProfile, errorResponse } from "@/lib/api-utils";

// GET /api/tenant/mirror/policy-status — Check if policy is confirmed
export async function GET() {
  const { user, profile, error } = await getAuthUserWithProfile();
  if (error || !user || !profile) {
    return errorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminClient = createAdminClient();

  const { data } = await adminClient
    .from("mirror_policy_confirmations")
    .select("confirmed_at, policy_version")
    .eq("profile_id", user.id)
    .eq("tenant_id", profile.tenant_id)
    .single();

  return NextResponse.json({
    confirmed: !!data,
    confirmedAt: data?.confirmed_at ?? null,
    policyVersion: data?.policy_version ?? null,
  });
}
