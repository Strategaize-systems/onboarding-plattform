// Evidence Text Extraction Module
// Dispatches extraction by MIME type: PDF (pdf-parse), DOCX (mammoth), TXT/CSV (direct), ZIP (recursive).

// pdf-parse/index.js crashes in ESM: module.parent is undefined → debug code
// tries to read a non-existent test file. Import implementation directly.
// @ts-expect-error no type declarations for subpath
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import { createReadStream } from "fs";
import { Readable } from "stream";
import * as zlib from "node:zlib";

/** Supported MIME types for text extraction */
const EXTRACTORS: Record<string, (buffer: Buffer) => Promise<string>> = {
  "application/pdf": extractPdf,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": extractDocx,
  "text/plain": extractDirect,
  "text/csv": extractDirect,
};

/** MIME types that should be extracted from inside ZIP archives */
const ZIP_INNER_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
]);

/**
 * Extract text from a buffer based on its MIME type.
 * For ZIP: extracts and processes inner files recursively.
 * Returns concatenated text from all extracted sources.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename?: string
): Promise<string> {
  if (mimeType === "application/zip") {
    return extractZip(buffer);
  }

  const extractor = EXTRACTORS[mimeType];
  if (!extractor) {
    throw new Error(`Unsupported MIME type for extraction: ${mimeType}`);
  }

  return extractor(buffer);
}

/** Extract text from PDF using pdf-parse */
async function extractPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  const text = result.text?.trim();
  if (!text) {
    throw new Error("PDF contains no extractable text (possibly image-only PDF)");
  }
  return text;
}

/** Extract text from DOCX using mammoth */
async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value?.trim();
  if (!text) {
    throw new Error("DOCX contains no extractable text");
  }
  return text;
}

/** Direct text extraction for TXT and CSV */
async function extractDirect(buffer: Buffer): Promise<string> {
  const text = buffer.toString("utf-8").trim();
  if (!text) {
    throw new Error("File is empty");
  }
  return text;
}

/**
 * Extract text from ZIP archive.
 * Uses Node.js built-in zlib for deflate decompression.
 * Processes each supported file inside the archive.
 */
async function extractZip(buffer: Buffer): Promise<string> {
  const entries = parseZipEntries(buffer);
  const texts: string[] = [];

  for (const entry of entries) {
    const ext = entry.filename.split(".").pop()?.toLowerCase() ?? "";
    const innerMime = extToMime(ext);

    if (!innerMime || !ZIP_INNER_TYPES.has(innerMime)) {
      continue; // skip unsupported files inside ZIP
    }

    try {
      const innerText = await extractText(entry.data, innerMime, entry.filename);
      texts.push(`--- ${entry.filename} ---\n${innerText}`);
    } catch {
      // Skip files that fail extraction inside ZIP
      texts.push(`--- ${entry.filename} --- [Extraktion fehlgeschlagen]`);
    }
  }

  if (texts.length === 0) {
    throw new Error("ZIP contains no extractable files (PDF, DOCX, TXT, CSV)");
  }

  return texts.join("\n\n");
}

/** Map file extension to MIME type */
function extToMime(ext: string): string | null {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    csv: "text/csv",
  };
  return map[ext] ?? null;
}

// ---- Minimal ZIP parser (no external dependency) ----
// ZIP format: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT

interface ZipEntry {
  filename: string;
  data: Buffer;
}

function parseZipEntries(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset < buffer.length - 4) {
    const signature = buffer.readUInt32LE(offset);

    // Local file header signature = 0x04034b50
    if (signature !== 0x04034b50) break;

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const filenameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);

    const filenameStart = offset + 30;
    const filename = buffer.toString("utf-8", filenameStart, filenameStart + filenameLength);

    const dataStart = filenameStart + filenameLength + extraLength;
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);

    // Skip directories
    if (!filename.endsWith("/") && compressedSize > 0) {
      let fileData: Buffer;

      if (compressionMethod === 0) {
        // Stored (no compression)
        fileData = Buffer.from(compressedData);
      } else if (compressionMethod === 8) {
        // Deflate
        fileData = zlib.inflateRawSync(compressedData);
      } else {
        // Unsupported compression — skip
        offset = dataStart + compressedSize;
        continue;
      }

      entries.push({ filename, data: fileData });
    }

    offset = dataStart + compressedSize;
  }

  return entries;
}
