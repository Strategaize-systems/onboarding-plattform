// V8.1 SLC-163 MT-5 — Dual-Email-Orchestrator fuer Strategaize-Freigabe-CTA.
//
// Orchestriert BD-Lead-Email (an STRATEGAIZE_BD_EMAIL) + StB-Partner-
// Notification (an partner.contact_email). Parallel via Promise.allSettled
// — Fail in einem Send blockiert nicht den anderen.
//
// Silent-Skip-Pfad (DEC-169): wenn partner.contact_email leer/null/whitespace
// ist, wird die StB-Notification gar nicht gebaut/gesendet und stattdessen
// stb_skip_reason='no_email' zurueckgegeben. Audit-Log via
// recordStbNotificationSkippedNoEmail im Caller (MT-6/MT-7-Endpoint).

import { sendMail } from "@/lib/email";

import { buildBdLeadEmail, type BdLeadEmailInput } from "./bd-lead";
import {
  buildStbNotificationEmail,
  type StbNotificationInput,
} from "./stb-notification";

export interface SendStrategaizeAnfrageEmailsInput {
  captureSession: BdLeadEmailInput["captureSession"];
  partner: {
    id: string;
    name: string;
    contact_email: string | null;
  };
}

export type StbSkipReason = "no_email" | "smtp_fail";

export interface SendStrategaizeAnfrageEmailsResult {
  bd_sent: boolean;
  stb_sent: boolean;
  stb_skip_reason?: StbSkipReason;
  bd_error?: string;
  stb_error?: string;
}

function isBlankEmail(email: string | null | undefined): boolean {
  return !email || email.trim().length === 0;
}

function readFromAddress(): string {
  return process.env.SMTP_FROM ?? "noreply@strategaize.de";
}

function readBdAddress(): string {
  return process.env.STRATEGAIZE_BD_EMAIL ?? "bd@strategaizetransition.de";
}

export async function sendStrategaizeAnfrageEmails(
  input: SendStrategaizeAnfrageEmailsInput,
): Promise<SendStrategaizeAnfrageEmailsResult> {
  const fromAddress = readFromAddress();

  const bd = buildBdLeadEmail({
    captureSession: input.captureSession,
    partner: { id: input.partner.id, name: input.partner.name },
  });

  const stbInput: StbNotificationInput | null = isBlankEmail(
    input.partner.contact_email,
  )
    ? null
    : {
        captureSession: {
          mandant_name: input.captureSession.mandant_name,
          mandant_firma: input.captureSession.mandant_firma,
        },
        partner: {
          name: input.partner.name,
          contact_email: input.partner.contact_email as string,
        },
      };

  const sendBd = sendMail({
    from: fromAddress,
    to: readBdAddress(),
    subject: bd.subject,
    html: bd.htmlBody,
    text: bd.textBody,
  });

  const sendStb = stbInput
    ? (() => {
        const stb = buildStbNotificationEmail(stbInput);
        return sendMail({
          from: fromAddress,
          to: stbInput.partner.contact_email,
          subject: stb.subject,
          html: stb.htmlBody,
          text: stb.textBody,
        });
      })()
    : Promise.resolve("skip" as const);

  const [bdResult, stbResult] = await Promise.allSettled([sendBd, sendStb]);

  const result: SendStrategaizeAnfrageEmailsResult = {
    bd_sent: bdResult.status === "fulfilled",
    stb_sent: false,
  };

  if (bdResult.status === "rejected") {
    result.bd_error = bdResult.reason instanceof Error
      ? bdResult.reason.message
      : String(bdResult.reason);
  }

  if (!stbInput) {
    result.stb_skip_reason = "no_email";
  } else if (stbResult.status === "fulfilled") {
    result.stb_sent = true;
  } else {
    result.stb_skip_reason = "smtp_fail";
    result.stb_error = stbResult.reason instanceof Error
      ? stbResult.reason.message
      : String(stbResult.reason);
  }

  return result;
}
