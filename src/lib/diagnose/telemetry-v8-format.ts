// V8 SLC-152 MT-2 — Pure-Logic-Helpers fuer V8-Telemetry-Adapter.
//
// Separat von telemetry-v8.ts damit Vitest die Format-Funktionen ohne
// Supabase-Admin-Client-Module-Load testen kann (Logger-Import in
// telemetry-v8.ts triggert sonst supabase-js createClient zur Test-Zeit, was
// SUPABASE_URL ENV erfordert).

export function formatV8ReportGeneratedPayload(): Record<string, unknown> {
  return { timestamp: new Date().toISOString() };
}

export function formatV8EmailSentPayload(
  pdfSizeBytes: number,
): Record<string, unknown> {
  return {
    pdf_size_bytes: pdfSizeBytes,
    timestamp: new Date().toISOString(),
  };
}

export function formatV8PdfRenderFailedPayload(
  error: unknown,
): Record<string, unknown> {
  const errClass =
    error && typeof error === "object" && "constructor" in error
      ? (error as { constructor: { name: string } }).constructor.name
      : "Unknown";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown error";
  return {
    error_class: errClass,
    // Truncate auf 200 Zeichen — Constraint-Violation-Errors koennen lang
    // werden und sind im Volltext nicht relevant fuer das Telemetry-Dashboard.
    error_message_snippet: message.slice(0, 200),
    timestamp: new Date().toISOString(),
  };
}
