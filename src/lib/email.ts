import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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

// ─── Mirror-specific invite templates ────────────────────────────────────────

const MIRROR_INVITE_TEMPLATES = {
  de: {
    subject: "Vertrauliche Einladung — Strukturelle Realitätserhebung",
    heading: "Einladung zur vertraulichen Realitätserhebung",
    intro: (tenantName: string) =>
      `Im Rahmen einer strategischen Analyse führt <strong>StrategAIze</strong> eine strukturelle Realitätserhebung für <strong>${tenantName}</strong> durch.`,
    why: "Sie wurden ausgewählt, weil Ihre Perspektive aus dem operativen Arbeitsalltag für die Analyse besonders wertvoll ist.",
    what: "Sie beantworten Fragen zu Ihrem Arbeitsbereich — <strong>Zeitaufwand ca. 30–45 Minuten</strong>. Sie können jederzeit unterbrechen und später fortfahren.",
    confidentiality: "<strong>Vertraulichkeit:</strong> Ihre Antworten werden nicht personenbezogen an die Geschäftsführung zurückgegeben. Die Auswertung erfolgt verdichtet und entpersonalisiert.",
    ai: "<strong>KI-Assistent:</strong> Ein KI-Assistent begleitet Sie durch die Fragen und hilft bei Unklarheiten.",
    deadline: (date: string) => `<strong>Zeitrahmen:</strong> Bitte schließen Sie die Erhebung bis zum <strong>${date}</strong> ab.`,
    cta: "Klicken Sie auf den folgenden Link, um zu starten:",
    button: "Jetzt starten",
    fallback: "Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
    closing: "Vielen Dank für Ihre Teilnahme.<br>Ihr StrategAIze Team",
  },
  en: {
    subject: "Confidential Invitation — Structural Reality Assessment",
    heading: "Invitation to Confidential Reality Assessment",
    intro: (tenantName: string) =>
      `As part of a strategic analysis, <strong>StrategAIze</strong> is conducting a structural reality assessment for <strong>${tenantName}</strong>.`,
    why: "You have been selected because your perspective from day-to-day operations is particularly valuable for this analysis.",
    what: "You will answer questions about your area of work — <strong>estimated time: 30–45 minutes</strong>. You can pause at any time and continue later.",
    confidentiality: "<strong>Confidentiality:</strong> Your answers will not be shared with management on a personal basis. The evaluation is aggregated and depersonalised.",
    ai: "<strong>AI Assistant:</strong> An AI assistant will guide you through the questions and help with any clarifications.",
    deadline: (date: string) => `<strong>Timeframe:</strong> Please complete the assessment by <strong>${date}</strong>.`,
    cta: "Click the following link to get started:",
    button: "Start now",
    fallback: "If the button doesn't work, copy this link into your browser:",
    closing: "Thank you for your participation.<br>Your StrategAIze Team",
  },
  nl: {
    subject: "Vertrouwelijke uitnodiging — Structurele realiteitsmeting",
    heading: "Uitnodiging voor vertrouwelijke realiteitsmeting",
    intro: (tenantName: string) =>
      `In het kader van een strategische analyse voert <strong>StrategAIze</strong> een structurele realiteitsmeting uit voor <strong>${tenantName}</strong>.`,
    why: "U bent geselecteerd omdat uw perspectief vanuit de dagelijkse operatie bijzonder waardevol is voor deze analyse.",
    what: "U beantwoordt vragen over uw werkgebied — <strong>geschatte tijd: 30–45 minuten</strong>. U kunt op elk moment pauzeren en later verdergaan.",
    confidentiality: "<strong>Vertrouwelijkheid:</strong> Uw antwoorden worden niet persoonlijk aan het management teruggekoppeld. De evaluatie is geaggregeerd en gedepersonaliseerd.",
    ai: "<strong>AI-assistent:</strong> Een AI-assistent begeleidt u door de vragen en helpt bij onduidelijkheden.",
    deadline: (date: string) => `<strong>Tijdskader:</strong> Vul de meting a.u.b. vóór <strong>${date}</strong> in.`,
    cta: "Klik op de volgende link om te beginnen:",
    button: "Nu beginnen",
    fallback: "Als de knop niet werkt, kopieer dan deze link in uw browser:",
    closing: "Bedankt voor uw deelname.<br>Uw StrategAIze Team",
  },
} as const;

interface SendMirrorInviteEmailParams {
  to: string;
  tenantName: string;
  verifyUrl: string;
  locale?: string;
  deadlineDate?: string | null;
}

export async function sendMirrorInviteEmail({
  to,
  tenantName,
  verifyUrl,
  locale,
  deadlineDate,
}: SendMirrorInviteEmailParams): Promise<void> {
  const from = `StrategAIze <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
  const lang = (locale && locale in MIRROR_INVITE_TEMPLATES ? locale : "de") as keyof typeof MIRROR_INVITE_TEMPLATES;
  const t = MIRROR_INVITE_TEMPLATES[lang];

  const deadlineHtml = deadlineDate ? `<p>${t.deadline(deadlineDate)}</p>` : "";

  await transporter.sendMail({
    from,
    to,
    subject: t.subject,
    html: `
      <h2>${t.heading}</h2>
      <p>${t.intro(tenantName)}</p>
      <p>${t.why}</p>
      <p>${t.what}</p>
      <p>${t.confidentiality}</p>
      <p>${t.ai}</p>
      ${deadlineHtml}
      <p>${t.cta}</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#120774;color:#ffffff;text-decoration:none;border-radius:6px;">${t.button}</a></p>
      <p style="margin-top:16px;font-size:13px;color:#666;">${t.fallback}</p>
      <p style="font-size:13px;word-break:break-all;">${verifyUrl}</p>
      <br>
      <p>${t.closing}</p>
    `,
  });
}

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

  await transporter.sendMail({
    from,
    to,
    subject: t.subject,
    html: `
      <h2>${t.heading}</h2>
      <p>${t.intro(tenantName)}</p>
      <p>${t.cta}</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#120774;color:#ffffff;text-decoration:none;border-radius:6px;">${t.button}</a></p>
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

  await transporter.sendMail({
    from,
    to,
    subject: t.subject(tenantName),
    html: `
      <h2>${t.heading(tenantName)}</h2>
      <p>${t.intro(tenantName, displayName ?? null)}</p>
      ${roleHtml}
      <p>${t.cta}</p>
      <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#120774;color:#ffffff;text-decoration:none;border-radius:6px;">${t.button}</a></p>
      <p style="margin-top:16px;font-size:13px;color:#666;">${t.expiry(expiryStr)}</p>
      <p style="margin-top:16px;font-size:13px;color:#666;">${t.fallback}</p>
      <p style="font-size:13px;word-break:break-all;">${inviteUrl}</p>
      <br>
      <p>${t.closing}</p>
    `,
  });
}
