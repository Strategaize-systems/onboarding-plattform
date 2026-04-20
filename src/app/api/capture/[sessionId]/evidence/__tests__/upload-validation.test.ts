import { describe, it, expect } from "vitest";
import {
  validateMimeType,
  validateFileSize,
  sanitizeFilename,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from "../upload/route";

describe("Evidence Upload Validation", () => {
  describe("validateMimeType", () => {
    it("accepts PDF", () => {
      expect(validateMimeType("application/pdf")).toBeNull();
    });

    it("accepts DOCX", () => {
      expect(
        validateMimeType(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
      ).toBeNull();
    });

    it("accepts TXT", () => {
      expect(validateMimeType("text/plain")).toBeNull();
    });

    it("accepts CSV", () => {
      expect(validateMimeType("text/csv")).toBeNull();
    });

    it("accepts ZIP", () => {
      expect(validateMimeType("application/zip")).toBeNull();
    });

    it("rejects image/png", () => {
      const result = validateMimeType("image/png");
      expect(result).not.toBeNull();
      expect(result).toContain("image/png");
      expect(result).toContain("nicht erlaubt");
    });

    it("rejects application/json", () => {
      expect(validateMimeType("application/json")).not.toBeNull();
    });

    it("rejects application/javascript", () => {
      expect(validateMimeType("application/javascript")).not.toBeNull();
    });

    it("rejects text/html", () => {
      expect(validateMimeType("text/html")).not.toBeNull();
    });

    it("rejects empty string", () => {
      expect(validateMimeType("")).not.toBeNull();
    });

    it("all allowed MIME types pass", () => {
      for (const mime of ALLOWED_MIME_TYPES) {
        expect(validateMimeType(mime)).toBeNull();
      }
    });
  });

  describe("validateFileSize", () => {
    it("accepts 1 byte file", () => {
      expect(validateFileSize(1)).toBeNull();
    });

    it("accepts 1 MB file", () => {
      expect(validateFileSize(1024 * 1024)).toBeNull();
    });

    it("accepts exactly 20 MB", () => {
      expect(validateFileSize(MAX_FILE_SIZE)).toBeNull();
    });

    it("rejects 0 bytes (empty file)", () => {
      const result = validateFileSize(0);
      expect(result).not.toBeNull();
      expect(result).toContain("Leere Datei");
    });

    it("rejects file larger than 20 MB", () => {
      const result = validateFileSize(MAX_FILE_SIZE + 1);
      expect(result).not.toBeNull();
      expect(result).toContain("zu gross");
      expect(result).toContain("20 MB");
    });

    it("rejects 50 MB file", () => {
      const result = validateFileSize(50 * 1024 * 1024);
      expect(result).not.toBeNull();
      expect(result).toContain("50.0 MB");
    });
  });

  describe("sanitizeFilename", () => {
    it("keeps safe filenames unchanged", () => {
      expect(sanitizeFilename("document.pdf")).toBe("document.pdf");
    });

    it("keeps hyphens and underscores", () => {
      expect(sanitizeFilename("my-file_v2.docx")).toBe("my-file_v2.docx");
    });

    it("replaces spaces with underscores", () => {
      expect(sanitizeFilename("my file.pdf")).toBe("my_file.pdf");
    });

    it("replaces German umlauts", () => {
      expect(sanitizeFilename("Übersicht.pdf")).toBe("_bersicht.pdf");
    });

    it("replaces multiple special characters", () => {
      expect(sanitizeFilename("Report (Q1) [2026].csv")).toBe(
        "Report__Q1___2026_.csv"
      );
    });

    it("handles empty filename", () => {
      expect(sanitizeFilename("")).toBe("");
    });
  });
});
