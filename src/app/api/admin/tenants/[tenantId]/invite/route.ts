import { NextResponse } from "next/server";
import { requireAdmin, errorResponse, validationError } from "@/lib/api-utils";
import { inviteTenantUserSchema } from "@/lib/validations";
import { sendInviteEmail, sendMirrorInviteEmail } from "@/lib/email";

// POST /api/admin/tenants/[tenantId]/invite — Invite a user to a tenant
export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const auth = await requireAdmin();
  if (auth.errorResponse) return auth.errorResponse;

  const { supabase, adminClient } = auth;
  const { tenantId } = await params;

  // Validate tenant exists
  const { data: tenant, error: tenantError } = await adminClient!
    .from("tenants")
    .select("id, name, language")
    .eq("id", tenantId)
    .single();

  if (tenantError || !tenant) {
    return errorResponse("NOT_FOUND", "Tenant not found", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = inviteTenantUserSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { email, role: inviteRole, allowedBlocks, respondentLayer, surveyType } = parsed.data;
  const emailLower = email.toLowerCase();
  let isReinvite = false;

  // Check if user already exists (targeted lookup with lowercase index)
  const { data: existingProfile } = await adminClient!
    .from("profiles")
    .select("id, email, role, tenant_id")
    .ilike("email", emailLower)
    .single();

  if (existingProfile) {
    // User exists with a profile — check if they're confirmed
    const { data: authUser } = await adminClient!.auth.admin.getUserById(
      existingProfile.id
    );

    if (authUser?.user?.email_confirmed_at) {
      // Fully confirmed user — cannot re-invite
      return errorResponse("CONFLICT", "E-Mail ist bereits registriert und bestätigt", 409);
    }

    // Unconfirmed user — allow re-invite by deleting the old user first
    // (GoTrue will re-create on inviteUserByEmail)
    isReinvite = true;
    await adminClient!.auth.admin.deleteUser(existingProfile.id);
  }

  // Determine role: use provided role, or auto-detect (first user = tenant_admin)
  let role: string;
  if (inviteRole) {
    role = inviteRole;
  } else {
    const { data: existingAdmin } = await adminClient!
      .from("profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("role", "tenant_admin")
      .single();
    role = existingAdmin ? "tenant_member" : "tenant_admin";
  }

  // Create user via GoTrue Admin API and get the invite token.
  // We use generateLink instead of inviteUserByEmail because GoTrue
  // generates verify URLs using the internal Docker hostname (supabase-kong)
  // instead of the external domain. By getting the token ourselves, we can
  // construct the correct URL and send the email via our own SMTP.
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`;
  const { data: linkData, error: linkError } =
    await adminClient!.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: {
          tenant_id: tenantId,
          role,
          ...(allowedBlocks && allowedBlocks.length > 0 ? { allowed_blocks: allowedBlocks } : {}),
          ...(respondentLayer ? { respondent_layer: respondentLayer } : {}),
          ...(surveyType ? { survey_type: surveyType } : {}),
        },
        redirectTo,
      },
    });

  if (linkError || !linkData) {
    return errorResponse(
      "INTERNAL_ERROR",
      linkError?.message ?? "Failed to generate invite link",
      500
    );
  }

  // Construct verify URL pointing directly to OUR callback (not GoTrue's /verify).
  // GoTrue's /verify consumes the token and redirects without passing it to our
  // callback, which skips the set-password step. By going directly to /auth/callback,
  // our route calls verifyOtp() server-side and then redirects to set-password.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const hashedToken = linkData.properties?.hashed_token;
  const tenantLocale = tenant.language ?? "de";
  const verifyUrl = `${appUrl}/auth/callback?token_hash=${hashedToken}&type=invite&locale=${tenantLocale}`;

  // Send invite email via our own SMTP (bypasses GoTrue's broken URL generation)
  // Mirror respondents get a separate, context-rich email template
  try {
    if (role === "mirror_respondent") {
      await sendMirrorInviteEmail({
        to: email,
        tenantName: tenant.name,
        verifyUrl,
        locale: tenant.language ?? "de",
      });
    } else {
      await sendInviteEmail({
        to: email,
        tenantName: tenant.name,
        verifyUrl,
        locale: tenant.language ?? "de",
      });
    }
  } catch (emailError) {
    return errorResponse(
      "INTERNAL_ERROR",
      `User erstellt, aber E-Mail-Versand fehlgeschlagen: ${emailError instanceof Error ? emailError.message : "Unbekannter Fehler"}`,
      500
    );
  }

  // Log admin event (use user session so auth.uid() resolves)
  await supabase.rpc("log_admin_event", {
    p_event_type: isReinvite ? "reinvite_sent" : "invite_sent",
    p_tenant_id: tenantId,
    p_payload: { email, role },
  });

  return NextResponse.json({
    message: `Einladung gesendet an ${email}`,
    role,
  });
}
