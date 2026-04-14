import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ZodError } from "zod";

// Standard error response format
export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>
) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status }
  );
}

export function validationError(error: ZodError) {
  return errorResponse("VALIDATION_ERROR", "Validation failed", 400, {
    issues: error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  });
}

// Get authenticated user from session
export async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, supabase, error: "UNAUTHORIZED" as const };
  }

  return { user, supabase, error: null };
}

// Get authenticated user + profile (with role + tenant_id)
export async function getAuthUserWithProfile() {
  const { user, supabase, error } = await getAuthUser();
  if (error || !user) {
    return { user: null, profile: null, supabase, error: "UNAUTHORIZED" as const };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, tenant_id, email, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { user, profile: null, supabase, error: "PROFILE_NOT_FOUND" as const };
  }

  return { user, profile, supabase, error: null };
}

// Require admin role — returns error response or { user, profile, adminClient }
export async function requireAdmin() {
  const { user, profile, supabase, error } = await getAuthUserWithProfile();

  if (error === "UNAUTHORIZED" || !user) {
    return {
      user: null,
      profile: null,
      supabase,
      adminClient: null,
      errorResponse: errorResponse("UNAUTHORIZED", "Not authenticated", 401),
    };
  }

  if (error === "PROFILE_NOT_FOUND" || !profile) {
    return {
      user,
      profile: null,
      supabase,
      adminClient: null,
      errorResponse: errorResponse("UNAUTHORIZED", "Profile not found", 401),
    };
  }

  if (profile.role !== "strategaize_admin") {
    return {
      user,
      profile,
      supabase,
      adminClient: null,
      errorResponse: errorResponse("FORBIDDEN", "Admin access required", 403),
    };
  }

  const adminClient = createAdminClient();
  return { user, profile, supabase, adminClient, errorResponse: null };
}

// Require tenant role — returns error response or { user, profile, supabase }
export async function requireTenant() {
  const { user, profile, supabase, error } = await getAuthUserWithProfile();

  if (error === "UNAUTHORIZED" || !user) {
    return {
      user: null,
      profile: null,
      supabase,
      errorResponse: errorResponse("UNAUTHORIZED", "Not authenticated", 401),
    };
  }

  if (error === "PROFILE_NOT_FOUND" || !profile) {
    return {
      user,
      profile: null,
      supabase,
      errorResponse: errorResponse("UNAUTHORIZED", "Profile not found", 401),
    };
  }

  if (!["tenant_admin", "tenant_member", "mirror_respondent"].includes(profile.role)) {
    return {
      user,
      profile,
      supabase,
      errorResponse: errorResponse("FORBIDDEN", "Tenant access required", 403),
    };
  }

  return { user, profile, supabase, errorResponse: null };
}

/** Fetch tenant language for the current user's tenant. Returns "de" as fallback. */
export async function getTenantLocale(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string
): Promise<string> {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("language")
    .eq("id", tenantId)
    .single();
  return tenant?.language ?? "de";
}
