"use server";

// V7.2 SLC-141 MT-4 (FEAT-060) — Server-Action `sendDiagnoseReportByEmail`.
//
// Flow:
//   1. Input-Validation (UUID, mind. 1 Empfaenger, additionalEmail-Format,
//      customMessage <= 500 chars).
//   2. Auth + Profile-Lookup.
//   3. capture_session-Lookup + RLS-Check (own-tenant; finalized).
//   4. Rate-Limit (5/h pro capture_session_id, diagnoseReportEmailLimiter).
//   5. Empfaenger-Resolution (self via auth.users.email, partner via
//      tenant.parent_partner_tenant_id -> partner_organization.contact_email,
//      additionalEmail aus Input).
//   6. Bericht-Daten laden (template + KUs + branding + mandant-name).
//   7. PDF-Render via renderDiagnoseReportPdf (MT-2).
//   8. Email-Render via buildDiagnoseReportEmail (MT-3).
//   9. sendMail mit attachments (V7.2-Erweiterung).
//   10. Audit-Log via captureInfo `event=diagnose_report_emailed`.
//
// Audit-Log via existing error_log-Pattern (siehe lead-push-actions.ts);
// kein neues Storage. Ziel: Live-Smoke kann recipients_count nachvollziehen.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException, captureInfo } from "@/lib/logger";
import { diagnoseReportEmailLimiter } from "@/lib/rate-limit";
import { sendMail, loadEmailOverridesMap } from "@/lib/email";
import { resolveBrandingForTenant, STRATEGAIZE_DEFAULT_BRANDING } from "@/lib/branding/resolve";
import {
  renderDiagnoseReportPdf,
  type DiagnoseReportPdfData,
} from "@/lib/pdf/diagnose-report";
import { buildDiagnoseReportEmail } from "@/lib/email/templates/diagnose-report";
import { buildMandantenReportV8Email } from "@/lib/email/templates/mandanten-report-v8";
import { renderMandantenReportV2Pdf } from "@/lib/pdf/mandanten-report-v2";
import type { RendererInput as V8RendererInput } from "@/lib/pdf/mandanten-report-v2";
import type { ModulKey, V8ReportSnapshot, V8Template } from "@/lib/diagnose/types";
import {
  trackV8EmailSent,
  trackV8PdfRenderFailed,
} from "@/lib/diagnose/telemetry-v8";
import type { TemplateBlock } from "@/workers/condensation/light-pipeline";
import { sendStrategaizeAnfrageEmails } from "@/lib/email/v8-1/send-strategaize-anfrage-emails";
import {
  recordCtaTrigger,
  recordCtaIdempotentSkip,
  recordStbNotificationSkippedNoEmail,
} from "@/lib/cta/audit";
import { redirect } from "next/navigation";

const UUID_REGEX = /^[0-9a-f-]{36}$/i;
// Pragmatischer Email-Regex (RFC-822 ist zu komplex fuer Userland-Validation).
// Matched die ueberwaeltigende Mehrheit echter Adressen. Echte Validation
// passiert beim SMTP-MX-Lookup; das hier ist nur Schutz vor Tippfehlern und
// offensichtlichem Garbage-Input.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CUSTOM_MESSAGE_MAX_LEN = 500;
const SOURCE = "diagnose/bericht/sendDiagnoseReportByEmail";

export interface SendDiagnoseReportByEmailInput {
  captureSessionId: string;
  recipientToSelf: boolean;
  recipientToPartner: boolean;
  additionalEmail?: string;
  customMessage?: string;
}

export type SendDiagnoseReportByEmailResult =
  | { ok: true; recipientsCount: number }
  | { ok: false; error: string; retryAfterSeconds?: number };

export async function sendDiagnoseReportByEmail(
  input: SendDiagnoseReportByEmailInput,
): Promise<SendDiagnoseReportByEmailResult> {
  // 1. Input-Validation
  if (!input.captureSessionId || !UUID_REGEX.test(input.captureSessionId)) {
    return { ok: false, error: "invalid_capture_session_id" };
  }
  if (!input.recipientToSelf && !input.recipientToPartner && !input.additionalEmail) {
    return { ok: false, error: "no_recipients" };
  }
  const additional = input.additionalEmail?.trim();
  if (additional && !EMAIL_REGEX.test(additional)) {
    return { ok: false, error: "invalid_additional_email" };
  }
  const customMessage = input.customMessage?.trim();
  if (customMessage && customMessage.length > CUSTOM_MESSAGE_MAX_LEN) {
    return { ok: false, error: "custom_message_too_long" };
  }

  // 2. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const admin = createAdminClient();

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, tenant_id, email, role")
    .eq("id", user.id)
    .single();
  if (profileErr || !profile?.tenant_id) {
    return { ok: false, error: "profile_not_found" };
  }

  // 3. capture_session + RLS (own-tenant only; partner-/admin-Versand kommt
  //    spaeter — V7.2 MT-4 ist Mandant-driven, deshalb strict own-tenant).
  const { data: session, error: sessionErr } = await admin
    .from("capture_session")
    .select("id, tenant_id, template_id, status, updated_at")
    .eq("id", input.captureSessionId)
    .maybeSingle();
  if (sessionErr) {
    captureException(new Error(sessionErr.message), {
      source: `${SOURCE}/capture_session_lookup`,
      userId: user.id,
      metadata: { capture_session_id: input.captureSessionId },
    });
    return { ok: false, error: "capture_session_lookup_failed" };
  }
  if (!session) return { ok: false, error: "capture_session_not_found" };
  if (session.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "forbidden" };
  }
  if (session.status !== "finalized") {
    return { ok: false, error: "not_finalized" };
  }

  // 4. Rate-Limit (5/h pro Session, 6. Versuch wird rejected).
  const rate = diagnoseReportEmailLimiter.check(input.captureSessionId);
  if (!rate.allowed) {
    return {
      ok: false,
      error: "rate_limit_exceeded",
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }

  // 5. Empfaenger-Resolution
  const toRecipients: string[] = [];
  const ccRecipients: string[] = [];

  if (input.recipientToSelf) {
    const selfEmail = profile.email ?? user.email;
    if (!selfEmail) {
      return { ok: false, error: "self_email_missing" };
    }
    toRecipients.push(selfEmail);
  }

  // Partner-Lookup einmalig: display_name brauchen wir IMMER fuer den Email-
  // Subject ("Ihr StrategAIze Diagnose-Bericht — {partner}"), contact_email
  // nur wenn recipientToPartner=true.
  let partnerDisplayNameForEmail = "Ihr StrategAIze-Partner";
  const { data: tenantRow } = await admin
    .from("tenants")
    .select("parent_partner_tenant_id, tenant_kind")
    .eq("id", profile.tenant_id)
    .single();
  if (tenantRow?.parent_partner_tenant_id) {
    const { data: partnerOrg } = await admin
      .from("partner_organization")
      .select("contact_email, display_name")
      .eq("tenant_id", tenantRow.parent_partner_tenant_id)
      .maybeSingle();
    if (partnerOrg && typeof partnerOrg.display_name === "string") {
      partnerDisplayNameForEmail = partnerOrg.display_name;
    }
    if (input.recipientToPartner) {
      const partnerEmail =
        typeof partnerOrg?.contact_email === "string" ? partnerOrg.contact_email : "";
      if (partnerEmail.length === 0) {
        return { ok: false, error: "partner_email_missing" };
      }
      ccRecipients.push(partnerEmail);
    }
  } else if (input.recipientToPartner) {
    return { ok: false, error: "no_partner_assigned" };
  }

  if (additional) {
    toRecipients.push(additional);
  }

  if (toRecipients.length === 0 && ccRecipients.length === 0) {
    return { ok: false, error: "no_recipients_resolved" };
  }
  // nodemailer braucht mind. einen `to`. Wenn nur Partner per cc gewuenscht
  // ist, promote die cc-Liste zum to.
  let primaryTo: string[];
  let primaryCc: string[] | undefined;
  if (toRecipients.length > 0) {
    primaryTo = toRecipients;
    primaryCc = ccRecipients.length > 0 ? ccRecipients : undefined;
  } else {
    primaryTo = ccRecipients;
    primaryCc = undefined;
  }
  const recipientsCount = toRecipients.length + ccRecipients.length;

  // 6. Bericht-Daten laden — Template wird ZUERST geladen, weil
  //    metadata.usage_kind den Branch (V8 vs V7.2) entscheidet und V8 die
  //    knowledge_unit-Liste NICHT braucht (V8 nutzt
  //    capture_session.metadata.v8_report_snapshot).
  const [templateRes, kusRes, mandantTenantRes, sessionMetaRes] = await Promise.all([
    admin
      .from("template")
      .select("name, blocks, metadata, slug, version")
      .eq("id", session.template_id)
      .single(),
    admin
      .from("knowledge_unit")
      .select("block_key, title, body, metadata, created_at")
      .eq("capture_session_id", input.captureSessionId)
      .eq("status", "accepted")
      .order("created_at", { ascending: true }),
    admin
      .from("tenants")
      .select("name")
      .eq("id", session.tenant_id)
      .single(),
    admin
      .from("capture_session")
      .select("metadata")
      .eq("id", input.captureSessionId)
      .single(),
  ]);

  const template = templateRes.data as
    | {
        name: string;
        slug: string;
        version: number;
        blocks: TemplateBlock[];
        metadata: {
          required_closing_statement?: string;
          usage_kind?: string;
        } & Record<string, unknown>;
      }
    | null;
  if (!template) {
    return { ok: false, error: "template_not_found" };
  }

  // V8-Branch-Detection per Template-Metadata. usage_kind aus Migration 102.
  const isV8Mandanten =
    template.metadata.usage_kind === "mandanten_report_teaser_v1";

  const kus = (kusRes.data ?? []) as Array<{
    block_key: string;
    title: string;
    body: string;
    metadata: Record<string, unknown>;
  }>;
  const kuByBlock = new Map<string, { score: number; comment: string }>();
  for (const ku of kus) {
    const m = ku.metadata as { score?: number; comment?: string };
    if (typeof m.score === "number" && typeof m.comment === "string") {
      kuByBlock.set(ku.block_key, { score: m.score, comment: m.comment });
    }
  }

  // Branding (display_name aus partner_organization) — bevorzugt fuer den
  // PDF-Header. Bei Direct-Client fallback auf StrategAIze-Default.
  const branding = await resolveBrandingForTenant(supabase, session.tenant_id);
  const partnerDisplayNameForPdf =
    branding.displayName &&
    branding.displayName !== STRATEGAIZE_DEFAULT_BRANDING.displayName
      ? branding.displayName
      : null;

  // 7. PDF-Render + 8. Email-Render — branched on isV8Mandanten.
  //    V8-Branch (SLC-152 MT-1): renderMandantenReportV2Pdf +
  //    buildMandantenReportV8Email. Snapshot kommt aus
  //    capture_session.metadata.v8_report_snapshot (SLC-148 MT-6 DEC-163).
  //    V7.2-Branch: bestehender renderDiagnoseReportPdf-Pfad UNVERAENDERT
  //    (Co-Existenz-Pflicht per AC-SLC-152-4).
  let pdfBuffer: Buffer;
  let emailContent: { subject: string; htmlBody: string; textBody: string };
  let attachmentFilename: string;
  let auditCategory: string;
  const overrides = await loadEmailOverridesMap("de");
  const filenameDate = new Date().toISOString().slice(0, 10);

  if (isV8Mandanten) {
    // V8-Branch — Snapshot-Reader + V8-Renderer + V8-Email-Template.
    const sessionMeta = (sessionMetaRes.data?.metadata ?? {}) as Record<string, unknown>;
    const v8Snapshot = sessionMeta.v8_report_snapshot as V8ReportSnapshot | undefined;
    if (!v8Snapshot) {
      return { ok: false, error: "v8_snapshot_missing" };
    }

    // moduleNames aus template.blocks (modul_id "M1".."M9" → lowercase key)
    const moduleNames: Partial<Record<ModulKey, string>> = {};
    for (const block of template.blocks as unknown as Array<{
      modul_id?: string;
      name?: string;
    }>) {
      if (typeof block.modul_id === "string" && typeof block.name === "string") {
        const key = block.modul_id.toLowerCase() as ModulKey;
        moduleNames[key] = block.name;
      }
    }

    const v8Input: V8RendererInput = {
      snapshot: v8Snapshot,
      mandant: {
        name: (mandantTenantRes.data?.name as string) ?? "Ihr Unternehmen",
        datum:
          (session.updated_at as string)?.slice(0, 10) ??
          new Date().toISOString().slice(0, 10),
      },
      moduleNames: moduleNames as Record<ModulKey, string>,
      template: template as unknown as V8Template,
    };

    try {
      pdfBuffer = await renderMandantenReportV2Pdf(v8Input);
    } catch (e) {
      trackV8PdfRenderFailed(
        admin,
        input.captureSessionId,
        profile.tenant_id,
        e,
      );
      captureException(e, {
        source: `${SOURCE}/render_pdf_v8`,
        userId: user.id,
        metadata: { capture_session_id: input.captureSessionId },
      });
      return { ok: false, error: "pdf_render_failed" };
    }

    emailContent = await buildMandantenReportV8Email(overrides, {
      customMessage,
    });
    attachmentFilename = `Strategaize-Diagnose-${filenameDate}.pdf`;
    auditCategory = "v8_mandanten_report_emailed";
  } else {
    // V7.2-Branch — bestehender Pfad UNVERAENDERT.
    const pdfData: DiagnoseReportPdfData = {
      mandantName: (mandantTenantRes.data?.name as string) ?? "Ihr Unternehmen",
      partnerDisplayName: partnerDisplayNameForPdf,
      finalizedAt: (session.updated_at as string) ?? new Date().toISOString(),
      blocks: template.blocks
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((block) => {
          const ku = kuByBlock.get(block.key);
          return {
            key: block.key,
            title: block.title,
            intro: block.intro,
            score: ku?.score ?? 0,
            comment: ku?.comment ?? "Keine Verdichtung verfuegbar.",
          };
        }),
      closingStatement: template.metadata.required_closing_statement ?? "",
    };

    try {
      pdfBuffer = await renderDiagnoseReportPdf(pdfData);
    } catch (e) {
      captureException(e, {
        source: `${SOURCE}/render_pdf`,
        userId: user.id,
        metadata: { capture_session_id: input.captureSessionId },
      });
      return { ok: false, error: "pdf_render_failed" };
    }

    emailContent = await buildDiagnoseReportEmail(overrides, {
      partnerDisplayName: partnerDisplayNameForEmail,
      customMessage,
    });
    attachmentFilename = `diagnose-bericht-${filenameDate}.pdf`;
    auditCategory = "diagnose_report_emailed";
  }

  // 9. sendMail
  const from = `StrategAIze <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;

  try {
    await sendMail({
      from,
      to: primaryTo,
      cc: primaryCc,
      subject: emailContent.subject,
      html: emailContent.htmlBody,
      text: emailContent.textBody,
      attachments: [
        {
          filename: attachmentFilename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (e) {
    captureException(e, {
      source: `${SOURCE}/send_mail`,
      userId: user.id,
      metadata: {
        capture_session_id: input.captureSessionId,
        recipients_count: recipientsCount,
      },
    });
    return { ok: false, error: "smtp_send_failed" };
  }

  // 10. Audit-Log + V8-Telemetry-Event (nur im V8-Branch).
  if (isV8Mandanten) {
    trackV8EmailSent(
      admin,
      input.captureSessionId,
      profile.tenant_id,
      pdfBuffer.length,
    );
  }

  captureInfo(
    `Diagnose-Bericht versendet (capture ${input.captureSessionId}, ${recipientsCount} Empfaenger)`,
    {
      source: SOURCE,
      userId: user.id,
      metadata: {
        category: auditCategory,
        capture_session_id: input.captureSessionId,
        recipients_count: recipientsCount,
        recipient_to_self: input.recipientToSelf,
        recipient_to_partner: input.recipientToPartner,
        recipient_additional: Boolean(additional),
        attachment_filename: attachmentFilename,
        pdf_size_bytes: pdfBuffer.length,
        template_variant: isV8Mandanten ? "v8" : "v7_2",
      },
    },
  );

  return { ok: true, recipientsCount };
}

// ============================================================================
// V8 SLC-152 MT-3 — downloadMandantenReportV2Pdf Server-Action
// ============================================================================
//
// Browser-Download-Trigger fuer V8-Bericht-Page (V8BerichtActions Client-
// Component). Rendert V8-PDF on-demand und returnt Base64-Encoded-Buffer
// (statt direkt Buffer, weil Next.js Server-Action-Serialization keine
// Buffer/Uint8Array-Roundtrips ueber die Wire unterstuetzt).
//
// Auth-Gates identisch zu sendDiagnoseReportByEmail: Mandant own-tenant ODER
// Partner-Admin von Parent-Partner ODER strategaize_admin (cross-tenant).

export type DownloadMandantenReportV2PdfResult =
  | { ok: true; pdfBase64: string; filename: string }
  | { ok: false; error: string };

export async function downloadMandantenReportV2Pdf(
  captureSessionId: string,
): Promise<DownloadMandantenReportV2PdfResult> {
  if (!captureSessionId || !UUID_REGEX.test(captureSessionId)) {
    return { ok: false, error: "invalid_capture_session_id" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();
  if (!profile?.tenant_id) return { ok: false, error: "profile_not_found" };

  const { data: session } = await admin
    .from("capture_session")
    .select("id, tenant_id, template_id, status, updated_at, metadata")
    .eq("id", captureSessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: "capture_session_not_found" };

  // Auth-Matrix: Mandant + Partner-Admin + Strategaize-Admin (analog page.tsx).
  let authorized = false;
  if (profile.role === "strategaize_admin") {
    authorized = true;
  } else if (session.tenant_id === profile.tenant_id) {
    authorized = true;
  } else if (profile.role === "tenant_admin") {
    const { data: ownerTenant } = await admin
      .from("tenants")
      .select("parent_partner_tenant_id")
      .eq("id", session.tenant_id)
      .single();
    if (ownerTenant?.parent_partner_tenant_id === profile.tenant_id) {
      authorized = true;
    }
  }
  if (!authorized) return { ok: false, error: "forbidden" };

  if (session.status !== "finalized") {
    return { ok: false, error: "not_finalized" };
  }

  const [templateRes, mandantTenantRes] = await Promise.all([
    admin
      .from("template")
      .select("name, slug, version, blocks, metadata")
      .eq("id", session.template_id)
      .single(),
    admin
      .from("tenants")
      .select("name")
      .eq("id", session.tenant_id)
      .single(),
  ]);

  const template = templateRes.data as
    | {
        name: string;
        slug: string;
        version: number;
        blocks: TemplateBlock[];
        metadata: { usage_kind?: string } & Record<string, unknown>;
      }
    | null;
  if (!template) return { ok: false, error: "template_not_found" };
  if (template.metadata.usage_kind !== "mandanten_report_teaser_v1") {
    return { ok: false, error: "not_v8_template" };
  }

  const sessionMeta = (session.metadata ?? {}) as Record<string, unknown>;
  const v8Snapshot = sessionMeta.v8_report_snapshot as V8ReportSnapshot | undefined;
  if (!v8Snapshot) {
    return { ok: false, error: "v8_snapshot_missing" };
  }

  const moduleNames: Partial<Record<ModulKey, string>> = {};
  for (const block of template.blocks as unknown as Array<{
    modul_id?: string;
    name?: string;
  }>) {
    if (typeof block.modul_id === "string" && typeof block.name === "string") {
      const key = block.modul_id.toLowerCase() as ModulKey;
      moduleNames[key] = block.name;
    }
  }

  const v8Input: V8RendererInput = {
    snapshot: v8Snapshot,
    mandant: {
      name: (mandantTenantRes.data?.name as string) ?? "Ihr Unternehmen",
      datum:
        (session.updated_at as string)?.slice(0, 10) ??
        new Date().toISOString().slice(0, 10),
    },
    moduleNames: moduleNames as Record<ModulKey, string>,
    template: template as unknown as V8Template,
  };

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderMandantenReportV2Pdf(v8Input);
  } catch (e) {
    trackV8PdfRenderFailed(admin, captureSessionId, profile.tenant_id, e);
    captureException(e, {
      source: `${SOURCE}/download_pdf_v8`,
      userId: user.id,
      metadata: { capture_session_id: captureSessionId },
    });
    return { ok: false, error: "pdf_render_failed" };
  }

  const filename = `Strategaize-Diagnose-${new Date().toISOString().slice(0, 10)}.pdf`;

  return {
    ok: true,
    pdfBase64: pdfBuffer.toString("base64"),
    filename,
  };
}

// ============================================================================
// V8.1 SLC-163 MT-9 — triggerStrategaizeFreigabe Server-Action
// ============================================================================
//
// Web-Bericht-CTA-Pfad (Session-basiert, kein Magic-Link-Token noetig).
// Auth via Supabase-Session: User muss Mandant der capture_session ODER
// strategaize_admin sein.
//
// Flow analog GET /strategaize-anfrage-Endpoint (SLC-163 MT-7):
//   1. Auth-Check
//   2. Atomic-UPDATE flag (race-safe)
//   3. Idempotent-Skip ODER Dual-Email senden
//   4. Audit-Log
//   5. redirect zu /strategaize-anfrage/bestaetigung

const TRIGGER_SOURCE = "diagnose/bericht/triggerStrategaizeFreigabe";

export async function triggerStrategaizeFreigabe(
  captureSessionId: string,
): Promise<never> {
  if (!captureSessionId || !UUID_REGEX.test(captureSessionId)) {
    throw new Error("invalid_capture_session_id");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("unauthenticated");
  }

  const admin = createAdminClient();

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, tenant_id, role, email")
    .eq("id", user.id)
    .single();
  if (profileErr || !profile) {
    throw new Error("profile_not_found");
  }

  const { data: session, error: sessionErr } = await admin
    .from("capture_session")
    .select(
      "id, tenant_id, owner_user_id, partner_organization_id, metadata, released_for_strategaize_review",
    )
    .eq("id", captureSessionId)
    .maybeSingle();
  if (sessionErr || !session) {
    throw new Error("capture_session_not_found");
  }

  const isStrategaizeAdmin = profile.role === "strategaize_admin";
  const isOwnMandant =
    session.tenant_id === profile.tenant_id &&
    session.owner_user_id === user.id;
  if (!isStrategaizeAdmin && !isOwnMandant) {
    throw new Error("forbidden");
  }

  // Race-safe Idempotency per SQL-Level (R5 SLC-163 spec).
  const { data: updateData, error: updateError } = await admin
    .from("capture_session")
    .update({ released_for_strategaize_review: true })
    .eq("id", captureSessionId)
    .eq("released_for_strategaize_review", false)
    .select("id")
    .maybeSingle();

  if (updateError) {
    captureException(new Error(updateError.message), {
      source: `${TRIGGER_SOURCE}/update_flag`,
      userId: user.id,
      metadata: { capture_session_id: captureSessionId },
    });
    throw new Error("internal");
  }

  if (!updateData) {
    // Flag bereits true (idempotent skip).
    await recordCtaIdempotentSkip(admin, {
      captureSessionId,
      source: "web_action",
    });
    redirect("/strategaize-anfrage/bestaetigung");
  }

  // Erste Triggerung — Partner laden + Dual-Email senden.
  const { data: partner } = session.partner_organization_id
    ? await admin
        .from("partner_organization")
        .select("id, name, contact_email")
        .eq("id", session.partner_organization_id)
        .maybeSingle()
    : { data: null };

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

  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://onboarding.strategaizetransition.com";

  const sendResult = await sendStrategaizeAnfrageEmails({
    captureSession: {
      id: captureSessionId,
      mandant_email: mandantInfo.email ?? profile.email,
      mandant_name: mandantInfo.name ?? "",
      mandant_firma: mandantInfo.firma ?? "",
      sui_score: sui.gesamt_score ?? 0,
      drei_hebel_modul_namen: dreiHebelNamen,
      diagnose_link_admin: `${appBaseUrl}/admin/diagnose/${captureSessionId}`,
    },
    partner: {
      id: partner?.id ?? session.partner_organization_id ?? "",
      name: partner?.name ?? "Unbekannter Partner",
      contact_email: partner?.contact_email ?? null,
    },
  });

  await recordCtaTrigger(admin, {
    captureSessionId,
    source: "web_action",
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

  captureInfo(
    `V8.1 web-action CTA triggered (bd=${sendResult.bd_sent}, stb=${sendResult.stb_sent})`,
    {
      source: TRIGGER_SOURCE,
      userId: user.id,
      metadata: {
        capture_session_id: captureSessionId,
        bd_sent: sendResult.bd_sent,
        stb_sent: sendResult.stb_sent,
        stb_skip_reason: sendResult.stb_skip_reason ?? null,
      },
    },
  );

  redirect("/strategaize-anfrage/bestaetigung");
}
