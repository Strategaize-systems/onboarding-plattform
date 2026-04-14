import { NextResponse } from "next/server";
import { requireTenant, errorResponse } from "@/lib/api-utils";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/tenant/profile — Load owner profile for current tenant
export async function GET() {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase, profile } = auth;

  const { data, error } = await supabase
    .from("owner_profiles")
    .select("*")
    .eq("tenant_id", profile!.tenant_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ profile: null });
  }

  return NextResponse.json({ profile: data });
}

// PUT /api/tenant/profile — Create or update owner profile
export async function PUT(request: Request) {
  const auth = await requireTenant();
  if (auth.errorResponse) return auth.errorResponse;

  const { profile } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const adminClient = createAdminClient();

  const profileData = {
    tenant_id: profile!.tenant_id,
    display_name: body.display_name ?? null,
    age_range: body.age_range ?? null,
    education: body.education ?? null,
    career_summary: body.career_summary ?? null,
    years_as_owner: body.years_as_owner ?? null,
    address_formal: body.address_formal ?? true,
    address_by_lastname: body.address_by_lastname ?? true,
    leadership_style: body.leadership_style ?? null,
    disc_style: body.disc_style ?? null,
    introduction: body.introduction ?? null,
    updated_at: new Date().toISOString(),
  };

  // Upsert: insert if not exists, update if exists
  const { data, error } = await adminClient
    .from("owner_profiles")
    .upsert(profileData, { onConflict: "tenant_id" })
    .select()
    .single();

  if (error) {
    return errorResponse("INTERNAL_ERROR", `Profile save failed: ${error.message}`, 500);
  }

  return NextResponse.json({ profile: data });
}
