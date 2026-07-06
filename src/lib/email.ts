import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadOverridesWithCache, resolveText } from "@/lib/text-override/resolver";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// V7.1 SLC-137 MT-6 — Email-Templates loaden Text-Overrides server-side ueber
// SLC-136-Resolver. globalScope only (Email-Versand kennt keinen Partner-
// Kontext im Send-Path), 60s Cache pro Process.
//
// Returns leere Map bei Error (z.B. SMTP-Job ohne DB-Zugriff) — Templates
// fallen dann auf defaultText zurueck.
export async function loadEmailOverridesMap(
  locale: string = "de",
): Promise<ReadonlyMap<string, string>> {
  try {
    const admin = createAdminClient();
    return await loadOverridesWithCache(admin, null, locale);
  } catch {
    return new Map();
  }
}

interface SendInviteEmailParams {
  to: string;
  tenantName: string;
  verifyUrl: string;
  locale?: string;
}

const INVITE_TEMPLATES = {
  de: {
    subject: "Ihre Einladung zur StrategAIze Plattform",
    heading: "Ihre Einladung zur StrategAIze Plattform",
    intro: (tenantName: string) =>
      `Sie wurden eingeladen, ein Konto für <strong>${tenantName}</strong> auf der StrategAIze Plattform zu erstellen.`,
    cta: "Klicken Sie auf den folgenden Link, um die Einladung anzunehmen und Ihr Passwort festzulegen:",
    button: "Einladung annehmen",
    fallback: "Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
    closing: "Mit freundlichen Grüßen,<br>Ihr StrategAIze Team",
  },
  en: {
    subject: "Your invitation to the StrategAIze Platform",
    heading: "Your invitation to the StrategAIze Platform",
    intro: (tenantName: string) =>
      `You have been invited to create an account for <strong>${tenantName}</strong> on the StrategAIze Platform.`,
    cta: "Click the following link to accept the invitation and set your password:",
    button: "Accept invitation",
    fallback: "If the button doesn't work, copy this link into your browser:",
    closing: "Kind regards,<br>Your StrategAIze Team",
  },
  nl: {
    subject: "Uw uitnodiging voor het StrategAIze Platform",
    heading: "Uw uitnodiging voor het StrategAIze Platform",
    intro: (tenantName: string) =>
      `U bent uitgenodigd om een account aan te maken voor <strong>${tenantName}</strong> op het StrategAIze Platform.`,
    cta: "Klik op de volgende link om de uitnodiging te accepteren en uw wachtwoord in te stellen:",
    button: "Uitnodiging accepteren",
    fallback: "Als de knop niet werkt, kopieer dan deze link in uw browser:",
    closing: "Met vriendelijke groet,<br>Uw StrategAIze Team",
  },
} as const;

export async function sendErrorNotification({
  level,
  source,
  message,
  stack,
}: {
  level: string;
  source: string;
  message: string;
  stack?: string;
}): Promise<void> {
  const alertEmail = process.env.ERROR_ALERT_EMAIL || process.env.SMTP_USER;
  if (!alertEmail) return;

  const from = `StrategAIze Alerts <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;

  await transporter.sendMail({
    from,
    to: alertEmail,
    subject: `[${level.toUpperCase()}] Blueprint: ${source} — ${message.slice(0, 80)}`,
    html: `
      <h3 style="color:#dc2626;">StrategAIze Blueprint — Error Alert</h3>
      <table style="font-size:14px;border-collapse:collapse;">
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;color:#64748b;">Level:</td><td>${level}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;color:#64748b;">Source:</td><td>${source}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;color:#64748b;">Message:</td><td>${message}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;color:#64748b;">Time:</td><td>${new Date().toLocaleString("de-DE")}</td></tr>
      </table>
      ${stack ? `<pre style="margin-top:16px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;overflow-x:auto;">${stack}</pre>` : ""}
    `,
  });
}

export async function sendInviteEmail({
  to,
  tenantName,
  verifyUrl,
  locale,
}: SendInviteEmailParams): Promise<void> {
  const from = `StrategAIze <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
  const lang = (locale && locale in INVITE_TEMPLATES ? locale : "de") as keyof typeof INVITE_TEMPLATES;
  const t = INVITE_TEMPLATES[lang];

  // V7.1 SLC-137 MT-6 — Override-Layer fuer subject + cta + button (de-Locale).
  const overrides = await loadEmailOverridesMap(lang);
  const subject = resolveText(overrides, "email.tenant_invite.subject", t.subject);
  const cta = resolveText(overrides, "email.tenant_invite.cta", t.cta);
  const button = resolveText(overrides, "email.tenant_invite.button", t.button);

  await transporter.sendMail({
    from,
    to,
    subject,
    html: `
      <h2>${t.heading}</h2>
      <p>${t.intro(tenantName)}</p>
      <p>${cta}</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#120774;color:#ffffff;text-decoration:none;border-radius:6px;">${button}</a></p>
      <p style="margin-top:16px;font-size:13px;color:#666;">${t.fallback}</p>
      <p style="font-size:13px;word-break:break-all;">${verifyUrl}</p>
      <br>
      <p>${t.closing}</p>
    `,
  });
}

// ─── Employee invitation templates (SLC-034, DEC-035) ────────────────────────

const EMPLOYEE_INVITE_TEMPLATES = {
  de: {
    subject: (tenantName: string) => `Einladung als Mitarbeiter bei ${tenantName}`,
    heading: (tenantName: string) => `Einladung als Mitarbeiter bei ${tenantName}`,
    intro: (tenantName: string, displayName: string | null) =>
      displayName
        ? `Hallo ${displayName}, du wurdest eingeladen, als Mitarbeiter bei <strong>${tenantName}</strong> auf der StrategAIze-Plattform teilzunehmen.`
        : `Du wurdest eingeladen, als Mitarbeiter bei <strong>${tenantName}</strong> auf der StrategAIze-Plattform teilzunehmen.`,
    role: (roleHint: string) => `Vorgesehene Rolle: <strong>${roleHint}</strong>.`,
    cta: "Klicke auf den folgenden Link, um deine Einladung anzunehmen und dein Passwort zu setzen:",
    button: "Einladung annehmen",
    expiry: (date: string) => `Dieser Link ist bis zum <strong>${date}</strong> gültig.`,
    fallback: "Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:",
    closing: "Mit freundlichen Grüßen,<br>Dein StrategAIze-Team",
  },
  en: {
    subject: (tenantName: string) => `Employee invitation to ${tenantName}`,
    heading: (tenantName: string) => `Employee invitation to ${tenantName}`,
    intro: (tenantName: string, displayName: string | null) =>
      displayName
        ? `Hello ${displayName}, you have been invited to join <strong>${tenantName}</strong> as an employee on the StrategAIze platform.`
        : `You have been invited to join <strong>${tenantName}</strong> as an employee on the StrategAIze platform.`,
    role: (roleHint: string) => `Intended role: <strong>${roleHint}</strong>.`,
    cta: "Click the following link to accept your invitation and set your password:",
    button: "Accept invitation",
    expiry: (date: string) => `This link is valid until <strong>${date}</strong>.`,
    fallback: "If the button doesn't work, copy this link into your browser:",
    closing: "Kind regards,<br>Your StrategAIze team",
  },
  nl: {
    subject: (tenantName: string) => `Uitnodiging als medewerker bij ${tenantName}`,
    heading: (tenantName: string) => `Uitnodiging als medewerker bij ${tenantName}`,
    intro: (tenantName: string, displayName: string | null) =>
      displayName
        ? `Hallo ${displayName}, je bent uitgenodigd om als medewerker deel te nemen aan <strong>${tenantName}</strong> op het StrategAIze-platform.`
        : `Je bent uitgenodigd om als medewerker deel te nemen aan <strong>${tenantName}</strong> op het StrategAIze-platform.`,
    role: (roleHint: string) => `Beoogde rol: <strong>${roleHint}</strong>.`,
    cta: "Klik op de volgende link om je uitnodiging te accepteren en je wachtwoord in te stellen:",
    button: "Uitnodiging accepteren",
    expiry: (date: string) => `Deze link is geldig tot <strong>${date}</strong>.`,
    fallback: "Als de knop niet werkt, kopieer dan deze link in je browser:",
    closing: "Met vriendelijke groet,<br>Je StrategAIze-team",
  },
} as const;

interface SendEmployeeInvitationEmailParams {
  to: string;
  tenantName: string;
  inviteUrl: string;
  expiresAt: Date;
  displayName?: string | null;
  roleHint?: string | null;
  locale?: string;
}

export async function sendEmployeeInvitationEmail({
  to,
  tenantName,
  inviteUrl,
  expiresAt,
  displayName,
  roleHint,
  locale,
}: SendEmployeeInvitationEmailParams): Promise<void> {
  const from = `StrategAIze <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
  const lang = (locale && locale in EMPLOYEE_INVITE_TEMPLATES
    ? locale
    : "de") as keyof typeof EMPLOYEE_INVITE_TEMPLATES;
  const t = EMPLOYEE_INVITE_TEMPLATES[lang];

  const expiryStr = expiresAt.toLocaleDateString(
    lang === "de" ? "de-DE" : lang === "nl" ? "nl-NL" : "en-GB",
    { year: "numeric", month: "long", day: "numeric" }
  );

  const roleHtml = roleHint ? `<p>${t.role(roleHint)}</p>` : "";

  // V7.1 SLC-137 MT-6 — Override-Layer fuer subject + cta + button (de-Locale).
  const overrides = await loadEmailOverridesMap(lang);
  const subject = resolveText(
    overrides,
    "email.employee_invitation.subject",
    t.subject(tenantName),
  );
  const cta = resolveText(overrides, "email.employee_invitation.cta", t.cta);
  const button = resolveText(overrides, "email.employee_invitation.button", t.button);

  await transporter.sendMail({
    from,
    to,
    subject,
    html: `
      <h2>${t.heading(tenantName)}</h2>
      <p>${t.intro(tenantName, displayName ?? null)}</p>
      ${roleHtml}
      <p>${cta}</p>
      <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#120774;color:#ffffff;text-decoration:none;border-radius:6px;">${button}</a></p>
      <p style="margin-top:16px;font-size:13px;color:#666;">${t.expiry(expiryStr)}</p>
      <p style="margin-top:16px;font-size:13px;color:#666;">${t.fallback}</p>
      <p style="font-size:13px;word-break:break-all;">${inviteUrl}</p>
      <br>
      <p>${t.closing}</p>
    `,
  });
}

// ─── Generic sendMail adapter (V7 SLC-132 MT-6 — testable email-send path) ──

/**
 * V7.2 SLC-141 MT-4: optionale Datei-Anhaenge fuer sendMail. Mirrors
 * nodemailer-Shape (filename + content). contentType ist optional, weil
 * nodemailer von filename ableitet (".pdf" -> "application/pdf").
 */
export interface SendMailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

interface SendMailParams {
  /** to-Header, Komma-separierter String oder Array (nodemailer akzeptiert beides). */
  to: string | string[];
  /** Optional cc-Header fuer Mehr-Empfaenger-Versand (V7.2 SLC-141). */
  cc?: string | string[];
  from: string;
  /** Optional reply-to header (Public-Signup uses partner_contact_email). */
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  /** Optional Anhaenge (V7.2 SLC-141 Diagnose-Bericht-PDF). */
  attachments?: SendMailAttachment[];
}

/**
 * Thin wrapper around `transporter.sendMail`. Existiert damit Route-Handler
 * (z.B. SLC-132 /api/public/signup) eine eindeutige Importgrenze haben, die
 * im Vitest per `vi.mock('@/lib/email', () => ({ sendMail: vi.fn() }))`
 * mockbar ist. Bestehende `sendInviteEmail` / `sendMandantInvitationEmail`
 * etc. bleiben unveraendert (kein Refactor in V7).
 */
export async function sendMail(params: SendMailParams): Promise<void> {
  await transporter.sendMail({
    from: params.from,
    to: params.to,
    cc: params.cc,
    replyTo: params.replyTo,
    subject: params.subject,
    html: params.html,
    text: params.text,
    attachments: params.attachments,
  });
}

// ─── Passwort-Reset-Mail (V10.3 SLC-186 MT-3) ───────────────────────────────

interface SendPasswordResetEmailParams {
  to: string;
  /** Vollstaendige Verify-URL auf /auth/callback (NEXT_PUBLIC_APP_URL-basiert,
   *  type=recovery). NIEMALS aus request.origin — Proxy-Falle P-040. */
  verifyUrl: string;
}

/**
 * Sendet die Passwort-zuruecksetzen-Mail. Wird ausschliesslich aus der
 * Enumeration-sicheren Server-Action `requestPasswordReset` aufgerufen —
 * daher schlichtes deutsches Template im Stil der bestehenden Invite-Mails.
 */
export async function sendPasswordResetEmail({
  to,
  verifyUrl,
}: SendPasswordResetEmailParams): Promise<void> {
  const from = `StrategAIze <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;

  await sendMail({
    from,
    to,
    subject: "Passwort zurücksetzen",
    html: `
      <h2>Passwort zurücksetzen</h2>
      <p>Sie haben angefordert, Ihr Passwort für Ihren StrategAIze-Zugang zurückzusetzen.</p>
      <p>Klicken Sie auf den folgenden Button, um ein neues Passwort zu setzen:</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#120774;color:#ffffff;text-decoration:none;border-radius:6px;">Passwort zurücksetzen</a></p>
      <p style="margin-top:16px;font-size:13px;color:#666;">Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:</p>
      <p style="font-size:13px;word-break:break-all;">${verifyUrl}</p>
      <br>
      <p style="font-size:13px;color:#666;">Falls Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.</p>
      <p>Mit freundlichen Grüßen,<br>Ihr StrategAIze-Team</p>
    `,
    text:
      `Passwort zurücksetzen\n\n` +
      `Sie haben angefordert, Ihr Passwort für Ihren StrategAIze-Zugang zurückzusetzen.\n\n` +
      `Öffnen Sie den folgenden Link, um ein neues Passwort zu setzen:\n${verifyUrl}\n\n` +
      `Falls Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.\n\n` +
      `Mit freundlichen Grüßen,\nIhr StrategAIze-Team`,
  });
}

// ─── Public-Signup-Verify template (V7 SLC-132, FEAT-053) ───────────────────

interface RenderSignupVerifyTemplateInput {
  /** Display-Name des Partners (z.B. "Kanzlei Mueller & Partner"). */
  partner_display_name: string;
  /** Email-Adresse der Kanzlei. Caller setzt sie als reply-to-Header
   *  vor sendMail. Hier nur fuer Footer-Hinweis im Mail-Body genutzt. */
  partner_contact_email: string | null;
  /** Vollstaendige Verify-URL incl. Klartext-Token-Parameter. */
  verify_url: string;
  /** ISO-8601-Timestamp der Token-Expiry. Wird im Body als deutsches Datum
   *  gerendert (z.B. "19. Mai 2026, 11:30 Uhr"). */
  expires_at_iso: string;
  /** Vorname des Mandanten fuer persoenliche Anrede. */
  recipient_first_name: string;
}

interface RenderSignupVerifyTemplateOutput {
  subject: string;
  html: string;
  text: string;
}

/**
 * Render-Function fuer Self-Signup-Verify-Mail (V7 SLC-132 MT-5).
 *
 * Liefert Subject + HTML + Text-Variante deutsch (DEC-134). Keine
 * Send-Logik — der Caller (`/api/public/signup` Route in MT-6) ruft
 * `transporter.sendMail({...rendered, from: 'onboarding@strategaize.de',
 * reply_to: input.partner_contact_email})` auf.
 *
 * Plain-Text-Variante existiert fuer Spam-Filter-Score (RFC 8058 / SPF/
 * DKIM-Empfaengerlandschaft bevorzugt Multipart-Mails mit text+html).
 */
export function renderSignupVerifyTemplate(
  input: RenderSignupVerifyTemplateInput,
  overrides?: ReadonlyMap<string, string>,
): RenderSignupVerifyTemplateOutput {
  const expiryDate = new Date(input.expires_at_iso);
  const expiryFormatted = expiryDate.toLocaleString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // V7.1 SLC-137 MT-6: jede Subject- + Body-Fragment via resolveText. Wenn
  // overrides nicht uebergeben werden (Tests, Hot-Paths), wird die leere Map
  // genutzt -> defaultText. Backwards-compatible.
  const map = overrides ?? new Map<string, string>();

  const subjectTemplate = resolveText(
    map,
    "email.verify_signup.subject",
    "Bestaetigung der E-Mail-Adresse fuer Ihren Strategaize-Zugang ueber {partner}",
  );
  const subject = subjectTemplate.replace("{partner}", input.partner_display_name);

  const greeting = resolveText(
    map,
    "email.verify_signup.greeting",
    "Hallo {name},",
  ).replace("{name}", input.recipient_first_name);
  const intro = resolveText(
    map,
    "email.verify_signup.intro_html",
    "Ihr Berater <strong>{partner}</strong> hat Sie eingeladen, die Strategaize-Diagnose zu nutzen. Um Ihren Zugang einzurichten, bestaetigen Sie bitte Ihre E-Mail-Adresse.",
  ).replace("{partner}", input.partner_display_name);
  const buttonLabel = resolveText(
    map,
    "email.verify_signup.button",
    "E-Mail-Adresse bestaetigen",
  );

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;">
      <div style="background:#120774;padding:24px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:20px;">Strategaize</h1>
      </div>
      <div style="padding:24px;">
        <p>${greeting}</p>
        <p>${intro}</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${input.verify_url}"
             style="display:inline-block;padding:12px 24px;background:#120774;color:#ffffff;text-decoration:none;border-radius:6px;">
            ${buttonLabel}
          </a>
        </p>
        <p style="font-size:13px;color:#6b7280;">
          Dieser Link ist bis zum <strong>${expiryFormatted}</strong> gueltig
          (24 Stunden ab Versand). Danach muessen Sie die Signup-Anfrage
          erneut stellen.
        </p>
        <p style="font-size:13px;color:#6b7280;">
          Falls der Button nicht funktioniert, kopieren Sie diesen Link in
          Ihren Browser:
        </p>
        <p style="font-size:13px;word-break:break-all;color:#374151;">
          ${input.verify_url}
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#6b7280;">
          Sie haben diese E-Mail erhalten, weil Sie sich ueber die
          Landing-Page von <strong>${input.partner_display_name}</strong>
          fuer einen Strategaize-Zugang registriert haben. Wenn Sie das
          nicht waren, ignorieren Sie diese E-Mail einfach — Ihr Zugang
          wird nicht angelegt.
        </p>
        <p style="font-size:12px;color:#6b7280;">
          Datenschutz: <a href="https://onboarding.strategaizetransition.com/datenschutz" style="color:#120774;">Datenschutzerklaerung</a>
        </p>
      </div>
    </div>
  `;

  const text = `Hallo ${input.recipient_first_name},

Ihr Berater ${input.partner_display_name} hat Sie eingeladen, die
Strategaize-Diagnose zu nutzen. Um Ihren Zugang einzurichten, bestaetigen
Sie bitte Ihre E-Mail-Adresse ueber den folgenden Link:

${input.verify_url}

Der Link ist bis zum ${expiryFormatted} gueltig (24 Stunden ab Versand).
Danach muessen Sie die Signup-Anfrage erneut stellen.

Sie haben diese E-Mail erhalten, weil Sie sich ueber die Landing-Page von
${input.partner_display_name} fuer einen Strategaize-Zugang registriert
haben. Wenn Sie das nicht waren, ignorieren Sie diese E-Mail einfach —
Ihr Zugang wird nicht angelegt.

Datenschutz: https://onboarding.strategaizetransition.com/datenschutz`;

  return { subject, html, text };
}

// ─── Mandanten invitation template (V6 SLC-103) ──────────────────────────────

const MANDANT_INVITE_TEMPLATES = {
  de: {
    subject: (partnerName: string) =>
      `Einladung zur Strategaize-Diagnose von ${partnerName}`,
    heading: "Einladung zur Strategaize-Diagnose",
    intro: (partnerName: string, displayName: string | null) =>
      displayName
        ? `Hallo ${displayName}, Ihr Steuerberater <strong>${partnerName}</strong> hat Sie eingeladen, die Strategaize-Diagnose zu nutzen.`
        : `Ihr Steuerberater <strong>${partnerName}</strong> hat Sie eingeladen, die Strategaize-Diagnose zu nutzen.`,
    what:
      "In der Diagnose beantworten Sie Fragen zu Ihrem Unternehmen. Strategaize wertet die Antworten aus und erstellt einen Bericht, den Ihr Steuerberater mit Ihnen bespricht.",
    cta:
      "Klicken Sie auf den folgenden Link, um Ihren Zugang anzulegen und mit der Diagnose zu starten:",
    button: "Zugang anlegen",
    expiry: (date: string) => `Dieser Link ist bis zum <strong>${date}</strong> gueltig.`,
    fallback: "Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
    closing: "Mit freundlichen Gruessen,<br>Ihr Strategaize-Team",
  },
} as const;

interface SendMandantInvitationEmailParams {
  to: string;
  partnerDisplayName: string;
  inviteUrl: string;
  expiresAt: Date;
  displayName?: string | null;
  locale?: string;
}

export async function sendMandantInvitationEmail({
  to,
  partnerDisplayName,
  inviteUrl,
  expiresAt,
  displayName,
}: SendMandantInvitationEmailParams): Promise<void> {
  const from = `StrategAIze <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
  const t = MANDANT_INVITE_TEMPLATES.de;

  const expiryStr = expiresAt.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // V7.1 SLC-137 MT-6 — Override-Layer per loadEmailOverridesMap.
  const overrides = await loadEmailOverridesMap("de");
  const subject = resolveText(
    overrides,
    "email.mandant_invitation.subject",
    t.subject(partnerDisplayName),
  );
  const heading = resolveText(overrides, "email.mandant_invitation.heading", t.heading);
  const what = resolveText(overrides, "email.mandant_invitation.what", t.what);
  const cta = resolveText(overrides, "email.mandant_invitation.cta", t.cta);
  const button = resolveText(overrides, "email.mandant_invitation.button", t.button);

  await transporter.sendMail({
    from,
    to,
    subject,
    html: `
      <h2>${heading}</h2>
      <p>${t.intro(partnerDisplayName, displayName ?? null)}</p>
      <p>${what}</p>
      <p>${cta}</p>
      <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#120774;color:#ffffff;text-decoration:none;border-radius:6px;">${button}</a></p>
      <p style="margin-top:16px;font-size:13px;color:#666;">${t.expiry(expiryStr)}</p>
      <p style="margin-top:16px;font-size:13px;color:#666;">${t.fallback}</p>
      <p style="font-size:13px;word-break:break-all;">${inviteUrl}</p>
      <br>
      <p>${t.closing}</p>
    `,
  });
}
