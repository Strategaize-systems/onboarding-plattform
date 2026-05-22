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
import type { TemplateBlock } from "@/workers/condensation/light-pipeline";

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

  // 6. Bericht-Daten laden
  const [templateRes, kusRes, mandantTenantRes] = await Promise.all([
    admin
      .from("template")
      .select("name, blocks, metadata")
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
  ]);

  const template = templateRes.data as
    | {
        name: string;
        blocks: TemplateBlock[];
        metadata: { required_closing_statement?: string } & Record<string, unknown>;
      }
    | null;
  if (!template) {
    return { ok: false, error: "template_not_found" };
  }

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

  // 7. PDF-Render
  let pdfBuffer: Buffer;
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

  // 8. Email-Render
  const overrides = await loadEmailOverridesMap("de");
  const emailContent = await buildDiagnoseReportEmail(overrides, {
    partnerDisplayName: partnerDisplayNameForEmail,
    customMessage,
  });

  // 9. sendMail
  const from = `StrategAIze <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
  const filenameDate = new Date().toISOString().slice(0, 10);
  const attachmentFilename = `diagnose-bericht-${filenameDate}.pdf`;

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

  // 10. Audit-Log
  captureInfo(
    `Diagnose-Bericht versendet (capture ${input.captureSessionId}, ${recipientsCount} Empfaenger)`,
    {
      source: SOURCE,
      userId: user.id,
      metadata: {
        category: "diagnose_report_emailed",
        capture_session_id: input.captureSessionId,
        recipients_count: recipientsCount,
        recipient_to_self: input.recipientToSelf,
        recipient_to_partner: input.recipientToPartner,
        recipient_additional: Boolean(additional),
        attachment_filename: attachmentFilename,
      },
    },
  );

  return { ok: true, recipientsCount };
}
