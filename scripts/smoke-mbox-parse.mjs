#!/usr/bin/env node
// MT-1b smoke script for SLC-165: validates mailparser^3.7.0 lib install + Pflicht-Header-Extraktion.
// Usage: node scripts/smoke-mbox-parse.mjs <path/to/test.mbox>
// Exit 0 if first 10 emails parsed with non-null message_id; exit 1 otherwise.

import { readFile } from "node:fs/promises";
import { simpleParser } from "mailparser";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/smoke-mbox-parse.mjs <path/to/test.mbox>");
  process.exit(1);
}

const raw = await readFile(file, "utf8");

// Split on mbox-O boundary: lines starting with "From " (with trailing space).
const chunks = raw.split(/^(?=From )/m).filter((c) => c.trim().length > 0);

if (chunks.length === 0) {
  console.error(`FAIL: no mbox chunks found in ${file}`);
  process.exit(1);
}

const parsed = [];
const errors = [];

for (let i = 0; i < Math.min(chunks.length, 10); i++) {
  const chunk = chunks[i];
  // Strip the "From " envelope line (not RFC 5322 header).
  const body = chunk.replace(/^From [^\n]*\n/, "");
  try {
    const mail = await simpleParser(body);
    parsed.push({
      idx: i,
      messageId: mail.messageId || null,
      inReplyTo: mail.inReplyTo || null,
      references: mail.references || null,
      subject: mail.subject || null,
      from: mail.from?.text || null,
      date: mail.date?.toISOString() || null,
    });
  } catch (err) {
    errors.push({ idx: i, message: err.message });
  }
}

console.log(JSON.stringify(parsed, null, 2));

if (errors.length > 0) {
  console.error(`\nParse errors:`, errors);
}

const missingMessageId = parsed.filter((p) => !p.messageId);
const allValid = parsed.length >= 10 && missingMessageId.length === 0;

if (!allValid) {
  console.error(
    `\nFAIL: parsed=${parsed.length}, missing message_id in ${missingMessageId.length} email(s), errors=${errors.length}`,
  );
  process.exit(1);
}

console.log(`\nPASS: parsed ${parsed.length} emails, all message_id present, ${errors.length} parse errors.`);
process.exit(0);
