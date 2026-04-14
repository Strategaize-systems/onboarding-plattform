import { NextResponse } from "next/server";
import { requireAdmin, errorResponse, validationError } from "@/lib/api-utils";
import { z } from "zod";

const updateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  language: z.enum(["de", "en", "nl"]).optional(),
});

// GET /api/admin/tenants/[tenantId] — Get tenant details with users
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { adminClient } = auth;
  const { tenantId } = await params;

  const { data: tenant, error } = await adminClient!
    .from("tenants")
    .select("id, name, language, created_at")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    return errorResponse("NOT_FOUND", "Tenant not found", 404);
  }

  // Fetch all users for this tenant
  const { data: profiles } = await adminClient!
    .from("profiles")
    .select("id, email, role, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  // Enrich with invite status from auth.users (email_confirmed_at)
  const users = await Promise.all(
    (profiles ?? []).map(async (p) => {
      const { data: authUser } = await adminClient!.auth.admin.getUserById(p.id);
      return {
        ...p,
        confirmed: !!authUser?.user?.email_confirmed_at,
      };
    })
  );

  return NextResponse.json({ tenant, users });
}

// PATCH /api/admin/tenants/[tenantId] — Update tenant (name, language)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase, adminClient } = auth;
  const { tenantId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = updateTenantSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const updates = parsed.data;
  if (!updates.name && !updates.language) {
    return errorResponse("VALIDATION_ERROR", "Nothing to update", 400);
  }

  const { data: tenant, error } = await adminClient!
    .from("tenants")
    .update(updates)
    .eq("id", tenantId)
    .select("id, name, language, created_at")
    .single();

  if (error) {
    return errorResponse("INTERNAL_ERROR", error.message, 500);
  }

  await supabase.rpc("log_admin_event", {
    p_event_type: "tenant_updated",
    p_tenant_id: tenantId,
    p_payload: updates,
  });

  return NextResponse.json({ tenant });
}

// DELETE /api/admin/tenants/[tenantId] — Delete tenant and all associated data
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase, adminClient } = auth;
  const { tenantId } = await params;

  // Verify tenant exists
  const { data: tenant } = await adminClient!
    .from("tenants")
    .select("id, name")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    return errorResponse("NOT_FOUND", "Tenant not found", 404);
  }

  // Delete all auth users belonging to this tenant (before DB cascade)
  const { data: profiles } = await adminClient!
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId);

  for (const profile of profiles ?? []) {
    await adminClient!.auth.admin.deleteUser(profile.id);
  }

  // Delete tenant via DB function that bypasses append-only triggers.
  // Direct DELETE fails because CASCADE reaches append-only tables
  // (admin_events, question_events, evidence_items, run_submissions)
  // whose triggers block DELETE operations.
  const { error } = await adminClient!.rpc("delete_tenant_cascade", {
    p_tenant_id: tenantId,
  });

  if (error) {
    return errorResponse("INTERNAL_ERROR", error.message, 500);
  }

  // Note: log_admin_event AFTER delete because the tenant no longer exists.
  // We use null tenant_id since the tenant is gone.
  await supabase.rpc("log_admin_event", {
    p_event_type: "tenant_deleted",
    p_payload: { tenant_id: tenantId, tenant_name: tenant.name },
  });

  return NextResponse.json({ message: `Tenant "${tenant.name}" gelöscht` });
}
