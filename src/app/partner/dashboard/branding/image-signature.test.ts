// SLC-194 MT-2 — Pure-Mock-Test fuer Bild-Format-Allowlist + Magic-Byte-Sniff.
// AC-194-3: SVG abgelehnt (MIME + Magic-Byte). Die Magic-Byte-Logik liegt im
// Sibling image-signature.ts ('use server'-Gate) und wird hier direkt geprueft;
// die actions.ts nutzt sie nach dem file.type-Check als zweite Schranke.

import { describe, it, expect } from "vitest";
import {
  ALLOWED_IMAGE_MIMES,
  EXT_BY_MIME,
  sniffImageMime,
} from "./image-signature";

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function bytesOf(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

describe("ALLOWED_IMAGE_MIMES / EXT_BY_MIME", () => {
  it("does NOT include image/svg+xml (ISSUE-122)", () => {
    expect(ALLOWED_IMAGE_MIMES).not.toContain("image/svg+xml");
    expect(ALLOWED_IMAGE_MIMES).toEqual(["image/png", "image/jpeg"]);
  });

  it("has no svg extension mapping", () => {
    expect(Object.keys(EXT_BY_MIME)).not.toContain("image/svg+xml");
    expect(EXT_BY_MIME).toEqual({ "image/png": "png", "image/jpeg": "jpg" });
  });
});

describe("sniffImageMime", () => {
  it("detects PNG by magic bytes", () => {
    expect(sniffImageMime(PNG_MAGIC)).toBe("image/png");
  });

  it("detects JPEG by magic bytes", () => {
    expect(sniffImageMime(JPEG_MAGIC)).toBe("image/jpeg");
  });

  it("rejects SVG payload (no binary signature)", () => {
    expect(sniffImageMime(bytesOf('<svg xmlns="..."><script>alert(1)</script></svg>'))).toBeNull();
  });

  it("rejects HTML/script text", () => {
    expect(sniffImageMime(bytesOf("<script>alert(1)</script>"))).toBeNull();
  });

  it("rejects empty and truncated input", () => {
    expect(sniffImageMime(new Uint8Array([]))).toBeNull();
    expect(sniffImageMime(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it("rejects a PNG-declared file whose bytes are actually SVG (spoofed Content-Type)", () => {
    // actions.ts fordert sniffed === mime; hier ist sniffed=null !== 'image/png'.
    const spoofed = bytesOf('<svg onload="alert(1)"></svg>');
    expect(sniffImageMime(spoofed)).not.toBe("image/png");
    expect(sniffImageMime(spoofed)).toBeNull();
  });
});
