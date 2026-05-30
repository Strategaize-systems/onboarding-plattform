// V8 SLC-152 MT-2 (FEAT-058-Reuse) — V8-Lifecycle-Telemetrie-Adapter.
//
// Server-Side-Tracker fuer die 3 V8-Event-Types:
//   - v8_report_generated  → finalizeMandantenReport Snapshot-Persistenz
//   - v8_email_sent        → sendDiagnoseReportByEmail V8-Branch SMTP-Success
//   - v8_pdf_render_failed → renderMandantenReportV2Pdf Error
//
// Im Gegensatz zum Browser-Tracker (src/lib/diagnose/telemetry.ts, der
// /api/diagnose-event ueber fetch ansteuert) schreiben die V8-Tracker direkt
// per supabase-admin-Client in `diagnose_event`. Migration 104 erweitert den
// CHECK-Constraint um die 3 V8-Werte (Pre-Condition fuer den ersten Live-Run).
//
// Fail-silent: alle Insert-Errors werden geloggt aber nie geworfen, damit die
// Telemetrie keine User-facing Aktion (Email-Versand, Snapshot-Schreiben)
// blocken kann. Die produktive Logik soll auch ohne Telemetrie sauber
// durchlaufen.

import type { SupabaseClient } from "@supabase/supabase-js";
import { captureException } from "@/lib/logger";
import {
  formatV8EmailSentPayload,
  formatV8PdfRenderFailedPayload,
  formatV8ReportGeneratedPayload,
} from "./telemetry-v8-format";

// Pure-Logic-Helpers fuer Tests re-exporten — Caller koennen sie weiter aus
// telemetry-v8 importieren.
export {
  formatV8EmailSentPayload,
  formatV8PdfRenderFailedPayload,
  formatV8ReportGeneratedPayload,
};

const SOURCE_PREFIX = "diagnose/telemetry-v8";

type AdminClient = SupabaseClient;

async function insertDiagnoseEvent(
  admin: AdminClient,
  row: {
    capture_session_id: string;
    tenant_id: string;
    event_type:
      | "v8_report_generated"
      | "v8_email_sent"
      | "v8_pdf_render_failed";
    payload: Record<string, unknown>;
  },
  source: string,
): Promise<void> {
  const { error } = await admin.from("diagnose_event").insert({
    capture_session_id: row.capture_session_id,
    tenant_id: row.tenant_id,
    event_type: row.event_type,
    question_key: null,
    payload: row.payload,
    is_test: false,
  });
  if (error) {
    // Fail-silent: nicht throw, nur loggen.
    captureException(new Error(error.message), {
      source,
      metadata: {
        capture_session_id: row.capture_session_id,
        event_type: row.event_type,
      },
    });
  }
}

/**
 * Track-Event: V8-SUI-Snapshot erfolgreich persistiert.
 * Caller: finalizeMandantenReport (SLC-148 MT-6) nach erfolgreichem
 * capture_session.metadata-Update.
 */
export function trackV8ReportGenerated(
  admin: AdminClient,
  captureSessionId: string,
  tenantId: string,
): void {
  void insertDiagnoseEvent(
    admin,
    {
      capture_session_id: captureSessionId,
      tenant_id: tenantId,
      event_type: "v8_report_generated",
      payload: formatV8ReportGeneratedPayload(),
    },
    `${SOURCE_PREFIX}/v8_report_generated`,
  );
}

/**
 * Track-Event: V8-PDF erfolgreich per Email versendet.
 * Caller: sendDiagnoseReportByEmail V8-Branch (SLC-152 MT-1) nach
 * erfolgreichem sendMail-Call.
 */
export function trackV8EmailSent(
  admin: AdminClient,
  captureSessionId: string,
  tenantId: string,
  pdfSizeBytes: number,
): void {
  void insertDiagnoseEvent(
    admin,
    {
      capture_session_id: captureSessionId,
      tenant_id: tenantId,
      event_type: "v8_email_sent",
      payload: formatV8EmailSentPayload(pdfSizeBytes),
    },
    `${SOURCE_PREFIX}/v8_email_sent`,
  );
}

/**
 * Track-Event: V8-PDF-Render schlug fehl.
 * Caller: sendDiagnoseReportByEmail V8-Branch ODER
 * downloadMandantenReportV2Pdf bei renderMandantenReportV2Pdf-Throw.
 */
export function trackV8PdfRenderFailed(
  admin: AdminClient,
  captureSessionId: string,
  tenantId: string,
  error: unknown,
): void {
  void insertDiagnoseEvent(
    admin,
    {
      capture_session_id: captureSessionId,
      tenant_id: tenantId,
      event_type: "v8_pdf_render_failed",
      payload: formatV8PdfRenderFailedPayload(error),
    },
    `${SOURCE_PREFIX}/v8_pdf_render_failed`,
  );
}
