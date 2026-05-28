export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "application/zip",
];

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

/** Validate MIME type. Returns error message or null. */
export function validateMimeType(mimeType: string): string | null {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return `MIME-Type '${mimeType}' nicht erlaubt. Erlaubt: PDF, DOCX, TXT, CSV, ZIP`;
  }
  return null;
}

/** Validate file size. Returns error message or null. */
export function validateFileSize(sizeBytes: number): string | null {
  if (sizeBytes === 0) {
    return "Leere Datei";
  }
  if (sizeBytes > MAX_FILE_SIZE) {
    return `Datei zu gross (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Maximum: 20 MB`;
  }
  return null;
}

/** Sanitize filename for storage path. */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
