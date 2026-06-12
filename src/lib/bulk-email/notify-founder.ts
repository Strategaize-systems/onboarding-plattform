// V9.1 SLC-V9.1-B MT-4 — GF-Notification-Helper (Cost-Cap-Hit + Per-Email-Approval).
//
// Slice: SLC-V9.1-B (FEAT-077) / Spec MT-4.
// Pattern-Reuse: V8.1 SMTP-Adapter `sendMail` (@/lib/email) per
//   strategaize-pattern-reuse.md. Empfaenger-Resolution analog sendErrorNotification
//   (ERROR_ALERT_EMAIL || SMTP_USER). Pure build-Functions (testbar wie
//   stb-notification.ts buildStbNotificationEmail), notify-Wrapper resolved
//   Empfaenger + ruft sendMail. Silent-Skip ohne Empfaenger.
//
// Tonalitaet: neutral-informativ (Ops-Alert), keine Glueckwunsch-Voice.

import { sendMail } from "@/lib/email";

import type { ContinuousCapReason } from "./continuous-cost-cap";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

function reasonLabel(reason: ContinuousCapReason): string {
  return reason === "daily_cap_hit"
    ? "Tages-Kostenlimit"
    : "Monats-Kostenlimit";
}

function fromHeader(): string {
  return `StrategAIze Alerts <${
    process.env.SMTP_FROM || process.env.SMTP_USER || "alerts@strategaize.de"
  }>`;
}

/** Empfaenger der Founder-Ops-Alerts. Analog sendErrorNotification-Resolution. */
export function founderRecipient(): string | null {
  return (
    process.env.FOUNDER_ALERT_EMAIL ||
    process.env.ERROR_ALERT_EMAIL ||
    process.env.SMTP_USER ||
    null
  );
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    "https://onboarding.strategaizetransition.com"
  );
}

function auditUrl(): string {
  return `${appBaseUrl()}/admin/audit/bulk-email`;
}

export interface FounderEmailContent {
  subject: string;
  html: string;
  text: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Cap-Hit-Notification
// ────────────────────────────────────────────────────────────────────────────

export interface FounderCapHitInput {
  tenantId: string;
  tenantName?: string | null;
  reason: ContinuousCapReason;
  cap: number;
  actual: number;
}

export function buildFounderCapHitEmail(
  input: FounderCapHitInput,
): FounderEmailContent {
  const tenantLabel = input.tenantName
    ? `${input.tenantName} (${input.tenantId})`
    : input.tenantId;
  const label = reasonLabel(input.reason);
  const link = auditUrl();

  const subject = `[Bulk-Email] ${label} erreicht — Continuous-Pipeline pausiert (${
    input.tenantName ?? input.tenantId
  })`;

  const lines = [
    `Das ${label} fuer die kontinuierliche Bulk-Email-Verarbeitung wurde erreicht. Die Continuous-Pipeline fuer den betroffenen Tenant wurde automatisch pausiert (Status 'paused').`,
    `Tenant: ${tenantLabel}`,
    `Grund: ${label}`,
    `Limit: ${formatEur(input.cap)}`,
    `Aktueller Stand: ${formatEur(input.actual)}`,
    `Naechster Schritt: Kosten im Audit pruefen und den Run nach Freigabe manuell zuruecksetzen (siehe RUNBOOK "V9.1 Continuous-Cost-Cap").`,
  ];

  const html = `<!doctype html>
<html lang="de">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 640px; margin: 0 auto; padding: 24px; line-height: 1.6;">
    <h2 style="font-size:18px;color:#b45309;">Bulk-Email: ${escapeHtml(label)} erreicht</h2>
    <p>${escapeHtml(lines[0])}</p>
    <table style="font-size:14px;border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Tenant:</td><td>${escapeHtml(tenantLabel)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Grund:</td><td>${escapeHtml(label)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Limit:</td><td>${escapeHtml(formatEur(input.cap))}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Aktueller Stand:</td><td>${escapeHtml(formatEur(input.actual))}</td></tr>
    </table>
    <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#120774;color:#ffffff;text-decoration:none;border-radius:6px;">Bulk-Email-Audit oeffnen</a></p>
    <p style="font-size:13px;color:#6b7280;">${escapeHtml(lines[5])}</p>
  </body>
</html>`;

  const text = [...lines, ``, `Audit: ${link}`].join("\n");

  return { subject, html, text };
}

// ────────────────────────────────────────────────────────────────────────────
// Per-Email-Approval-Required-Notification
// ────────────────────────────────────────────────────────────────────────────

export interface FounderApprovalRequiredInput {
  tenantId: string;
  tenantName?: string | null;
  bulkRunId: string;
  estimatedTotalEur: number;
  estimatedPerEmailEur: number;
  thresholdEur: number;
}

export function buildFounderApprovalRequiredEmail(
  input: FounderApprovalRequiredInput,
): FounderEmailContent {
  const tenantLabel = input.tenantName
    ? `${input.tenantName} (${input.tenantId})`
    : input.tenantId;
  const link = auditUrl();

  const subject = `[Bulk-Email] Freigabe erforderlich — Per-Email-Kosten ueber Schwelle (${
    input.tenantName ?? input.tenantId
  })`;

  const lines = [
    `Ein Continuous-Bulk-Email-Run hat die Per-Email-Approval-Schwelle ueberschritten. Die Pattern-Extraktion wurde vor dem LLM-Call pausiert (Status 'awaiting_approval') und benoetigt eine manuelle Freigabe.`,
    `Tenant: ${tenantLabel}`,
    `Run-ID: ${input.bulkRunId}`,
    `Geschaetzte Kosten/Email: ${formatEur(input.estimatedPerEmailEur)}`,
    `Schwelle: ${formatEur(input.thresholdEur)}`,
    `Geschaetzte Gesamtkosten: ${formatEur(input.estimatedTotalEur)}`,
    `Naechster Schritt: Kosten pruefen und bei Freigabe den Run mit Approval-Token erneut anstossen (siehe RUNBOOK "V9.1 Continuous-Cost-Cap").`,
  ];

  const html = `<!doctype html>
<html lang="de">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 640px; margin: 0 auto; padding: 24px; line-height: 1.6;">
    <h2 style="font-size:18px;color:#b45309;">Bulk-Email: Freigabe erforderlich</h2>
    <p>${escapeHtml(lines[0])}</p>
    <table style="font-size:14px;border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Tenant:</td><td>${escapeHtml(tenantLabel)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Run-ID:</td><td>${escapeHtml(input.bulkRunId)}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Kosten/Email:</td><td>${escapeHtml(formatEur(input.estimatedPerEmailEur))}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Schwelle:</td><td>${escapeHtml(formatEur(input.thresholdEur))}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Gesamt (geschaetzt):</td><td>${escapeHtml(formatEur(input.estimatedTotalEur))}</td></tr>
    </table>
    <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#120774;color:#ffffff;text-decoration:none;border-radius:6px;">Bulk-Email-Audit oeffnen</a></p>
    <p style="font-size:13px;color:#6b7280;">${escapeHtml(lines[6])}</p>
  </body>
</html>`;

  const text = [...lines, ``, `Audit: ${link}`].join("\n");

  return { subject, html, text };
}

// ────────────────────────────────────────────────────────────────────────────
// Notify-Wrapper (sendMail injectable fuer hermetische Tests)
// ────────────────────────────────────────────────────────────────────────────

export interface NotifyDeps {
  /** Injectable sendMail (Default @/lib/email sendMail). */
  sendMail?: typeof sendMail;
  /** Override Empfaenger (undefined -> founderRecipient()); null -> Silent-Skip. */
  recipient?: string | null;
}

/**
 * Versendet die Cap-Hit-Notification an den Founder. Liefert true wenn versendet,
 * false wenn kein Empfaenger konfiguriert ist (Silent-Skip, kein Throw).
 */
export async function notifyFounderCapHit(
  input: FounderCapHitInput,
  deps: NotifyDeps = {},
): Promise<boolean> {
  const to = deps.recipient !== undefined ? deps.recipient : founderRecipient();
  if (!to) return false;
  const send = deps.sendMail ?? sendMail;
  const { subject, html, text } = buildFounderCapHitEmail(input);
  await send({ from: fromHeader(), to, subject, html, text });
  return true;
}

/**
 * Versendet die Per-Email-Approval-Required-Notification an den Founder.
 * Liefert true wenn versendet, false bei Silent-Skip.
 */
export async function notifyFounderApprovalRequired(
  input: FounderApprovalRequiredInput,
  deps: NotifyDeps = {},
): Promise<boolean> {
  const to = deps.recipient !== undefined ? deps.recipient : founderRecipient();
  if (!to) return false;
  const send = deps.sendMail ?? sendMail;
  const { subject, html, text } = buildFounderApprovalRequiredEmail(input);
  await send({ from: fromHeader(), to, subject, html, text });
  return true;
}
