import { NextResponse } from "next/server";
import { getAuthUserWithProfile, errorResponse } from "@/lib/api-utils";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/tenant/mirror/profile — Load own mirror profile
export async function GET() {
  const { user, profile, error } = await getAuthUserWithProfile();
  if (error || !user || !profile) {
    return errorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  if (profile.role !== "mirror_respondent") {
    return errorResponse("FORBIDDEN", "Only mirror respondents have mirror profiles", 403);
  }

  const adminClient = createAdminClient();

  const { data, error: dbError } = await adminClient
    .from("mirror_profiles")
    .select("*")
    .eq("profile_id", user.id)
    .single();

  if (dbError || !data) {
    return NextResponse.json({ profile: null });
  }

  return NextResponse.json({ profile: data });
}

// PUT /api/tenant/mirror/profile — Create or update own mirror profile
export async function PUT(request: Request) {
  const { user, profile, error } = await getAuthUserWithProfile();
  if (error || !user || !profile) {
    return errorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  if (profile.role !== "mirror_respondent") {
    return errorResponse("FORBIDDEN", "Only mirror respondents have mirror profiles", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const adminClient = createAdminClient();

  const profileData = {
    profile_id: user.id,
    tenant_id: profile.tenant_id,
    display_name: body.display_name ?? null,
    address_formal: body.address_formal ?? true,
    department: body.department ?? null,
    position_title: body.position_title ?? null,
    leadership_style: body.leadership_style ?? null,
    disc_style: body.disc_style ?? null,
    introduction: body.introduction ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error: upsertError } = await adminClient
    .from("mirror_profiles")
    .upsert(profileData, { onConflict: "profile_id" })
    .select()
    .single();

  if (upsertError) {
    return errorResponse("INTERNAL_ERROR", `Profile save failed: ${upsertError.message}`, 500);
  }

  return NextResponse.json({ profile: data });
}
