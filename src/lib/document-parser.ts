// Document text extraction for LLM context
// Supports: PDF, DOCX, TXT, CSV
// Errors are thrown (not swallowed) so callers can log them properly

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string | null> {
  // PDF
  if (mimeType === "application/pdf") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const result = await pdfParse(buffer);
    return result.text?.trim() || null;
  }

  // DOCX
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".docx")
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value?.trim() || null;
  }

  // Plain text
  if (
    mimeType === "text/plain" ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".csv")
  ) {
    return buffer.toString("utf-8").trim() || null;
  }

  // Excel — not parseable for text context
  if (mimeType.includes("spreadsheet") || fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    return null;
  }

  // Images — not parseable (would need OCR)
  if (mimeType.startsWith("image/")) {
    return null;
  }

  return null;
}
