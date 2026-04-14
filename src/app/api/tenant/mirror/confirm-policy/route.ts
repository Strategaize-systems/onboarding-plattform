import { NextResponse } from "next/server";
import { getAuthUserWithProfile, errorResponse } from "@/lib/api-utils";

// POST /api/tenant/mirror/confirm-policy — Confirm confidentiality policy
export async function POST() {
  const { user, profile, error } = await getAuthUserWithProfile();
  if (error || !user || !profile) {
    return errorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  if (profile.role !== "mirror_respondent") {
    return errorResponse("FORBIDDEN", "Only mirror respondents can confirm policy", 403);
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminClient = createAdminClient();

  const { error: insertError } = await adminClient
    .from("mirror_policy_confirmations")
    .upsert({
      profile_id: user.id,
      tenant_id: profile.tenant_id,
      confirmed_at: new Date().toISOString(),
      policy_version: "v1.0",
    }, { onConflict: "profile_id,tenant_id" });

  if (insertError) {
    return errorResponse("INTERNAL_ERROR", insertError.message, 500);
  }

  return NextResponse.json({ confirmed: true });
}
