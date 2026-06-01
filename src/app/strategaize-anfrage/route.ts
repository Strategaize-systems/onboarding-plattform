// V8.1 SLC-163 MT-7 — GET /strategaize-anfrage Magic-Link-Endpoint.
//
// Flow:
//   1. Token aus URL-Query lesen
//   2. verifyCtaMagicLinkToken → Invalid: Redirect zu /strategaize-anfrage/error
//      + recordCtaInvalidToken
//   3. Valid: capture_session aus DB lesen (admin-client)
//   4. Atomic-UPDATE WHERE released_for_strategaize_review = false:
//      - matched_rows = 0 → Idempotent-Skip: recordCtaIdempotentSkip,
//        Redirect zu /strategaize-anfrage/bestaetigung
//      - matched_rows = 1 → Flag wurde gerade gesetzt, weiter:
//   5. partner_organization aus DB lesen
//   6. sendStrategaizeAnfrageEmails (parallel BD + StB)
//   7. recordCtaTrigger + ggf. recordStbNotificationSkippedNoEmail
//   8. Redirect zu /strategaize-anfrage/bestaetigung

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyCtaMagicLinkToken,
} from "@/lib/cta/token";
import {
  recordCtaTrigger,
  recordCtaInvalidToken,
  recordCtaIdempotentSkip,
  recordStbNotificationSkippedNoEmail,
} from "@/lib/cta/audit";
import { sendStrategaizeAnfrageEmails } from "@/lib/email/v8-1/send-strategaize-anfrage-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://onboarding.strategaizetransition.com"
  );
}

function redirectTo(path: string, request: Request): NextResponse {
  const base = new URL(request.url).origin || appUrl();
  return NextResponse.redirect(new URL(path, base), { status: 302 });
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  const admin = createAdminClient();

  if (!token) {
    await recordCtaInvalidToken(admin, {
      tokenExcerpt: "",
      reason: "malformed",
    });
    return redirectTo("/strategaize-anfrage/error?reason=malformed", request);
  }

  const verify = verifyCtaMagicLinkToken(token);
  if (!verify.valid) {
    await recordCtaInvalidToken(admin, {
      tokenExcerpt: token.slice(0, 64),
      reason: verify.reason,
    });
    return redirectTo(
      `/strategaize-anfrage/error?reason=${encodeURIComponent(verify.reason)}`,
      request,
    );
  }

  const captureSessionId = verify.payload.capture_session_id;

  // Race-safe Idempotency via atomic UPDATE WHERE released = false (R5 spec).
  const { data: updateData, error: updateError } = await admin
    .from("capture_session")
    .update({ released_for_strategaize_review: true })
    .eq("id", captureSessionId)
    .eq("released_for_strategaize_review", false)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return redirectTo(
      "/strategaize-anfrage/error?reason=internal",
      request,
    );
  }

  if (!updateData) {
    // Row existiert nicht ODER Flag bereits true (idempotent).
    await recordCtaIdempotentSkip(admin, {
      captureSessionId,
      source: "pdf_magic_link",
    });
    return redirectTo("/strategaize-anfrage/bestaetigung", request);
  }

  // Erste Triggerung — Session + Partner laden, Emails senden.
  const { data: session } = await admin
    .from("capture_session")
    .select(
      "id, owner_user_id, partner_organization_id, metadata, tenant_id",
    )
    .eq("id", captureSessionId)
    .maybeSingle();

  if (!session) {
    return redirectTo(
      "/strategaize-anfrage/error?reason=internal",
      request,
    );
  }

  const { data: partner } = await admin
    .from("partner_organization")
    .select("id, name, contact_email")
    .eq("id", session.partner_organization_id ?? verify.payload.partner_organization_id)
    .maybeSingle();

  const snapshot = (session.metadata?.v8_report_snapshot ?? {}) as Record<
    string,
    unknown
  >;
  const mandantInfo = (snapshot.mandant ?? {}) as {
    name?: string;
    firma?: string;
    email?: string;
  };
  const sui = (snapshot.sui ?? {}) as { gesamt_score?: number };
  const hebelArr = Array.isArray(snapshot.hebel) ? snapshot.hebel : [];
  const dreiHebelNamen = hebelArr
    .map((h: { modul_name?: string }) => h?.modul_name ?? "")
    .filter((s: string) => s.length > 0);

  const sendResult = await sendStrategaizeAnfrageEmails({
    captureSession: {
      id: captureSessionId,
      mandant_email: mandantInfo.email ?? verify.payload.mandant_email,
      mandant_name: mandantInfo.name ?? "",
      mandant_firma: mandantInfo.firma ?? "",
      sui_score: sui.gesamt_score ?? 0,
      drei_hebel_modul_namen: dreiHebelNamen,
      diagnose_link_admin: `${appUrl()}/admin/diagnose/${captureSessionId}`,
    },
    partner: {
      id: partner?.id ?? verify.payload.partner_organization_id,
      name: partner?.name ?? "Unbekannter Partner",
      contact_email: partner?.contact_email ?? null,
    },
  });

  await recordCtaTrigger(admin, {
    captureSessionId,
    source: "pdf_magic_link",
    bdSent: sendResult.bd_sent,
    stbSent: sendResult.stb_sent,
    stbSkipReason: sendResult.stb_skip_reason,
  });

  if (sendResult.stb_skip_reason === "no_email" && partner) {
    await recordStbNotificationSkippedNoEmail(admin, {
      captureSessionId,
      partnerOrganizationId: partner.id,
    });
  }

  return redirectTo("/strategaize-anfrage/bestaetigung", request);
}
