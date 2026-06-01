// SLC-165 MT-3: shared TypeScript interfaces for the V9 bulk-email pipeline.
// Source-of-truth for Pflicht-Headers persisted into email_message
// (MIG-051 schema, see slices/SLC-165-v9-foundation-upload.md).

/**
 * Structured representation of a single parsed RFC-5322 email,
 * normalized to the columns of the `email_message` table.
 *
 * Fields map 1:1 to email_message columns introduced by MIG-051.
 * Missing headers are normalized to `null` (not `undefined`) so that the
 * caller can INSERT directly without per-field guards.
 */
export interface ParsedEmail {
  /** RFC-5322 Message-ID. Synthesized from from+date+content-hash if absent. */
  messageId: string;
  /** Whether `messageId` was synthesized (true) or read from the header (false). */
  messageIdSynthesized: boolean;
  /** In-Reply-To Message-ID, or null. */
  inReplyTo: string | null;
  /** Ordered References chain (oldest → newest). Empty array if absent. */
  referencesArray: string[];
  /** First-RFC-5322 From address (lowercased, no display name). Null if unparseable. */
  fromAddress: string | null;
  /** All To: addresses (lowercased). Empty array if absent. */
  toAddresses: string[];
  /** All Cc: addresses (lowercased). Empty array if absent. */
  ccAddresses: string[];
  /** Subject line (raw decoded). Empty string if absent. */
  subject: string;
  /** RFC-5322 Date as Date object. Null if header missing or unparseable. */
  date: Date | null;
  /** Plaintext body. Empty string if absent (never null). */
  bodyText: string;
  /** HTML body if present, else null. */
  bodyHtml: string | null;
  /** True if the message has at least one attachment. */
  hasAttachments: boolean;
  /**
   * Per-attachment metadata (no content). Empty array if no attachments.
   * Stored as JSONB in email_message.attachment_metadata.
   */
  attachmentMetadata: AttachmentMetadata[];
}

/** Attachment metadata persisted as JSONB. Inhalts-Bytes werden in V9.0 NICHT gespeichert. */
export interface AttachmentMetadata {
  filename: string | null;
  contentType: string | null;
  size: number | null;
}

/**
 * Soft-Error returned by the parser for emails that could not be parsed at all
 * (e.g., binary garbage, truncated mid-MIME, encoding crash). The mbox iterator
 * skips these emails and yields a SkippedEmail entry so the worker can record
 * the skip without aborting the whole bulk run.
 */
export interface SkippedEmail {
  /** Zero-based index inside the mbox chunk stream. */
  chunkIndex: number;
  /** Lower-cased mailparser error class or "unknown". */
  reason: string;
  /** Truncated error message for diagnostics (max 200 chars). */
  message: string;
}

/** Union yielded by parseMboxStream. Caller dispatches on `kind`. */
export type MboxIteratorItem =
  | { kind: "email"; email: ParsedEmail }
  | { kind: "skipped"; skipped: SkippedEmail };
