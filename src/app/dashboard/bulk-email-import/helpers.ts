// V9 SLC-165 MT-4 — Pure helpers + constants fuer Bulk-Email-Upload.
//
// Trennung von actions.ts: Next.js "use server"-Files erlauben nur async-
// Function-Exports. Konstanten + Sync-Helper landen daher hier.

export const STORAGE_BUCKET = "bulk-email";

/** 500 MB hard cap — matched die bucket file_size_limit aus Migration 106. */
export const MAX_FILE_SIZE_BYTES = 524288000;

export const ALLOWED_EXTENSIONS = [".mbox", ".eml"] as const;

export const ALLOWED_MIME_TYPES = new Set<string>([
  "application/mbox",
  "message/rfc822",
  "application/octet-stream",
  "text/plain",
]);

export const JOB_TYPE_EMAIL_BULK_PARSE = "email_bulk_parse";

export const CAPTURE_MODE_EMAIL_BULK = "email_bulk";

/**
 * Datei-Validation: Extension + MIME + Groesse. Wir akzeptieren mehrere MIME-
 * Typen, weil Browser je nach OS unterschiedlich labeln (Gmail-Takeout-.mbox
 * landet oft als application/octet-stream).
 *
 * @returns null bei OK, sonst lokalisierter Fehler-String fuer das UI.
 */
export function validateUploadFile(file: File): string | null {
  if (file.size === 0) {
    return "Datei ist leer";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `Datei zu gross (${mb} MB, max 500 MB)`;
  }
  const lowerName = file.name.toLowerCase();
  const hasAllowedExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!hasAllowedExt) {
    return "Nur .mbox- und .eml-Dateien sind erlaubt";
  }
  // MIME-Check ist defensiv — Bucket policy validiert ohnehin. Browser-Quirks
  // tolerieren wir, solange die Extension passt.
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return `MIME-Typ '${file.type}' nicht erlaubt`;
  }
  return null;
}

/**
 * Filenamen entschaerfen — analog evidence-upload sanitizeFilename. Ergebnis
 * ist nur fuer den Storage-Pfad relevant; original filename wandert in
 * email_bulk_run.source_file_name unangetastet.
 */
export function safeStorageBasename(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : "upload";
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared types — werden von Server-Action + Page + Client-Component genutzt.
// ──────────────────────────────────────────────────────────────────────────────

export type BulkRunStatus =
  | "uploaded"
  | "parsing"
  | "parsed"
  | "pre_filtering"
  | "pre_filtered"
  | "thread_redacting"
  | "thread_redacted"
  | "pattern_extracting"
  | "pattern_extracted"
  | "curating"
  | "importing"
  | "completed"
  | "failed";

export interface BulkRunSummary {
  id: string;
  source_file_name: string;
  email_count: number;
  content_emails: number;
  thread_count: number;
  patterns_extracted: number;
  patterns_accepted: number;
  patterns_imported: number;
  total_cost_eur: string;
  status: BulkRunStatus;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type UploadResult =
  | { ok: true; runId: string; duplicate: false }
  | { ok: true; runId: string; duplicate: true }
  | { ok: false; error: string };
