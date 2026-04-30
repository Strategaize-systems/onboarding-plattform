import nodemailer from "nodemailer";

// Q-V4.2-I-Entscheidung: @supabase/supabase-js hat keine Custom-Send-Mail-API
// (nur Auth-Templates fuer Invite/Recovery). Daher nodemailer direkt — gleiches
// Pattern wie src/lib/email.ts.

export type ReminderStage = "stage1" | "stage2";

export interface ReminderInput {
  to: string;
  tenantName: string;
  stage: ReminderStage;
  unsubscribeToken: string;
  captureUrl: string;
}

export interface ReminderTransport {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
}

let defaultTransport: ReminderTransport | null = null;

function getDefaultTransport(): ReminderTransport {
  if (!defaultTransport) {
    defaultTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return defaultTransport;
}

const SUBJECTS: Record<ReminderStage, string> = {
  // Neutrale Subjects ohne Spam-Trigger ("Achtung", "Letzte Chance" vermeiden).
  stage1: "Erinnerung: Du hast noch nicht angefangen",
  stage2: "Letzte Erinnerung: Bitte starte deine Erfassung",
};

const BODY_INTRO: Record<ReminderStage, (tenantName: string) => string> = {
  stage1: (tenantName) =>
    `dein Team bei <strong>${escape(tenantName)}</strong> hat dich eingeladen, deine Erfassung auf der StrategAIze-Plattform zu starten. Es geht darum, dein Wissen aus dem Arbeitsalltag strukturiert festzuhalten — der Aufwand liegt typischerweise bei 30–45 Minuten und du kannst jederzeit pausieren.`,
  stage2: (tenantName) =>
    `dein Team bei <strong>${escape(tenantName)}</strong> wartet noch auf den Beginn deiner Erfassung. Damit dein Wissen in das Unternehmenshandbuch einfliessen kann, klicke einmal auf "Erfassung starten" — du kannst nach dem Start jederzeit pausieren und spaeter weitermachen.`,
};

function escape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(input: ReminderInput, unsubscribeUrl: string): string {
  const intro = BODY_INTRO[input.stage](input.tenantName);
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">
      <p>Hallo,</p>
      <p>${intro}</p>
      <p style="margin:24px 0;">
        <a href="${input.captureUrl}" style="display:inline-block;padding:12px 24px;background:#120774;color:#ffffff;text-decoration:none;border-radius:6px;">Erfassung starten</a>
      </p>
      <p style="font-size:13px;color:#666;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:</p>
      <p style="font-size:13px;word-break:break-all;color:#374151;">${input.captureUrl}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;" />
      <p style="font-size:12px;color:#6b7280;">
        Du moechtest keine weiteren Erinnerungen erhalten?
        <a href="${unsubscribeUrl}" style="color:#6b7280;">Hier abmelden</a>.
      </p>
    </div>
  `;
}

export async function sendReminder(
  input: ReminderInput,
  transport: ReminderTransport = getDefaultTransport()
): Promise<{ ok: boolean; error?: string }> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const unsubscribeUrl = `${appUrl}/api/unsubscribe/${input.unsubscribeToken}`;
  const from = `StrategAIze <${process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@strategaizetransition.com"}>`;

  try {
    await transport.sendMail({
      from,
      to: input.to,
      subject: SUBJECTS[input.stage],
      html: buildHtml(input, unsubscribeUrl),
    });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error };
  }
}
