// SLC-165 MT-3: mailparser-Wrapper. Pure functions, no DB / no Storage / no LLM.
//
// Exposes two entry points:
//   - parseMboxStream(input): async iterator over mbox emails (Gmail-Takeout-Format)
//   - parseEmlBuffer(buffer): single .eml buffer → ParsedEmail
//
// Mbox-Splitting follows the same heuristic as scripts/smoke-mbox-parse.mjs
// (RPT-378): split on "^From " envelope lines, strip envelope, hand each
// chunk to simpleParser. Defekt-Encoding/truncated emails are reported as
// SkippedEmail entries instead of crashing the iterator.

import { createHash } from "node:crypto";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

import type {
  AttachmentMetadata,
  MboxIteratorItem,
  ParsedEmail,
  SkippedEmail,
} from "./types";

export type MboxInput = Buffer | string;

/**
 * Iterate over the messages of an mbox (Gmail Takeout / standard mbox-O) file.
 *
 * Yields one `MboxIteratorItem` per envelope:
 *   - `{ kind: "email", email }` for successfully parsed messages
 *   - `{ kind: "skipped", skipped }` for messages mailparser rejected
 *
 * The iterator never throws on per-email errors; only invalid `input` types
 * fail synchronously.
 */
export async function* parseMboxStream(
  input: MboxInput,
): AsyncIterableIterator<MboxIteratorItem> {
  const raw = typeof input === "string" ? input : input.toString("utf8");
  const chunks = splitMboxChunks(raw);

  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    try {
      const mail = await simpleParser(chunk);
      yield { kind: "email", email: normalizeParsedMail(mail, chunk) };
    } catch (err) {
      yield {
        kind: "skipped",
        skipped: buildSkipped(idx, err),
      };
    }
  }
}

/**
 * Parse a single .eml message buffer into a ParsedEmail.
 *
 * Errors propagate (no soft-skip) — the caller decides whether a single-file
 * upload should fail the whole bulk_run. For .mbox inputs use `parseMboxStream`.
 */
export async function parseEmlBuffer(buffer: Buffer): Promise<ParsedEmail> {
  const mail = await simpleParser(buffer);
  return normalizeParsedMail(mail, buffer.toString("utf8"));
}

// ──────────────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Split mbox content on `^From ` envelope lines (mbox-O variant).
 *
 * Matches the smoke script (scripts/smoke-mbox-parse.mjs). Trailing whitespace
 * chunks are dropped. The envelope line itself is stripped from the returned
 * chunk because it is not an RFC-5322 header and confuses simpleParser.
 */
function splitMboxChunks(raw: string): string[] {
  const chunks = raw.split(/^(?=From )/m).filter((c) => c.trim().length > 0);
  return chunks.map((c) => c.replace(/^From [^\n]*\n/, ""));
}

function normalizeParsedMail(mail: ParsedMail, rawChunk: string): ParsedEmail {
  const fromAddress = extractFirstAddress(mail.from);
  const date = mail.date ?? null;
  const subject = mail.subject ?? "";

  const messageId = mail.messageId?.trim();
  const synthesized = !messageId;
  const finalMessageId = messageId
    ? messageId
    : synthesizeMessageId(fromAddress, date, rawChunk);

  return {
    messageId: finalMessageId,
    messageIdSynthesized: synthesized,
    inReplyTo: mail.inReplyTo?.trim() ?? null,
    referencesArray: normalizeReferences(mail.references),
    fromAddress,
    toAddresses: extractAllAddresses(mail.to),
    ccAddresses: extractAllAddresses(mail.cc),
    subject,
    date,
    bodyText: mail.text ?? "",
    bodyHtml: typeof mail.html === "string" ? mail.html : null,
    hasAttachments: (mail.attachments?.length ?? 0) > 0,
    attachmentMetadata: extractAttachmentMetadata(mail),
  };
}

function normalizeReferences(
  refs: string | string[] | undefined,
): string[] {
  if (!refs) return [];
  if (Array.isArray(refs)) {
    return refs.map((r) => r.trim()).filter((r) => r.length > 0);
  }
  // Single Message-ID, or whitespace-separated list packed into one string.
  return refs
    .split(/\s+/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

function extractFirstAddress(
  addr: AddressObject | AddressObject[] | undefined,
): string | null {
  const list = toAddressList(addr);
  for (const a of list) {
    if (a.address) return a.address.toLowerCase();
  }
  return null;
}

function extractAllAddresses(
  addr: AddressObject | AddressObject[] | undefined,
): string[] {
  return toAddressList(addr)
    .map((a) => a.address?.toLowerCase())
    .filter((s): s is string => Boolean(s));
}

function toAddressList(
  addr: AddressObject | AddressObject[] | undefined,
): { address?: string }[] {
  if (!addr) return [];
  const objs = Array.isArray(addr) ? addr : [addr];
  const flat: { address?: string }[] = [];
  for (const obj of objs) {
    if (!obj?.value) continue;
    for (const item of obj.value) {
      // Address-Groups (RFC-5322 group syntax) flatten one level.
      if (item.group && item.group.length > 0) {
        for (const g of item.group) flat.push({ address: g.address });
      } else if (item.address) {
        flat.push({ address: item.address });
      }
    }
  }
  return flat;
}

function extractAttachmentMetadata(mail: ParsedMail): AttachmentMetadata[] {
  if (!mail.attachments || mail.attachments.length === 0) return [];
  return mail.attachments.map((a) => ({
    filename: a.filename ?? null,
    contentType: a.contentType ?? null,
    size: typeof a.size === "number" ? a.size : null,
  }));
}

/**
 * Synthesize a deterministic Message-ID when the source has none.
 *
 * Format: `<sha256-16chars@synthesized.bulk-email.local>`. The hash is
 * computed over from+date+raw-chunk so identical re-uploads produce identical
 * synthesized IDs (idempotency for SLC-165 MT-5 worker re-tries).
 */
function synthesizeMessageId(
  from: string | null,
  date: Date | null,
  rawChunk: string,
): string {
  const seed = [from ?? "no-from", date?.toISOString() ?? "no-date", rawChunk].join("\n");
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return `<${hash}@synthesized.bulk-email.local>`;
}

function buildSkipped(idx: number, err: unknown): SkippedEmail {
  const reason = errorName(err);
  const message = errorMessage(err).slice(0, 200);
  return { chunkIndex: idx, reason, message };
}

function errorName(err: unknown): string {
  if (err instanceof Error && err.name) return err.name.toLowerCase();
  return "unknown";
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown error";
}
