import { NextResponse } from "next/server";
import { getAuthUserWithProfile, errorResponse, validationError } from "@/lib/api-utils";
import { createNominationSchema } from "@/lib/validations";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/tenant/mirror/nominations — List nominations for own tenant
export async function GET() {
  const { user, profile, error } = await getAuthUserWithProfile();
  if (error || !user || !profile) {
    return errorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  if (profile.role !== "tenant_admin") {
    return errorResponse("FORBIDDEN", "Only tenant admins can manage nominations", 403);
  }

  const adminClient = createAdminClient();

  const { data: nominations, error: dbError } = await adminClient
    .from("mirror_nominations")
    .select("id, name, email, respondent_layer, department, status, created_at")
    .eq("tenant_id", profile.tenant_id)
    .order("created_at", { ascending: false });

  if (dbError) {
    return errorResponse("INTERNAL_ERROR", dbError.message, 500);
  }

  return NextResponse.json({ nominations: nominations ?? [] });
}

// POST /api/tenant/mirror/nominations — Create a nomination
export async function POST(request: Request) {
  const { user, profile, error } = await getAuthUserWithProfile();
  if (error || !user || !profile) {
    return errorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  if (profile.role !== "tenant_admin") {
    return errorResponse("FORBIDDEN", "Only tenant admins can manage nominations", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = createNominationSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const adminClient = createAdminClient();

  const { data: nomination, error: insertError } = await adminClient
    .from("mirror_nominations")
    .insert({
      tenant_id: profile.tenant_id,
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      respondent_layer: parsed.data.respondent_layer,
      department: parsed.data.department,
      created_by: user.id,
    })
    .select("id, name, email, respondent_layer, department, status, created_at")
    .single();

  if (insertError) {
    return errorResponse("INTERNAL_ERROR", insertError.message, 500);
  }

  return NextResponse.json({ nomination }, { status: 201 });
}
