import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";

import { parseEmlBuffer, parseMboxStream } from "../parser";
import type { ParsedEmail } from "../types";

const FIXTURE_DIR = path.join(__dirname, "fixtures");

describe("parseMboxStream (Gmail-Takeout fixture)", () => {
  let collected: Array<{ kind: "email" | "skipped"; email?: ParsedEmail }> = [];
  let emails: ParsedEmail[] = [];

  beforeAll(async () => {
    const buf = await readFile(path.join(FIXTURE_DIR, "gmail-takeout.mbox"));
    collected = [];
    for await (const item of parseMboxStream(buf)) {
      collected.push({ kind: item.kind, email: item.kind === "email" ? item.email : undefined });
    }
    emails = collected
      .filter((c): c is { kind: "email"; email: ParsedEmail } => c.kind === "email")
      .map((c) => c.email);
  });

  it("yields all 10 emails from the Gmail Takeout mbox", () => {
    expect(emails).toHaveLength(10);
  });

  it("extracts the Pflicht-Headers on the first email", () => {
    const [first] = emails;
    expect(first.messageId).toBe("<CABx7p9Q+abc1@mail.gmail.com>");
    expect(first.messageIdSynthesized).toBe(false);
    expect(first.inReplyTo).toBeNull();
    expect(first.referencesArray).toEqual([]);
    expect(first.fromAddress).toBe("founder@example.com");
    expect(first.toAddresses).toEqual(["alice@acme-corp.test"]);
    expect(first.subject).toBe("Q1 partnership outreach");
    expect(first.date?.toISOString()).toBe("2024-01-15T09:30:00.000Z");
    expect(first.bodyText).toContain("Q1 partnership opportunity");
    expect(first.hasAttachments).toBe(false);
  });

  it("preserves In-Reply-To and References on a reply (email 2)", () => {
    const reply = emails[1];
    expect(reply.inReplyTo).toBe("<CABx7p9Q+abc1@mail.gmail.com>");
    expect(reply.referencesArray).toEqual(["<CABx7p9Q+abc1@mail.gmail.com>"]);
    expect(reply.ccAddresses).toEqual(["legal@acme-corp.test"]);
  });

  it("preserves a multi-id References chain (email 3)", () => {
    const third = emails[2];
    expect(third.referencesArray).toEqual([
      "<CABx7p9Q+abc1@mail.gmail.com>",
      "<reply-q1-001@acme-corp.test>",
    ]);
  });

  it("detects attachments on the message with a pdf (email 3)", () => {
    const third = emails[2];
    expect(third.hasAttachments).toBe(true);
    expect(third.attachmentMetadata).toHaveLength(1);
    expect(third.attachmentMetadata[0].filename).toBe("onepager.pdf");
    expect(third.attachmentMetadata[0].contentType).toBe("application/pdf");
  });

  it("captures HTML body for HTML-only newsletters (email 4)", () => {
    const newsletter = emails[3];
    expect(newsletter.bodyHtml).toMatch(/<h1>Weekly Roundup<\/h1>/);
  });

  it("captures multiple To: and Cc: recipients (email 5)", () => {
    const pilotProposal = emails[4];
    expect(pilotProposal.toAddresses).toEqual([
      "bob@beta-llc.test",
      "carol@beta-llc.test",
    ]);
    expect(pilotProposal.ccAddresses).toEqual(["founder-bcc@example.com"]);
  });

  it("synthesizes a deterministic Message-ID when the header is missing (email 9)", () => {
    const noId = emails.find((e) => e.subject === "No Message-ID test");
    expect(noId).toBeDefined();
    expect(noId!.messageIdSynthesized).toBe(true);
    expect(noId!.messageId).toMatch(/^<[a-f0-9]{16}@synthesized\.bulk-email\.local>$/);
  });

  it("produces stable synthesized Message-IDs across runs", async () => {
    const buf = await readFile(path.join(FIXTURE_DIR, "gmail-takeout.mbox"));
    const second: string[] = [];
    for await (const item of parseMboxStream(buf)) {
      if (item.kind === "email") second.push(item.email.messageId);
    }
    expect(second).toEqual(emails.map((e) => e.messageId));
  });
});

describe("parseEmlBuffer (Outlook .eml fixture)", () => {
  it("parses an Outlook-flavoured base64+CRLF .eml", async () => {
    const buf = await readFile(path.join(FIXTURE_DIR, "outlook-single.eml"));
    const email = await parseEmlBuffer(buf);

    expect(email.messageId).toBe("<01010-EX-MBX-01-contoso-001@contoso.test>");
    expect(email.messageIdSynthesized).toBe(false);
    expect(email.fromAddress).toBe("klaus.schmidt@contoso.test");
    expect(email.toAddresses).toEqual(["founder@example.com"]);
    // RFC-2047 encoded subject must be decoded back to UTF-8.
    expect(email.subject).toContain("Ausschreibung");
    expect(email.subject).toContain("München");
    expect(email.date?.toISOString()).toBe("2024-02-12T14:30:00.000Z");
    // Base64 body must be decoded to plaintext.
    expect(email.bodyText).toContain("Grüß Founder");
  });
});

describe("parseMboxStream (defekt-encoding fixture)", () => {
  // Contract: the iterator must never throw on malformed content; degraded
  // emails are still yielded as `kind: "email"` with synthesized Message-IDs
  // and empty fields where headers were unrecoverable. mailparser is very
  // permissive — it almost never throws on garbage. Hard parse failures
  // would be surfaced as `kind: "skipped"`.
  it("survives binary garbage and truncated MIME without crashing", async () => {
    const buf = await readFile(path.join(FIXTURE_DIR, "defekt-encoding.mbox"));
    const items: Array<{ kind: "email" | "skipped" }> = [];
    let validParsed: ParsedEmail | null = null;

    for await (const item of parseMboxStream(buf)) {
      items.push({ kind: item.kind });
      if (item.kind === "email" && item.email.messageId === "<valid-mar-001@example.test>") {
        validParsed = item.email;
      }
    }

    // Three envelopes: one valid + two malformed. All complete without throw.
    expect(items).toHaveLength(3);
    // The valid email survives intact even when garbage envelopes follow.
    expect(validParsed).not.toBeNull();
    expect(validParsed!.fromAddress).toBe("sender@example.test");
    expect(validParsed!.subject).toBe("Valid email before broken one");
  });

  it("synthesizes Message-IDs for headerless garbage chunks", async () => {
    const buf = await readFile(path.join(FIXTURE_DIR, "defekt-encoding.mbox"));
    const synthesized: string[] = [];
    for await (const item of parseMboxStream(buf)) {
      if (item.kind === "email" && item.email.messageIdSynthesized) {
        synthesized.push(item.email.messageId);
      }
    }
    // At least the binary-garbage chunk has no parseable Message-ID, so
    // the parser must synthesize one rather than leave it empty/null.
    expect(synthesized.length).toBeGreaterThanOrEqual(1);
    for (const id of synthesized) {
      expect(id).toMatch(/^<[a-f0-9]{16}@synthesized\.bulk-email\.local>$/);
    }
  });
});
