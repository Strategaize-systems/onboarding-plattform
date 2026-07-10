// SLC-194 MT-2 (V20, FEAT-111, BL-538, ISSUE-122) — Bild-Format-Allowlist +
// Magic-Byte-Sniffing fuer den Partner-Logo-Upload.
//
// Sibling zu actions.ts ('use server'): Konstanten + synchrone Helper duerfen
// NICHT in der 'use server'-Datei liegen (jeder Export dort waere eine ungeschuetzte
// Server-Action, Turbopack-Gate). Hier gekapselt + isoliert unit-testbar.
//
// Sicherheits-Zweck: image/svg+xml ist raus (Stored-XSS via <script> im SVG,
// ISSUE-122). Der reine file.type-Check reicht nicht — ein Angreifer kann ein SVG
// als logo.png mit Content-Type image/png hochladen. Daher zusaetzlich Magic-Byte-
// Pruefung: die realen ersten Bytes muessen zum deklarierten MIME passen.

export const ALLOWED_IMAGE_MIMES = ["image/png", "image/jpeg"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export const EXT_BY_MIME: Record<AllowedImageMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

/**
 * Erkennt den Bild-MIME anhand der Magic-Bytes. Gibt den erkannten MIME zurueck
 * oder null (unbekannt/leer). SVG und beliebiger Text haben keine binaere Signatur
 * → null → Reject. Bewusst nur PNG + JPEG (die erlaubten Raster-Formate).
 */
export function sniffImageMime(bytes: Uint8Array): AllowedImageMime | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG (JFIF/EXIF): FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  return null;
}
