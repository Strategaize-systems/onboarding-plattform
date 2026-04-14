import { NextResponse } from "next/server";
import { getAuthUserWithProfile, errorResponse, validationError } from "@/lib/api-utils";
import { updateNominationSchema } from "@/lib/validations";
import { createAdminClient } from "@/lib/supabase/admin";

// PATCH /api/tenant/mirror/nominations/[id] — Update a nomination
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, profile, error } = await getAuthUserWithProfile();
  if (error || !user || !profile) {
    return errorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  if (profile.role !== "tenant_admin") {
    return errorResponse("FORBIDDEN", "Only tenant admins can manage nominations", 403);
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = updateNominationSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const adminClient = createAdminClient();

  // Verify ownership
  const { data: existing } = await adminClient
    .from("mirror_nominations")
    .select("id, tenant_id")
    .eq("id", id)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (!existing) {
    return errorResponse("NOT_FOUND", "Nomination not found", 404);
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.email !== undefined) updateData.email = parsed.data.email.toLowerCase();
  if (parsed.data.respondent_layer !== undefined) updateData.respondent_layer = parsed.data.respondent_layer;
  if (parsed.data.department !== undefined) updateData.department = parsed.data.department;

  const { data: updated, error: updateError } = await adminClient
    .from("mirror_nominations")
    .update(updateData)
    .eq("id", id)
    .select("id, name, email, respondent_layer, department, status, created_at")
    .single();

  if (updateError) {
    return errorResponse("INTERNAL_ERROR", updateError.message, 500);
  }

  return NextResponse.json({ nomination: updated });
}

// DELETE /api/tenant/mirror/nominations/[id] — Delete a nomination
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, profile, error } = await getAuthUserWithProfile();
  if (error || !user || !profile) {
    return errorResponse("UNAUTHORIZED", "Not authenticated", 401);
  }

  if (profile.role !== "tenant_admin") {
    return errorResponse("FORBIDDEN", "Only tenant admins can manage nominations", 403);
  }

  const { id } = await params;
  const adminClient = createAdminClient();

  // Verify ownership
  const { data: existing } = await adminClient
    .from("mirror_nominations")
    .select("id, tenant_id")
    .eq("id", id)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (!existing) {
    return errorResponse("NOT_FOUND", "Nomination not found", 404);
  }

  const { error: deleteError } = await adminClient
    .from("mirror_nominations")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return errorResponse("INTERNAL_ERROR", deleteError.message, 500);
  }

  return NextResponse.json({ message: "Nomination gelöscht" });
}
