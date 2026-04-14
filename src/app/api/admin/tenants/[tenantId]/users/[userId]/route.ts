import { NextResponse } from "next/server";
import { requireAdmin, errorResponse } from "@/lib/api-utils";

// DELETE /api/admin/tenants/[tenantId]/users/[userId] — Remove user from tenant
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string; userId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase, adminClient } = auth;
  const { tenantId, userId } = await params;

  // Verify user belongs to this tenant
  const { data: profile } = await adminClient!
    .from("profiles")
    .select("id, email, tenant_id")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .single();

  if (!profile) {
    return errorResponse("NOT_FOUND", "User not found in this tenant", 404);
  }

  // Delete auth user (cascades to profile via handle_new_user trigger / FK)
  const { error: authError } = await adminClient!.auth.admin.deleteUser(userId);
  if (authError) {
    return errorResponse("INTERNAL_ERROR", authError.message, 500);
  }

  await supabase.rpc("log_admin_event", {
    p_event_type: "user_removed",
    p_tenant_id: tenantId,
    p_payload: { user_id: userId, email: profile.email },
  });

  return NextResponse.json({ message: `User "${profile.email}" entfernt` });
}
