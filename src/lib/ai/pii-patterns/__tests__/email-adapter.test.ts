// V9 SLC-166 MT-5 — Vitest fuer Email-Adapter (PII-Pipeline-Wrapper).
//
// Coverage gemaess Spec L159-163:
//   1. Standard-Email mit "--\nMax Mustermann\nGF\nmuster@firma.de" → Signatur entfernt
//   2. Multi-Reply-Thread: P1=Kunde, P2=GF konsistent ueber alle 5 Emails
//   3. Forward-Chain: Pseudonyme bleiben konsistent ueber Hop-Boundaries
//   4. V5-Bedrock-Mock-Call returnt redacted text mit Pseudonymen statt Klarnamen
//
// Plus:
//   - normalizeEmail (lowercase + trim + angle-bracket-strip + null-safe)
//   - extractParticipantMap (single-email, multi-mail, GF-Priority via tenantDomain)
//   - stripSignature (RFC-3676 "--", DE/EN-Phrases, empty/null, idempotent)
//   - replaceParticipantsInBody (single-mail, multi-mail, case-insensitive, no-op
//     bei leerer Map, laengere Adressen vor kuerzeren)
//   - buildEmailRedactSystemPrompt (V5-Patterns vorhanden + Participant-Liste angehaengt)
//   - buildEmailRedactUserMessage (Konkatenation + Headers-Pseudonymisiert)
//   - redactEmailThread (Orchestrierung + chatCaller-DI + Empty-Response-Throw +
//     Token-Heuristik + Filter auf thread.message_ids)

import { describe, it, expect, vi } from "vitest";

import {
  __testing,
  buildEmailRedactSystemPrompt,
  buildEmailRedactUserMessage,
  extractParticipantMap,
  redactEmailThread,
  replaceParticipantsInBody,
  stripSignature,
  type EmailForRedaction,
  type ParticipantMap,
  type RedactEmailThreadOptions,
} from "../email-adapter";

import type { EmailThread } from "@/lib/bulk-email/thread-aggregation";

function mkEmail(
  partial: Partial<EmailForRedaction> & Pick<EmailForRedaction, "message_id">,
): EmailForRedaction {
  return {
    from_address: null,
    to_addresses: null,
    cc_addresses: null,
    subject: null,
    date: null,
    body_text: null,
    ...partial,
  };
}

function mkThread(message_ids: string[], rootIdx = 0): EmailThread {
  return {
    root_message_id: message_ids[rootIdx]!,
    subject: "Test Thread",
    email_count: message_ids.length,
    first_date: null,
    last_date: null,
    message_ids,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// normalizeEmail (internal)
// ──────────────────────────────────────────────────────────────────────────────

describe("normalizeEmail (internal)", () => {
  const { normalizeEmail } = __testing;
  it("lowercases + trims a plain address", () => {
    expect(normalizeEmail("  Max@FIRMA.de  ")).toBe("max@firma.de");
  });
  it("strips angle brackets", () => {
    expect(normalizeEmail("<Foo@Bar.de>")).toBe("foo@bar.de");
  });
  it("returns null for null/empty", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// stripSignature
// ──────────────────────────────────────────────────────────────────────────────

describe("stripSignature", () => {
  it("removes RFC-3676 '-- ' delimiter block + 3 lines", () => {
    const body = [
      "Hallo,",
      "vielen Dank fuer dein Angebot.",
      "",
      "--",
      "Max Mustermann",
      "Geschaeftsfuehrer",
      "muster@firma.de",
      "Diese-Zeile-bleibt", // Zeile 5 nach Trigger → behalten? Nein: nur 3 dropped
    ].join("\n");
    const result = stripSignature(body);
    expect(result).toContain("Hallo,");
    expect(result).toContain("vielen Dank");
    expect(result).not.toContain("Max Mustermann");
    expect(result).not.toContain("Geschaeftsfuehrer");
    expect(result).not.toContain("muster@firma.de");
    expect(result).toContain("Diese-Zeile-bleibt"); // 4. Zeile nach Trigger
  });

  it("removes 'Mit freundlichen Gruessen' + 3 lines (Spec L156)", () => {
    const body = [
      "Hallo,",
      "anbei der Vorschlag.",
      "",
      "Mit freundlichen Gruessen",
      "Anna Schmidt",
      "Vertriebsleitung",
      "+49 30 12345",
    ].join("\n");
    const result = stripSignature(body);
    expect(result).toContain("anbei der Vorschlag");
    expect(result).not.toContain("Anna Schmidt");
    expect(result).not.toContain("Vertriebsleitung");
    expect(result).not.toContain("+49 30 12345");
  });

  it("removes 'Best regards' + 3 lines", () => {
    const body = [
      "Body content",
      "",
      "Best regards",
      "Jane",
      "CFO",
      "jane@example.com",
    ].join("\n");
    const result = stripSignature(body);
    expect(result).toContain("Body content");
    expect(result).not.toContain("Jane");
  });

  it("returns empty string for null/empty input", () => {
    expect(stripSignature(null)).toBe("");
    expect(stripSignature("")).toBe("");
    expect(stripSignature("   ")).toBe("");
  });

  it("returns unchanged body when no trigger present", () => {
    const body = "Nur normaler Text ohne Signatur.";
    expect(stripSignature(body)).toBe(body);
  });

  it("is idempotent — second pass changes nothing", () => {
    const body = [
      "Hallo",
      "--",
      "Sig-Line 1",
      "Sig-Line 2",
      "Sig-Line 3",
    ].join("\n");
    const once = stripSignature(body);
    const twice = stripSignature(once);
    expect(once).toBe(twice);
  });

  it("recognizes Viele Gruesse / Beste Gruesse / Kind regards / Regards", () => {
    expect(stripSignature("Body\n\nViele Gruesse\nA\nB\nC")).not.toContain("A");
    expect(stripSignature("Body\n\nBeste Gruesse\nA\nB\nC")).not.toContain("A");
    expect(stripSignature("Body\n\nKind regards\nA\nB\nC")).not.toContain("A");
    expect(stripSignature("Body\n\nRegards\nA\nB\nC")).not.toContain("A");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// extractParticipantMap
// ──────────────────────────────────────────────────────────────────────────────

describe("extractParticipantMap", () => {
  it("returns empty map for empty input", () => {
    const map = extractParticipantMap([]);
    expect(map.byEmail.size).toBe(0);
    expect(map.pseudonymOrder).toEqual([]);
  });

  it("assigns P1 to single from-only email", () => {
    const map = extractParticipantMap([
      mkEmail({ message_id: "a", from_address: "alice@example.com" }),
    ]);
    expect(map.byEmail.get("alice@example.com")).toBe("P1");
    expect(map.pseudonymOrder).toEqual(["P1"]);
  });

  it("assigns P1/P2/P3 in first-seen order across from+to+cc", () => {
    const map = extractParticipantMap([
      mkEmail({
        message_id: "a",
        from_address: "alice@example.com",
        to_addresses: ["bob@example.com"],
      }),
      mkEmail({
        message_id: "b",
        from_address: "bob@example.com",
        to_addresses: ["alice@example.com", "charlie@example.com"],
      }),
    ]);
    expect(map.byEmail.get("alice@example.com")).toBe("P1");
    expect(map.byEmail.get("bob@example.com")).toBe("P2");
    expect(map.byEmail.get("charlie@example.com")).toBe("P3");
  });

  it("Spec-Case Multi-Reply: P1=Kunde, P2=GF konsistent ueber 5 Emails (ohne tenantDomain)", () => {
    const emails: EmailForRedaction[] = [
      mkEmail({ message_id: "1", from_address: "kunde@kunde.de", to_addresses: ["gf@firma.de"] }),
      mkEmail({ message_id: "2", from_address: "gf@firma.de", to_addresses: ["kunde@kunde.de"] }),
      mkEmail({ message_id: "3", from_address: "kunde@kunde.de", to_addresses: ["gf@firma.de"] }),
      mkEmail({ message_id: "4", from_address: "gf@firma.de", to_addresses: ["kunde@kunde.de"] }),
      mkEmail({ message_id: "5", from_address: "kunde@kunde.de", to_addresses: ["gf@firma.de"] }),
    ];
    const map = extractParticipantMap(emails);
    expect(map.byEmail.get("kunde@kunde.de")).toBe("P1");
    expect(map.byEmail.get("gf@firma.de")).toBe("P2");
  });

  it("GF-Priority via tenantDomain: P1=GF wenn @firma.de matched", () => {
    const emails: EmailForRedaction[] = [
      mkEmail({ message_id: "1", from_address: "kunde@kunde.de", to_addresses: ["gf@firma.de"] }),
      mkEmail({ message_id: "2", from_address: "gf@firma.de", to_addresses: ["kunde@kunde.de"] }),
    ];
    const map = extractParticipantMap(emails, "firma.de");
    expect(map.byEmail.get("gf@firma.de")).toBe("P1");
    expect(map.byEmail.get("kunde@kunde.de")).toBe("P2");
  });

  it("Mehrere GF-Adressen kommen vor externen, in first-seen-Order untereinander", () => {
    const emails: EmailForRedaction[] = [
      mkEmail({ message_id: "1", from_address: "alice@firma.de", to_addresses: ["extern@kunde.de"] }),
      mkEmail({
        message_id: "2",
        from_address: "extern@kunde.de",
        to_addresses: ["alice@firma.de", "bob@firma.de"],
      }),
    ];
    const map = extractParticipantMap(emails, "firma.de");
    expect(map.byEmail.get("alice@firma.de")).toBe("P1");
    expect(map.byEmail.get("bob@firma.de")).toBe("P2");
    expect(map.byEmail.get("extern@kunde.de")).toBe("P3");
  });

  it("Case-insensitive: 'Alice@Example.com' und 'alice@example.com' kollabieren auf P1", () => {
    const emails: EmailForRedaction[] = [
      mkEmail({ message_id: "1", from_address: "Alice@Example.com" }),
      mkEmail({ message_id: "2", from_address: "alice@example.com" }),
    ];
    const map = extractParticipantMap(emails);
    expect(map.byEmail.size).toBe(1);
    expect(map.byEmail.get("alice@example.com")).toBe("P1");
  });

  it("Null/empty addresses werden ignoriert", () => {
    const emails: EmailForRedaction[] = [
      mkEmail({
        message_id: "1",
        from_address: null,
        to_addresses: ["", "  ", "valid@example.com"],
        cc_addresses: null,
      }),
    ];
    const map = extractParticipantMap(emails);
    expect(map.byEmail.size).toBe(1);
    expect(map.byEmail.get("valid@example.com")).toBe("P1");
  });

  it("Angle-Bracket-Form '<addr>' wird normalisiert", () => {
    const emails: EmailForRedaction[] = [
      mkEmail({
        message_id: "1",
        from_address: "<Foo@Bar.de>",
      }),
    ];
    const map = extractParticipantMap(emails);
    expect(map.byEmail.get("foo@bar.de")).toBe("P1");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// replaceParticipantsInBody
// ──────────────────────────────────────────────────────────────────────────────

describe("replaceParticipantsInBody", () => {
  it("returns body unchanged when map is empty", () => {
    const map: ParticipantMap = { byEmail: new Map(), pseudonymOrder: [] };
    expect(replaceParticipantsInBody("Hello world", map)).toBe("Hello world");
  });

  it("replaces single email-address by pseudonym", () => {
    const map = extractParticipantMap([
      mkEmail({ message_id: "1", from_address: "alice@example.com" }),
    ]);
    expect(replaceParticipantsInBody("Schreibt mir an alice@example.com.", map)).toBe(
      "Schreibt mir an P1.",
    );
  });

  it("replaces multiple email-addresses case-insensitively", () => {
    const map = extractParticipantMap([
      mkEmail({
        message_id: "1",
        from_address: "alice@example.com",
        to_addresses: ["bob@example.com"],
      }),
    ]);
    const body = "Anruf bei ALICE@example.com mit Cc an Bob@Example.com.";
    expect(replaceParticipantsInBody(body, map)).toBe("Anruf bei P1 mit Cc an P2.");
  });

  it("preserves text without participant-emails", () => {
    const map = extractParticipantMap([
      mkEmail({ message_id: "1", from_address: "alice@example.com" }),
    ]);
    expect(replaceParticipantsInBody("Kein Mail-Match hier.", map)).toBe(
      "Kein Mail-Match hier.",
    );
  });

  it("returns empty body unchanged when map has entries", () => {
    const map = extractParticipantMap([
      mkEmail({ message_id: "1", from_address: "alice@example.com" }),
    ]);
    expect(replaceParticipantsInBody("", map)).toBe("");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildEmailRedactSystemPrompt
// ──────────────────────────────────────────────────────────────────────────────

describe("buildEmailRedactSystemPrompt", () => {
  it("contains V5-Pattern-Liste (z.B. KUNDENNAME + TELEFON-Kategorie)", () => {
    const map = extractParticipantMap([
      mkEmail({ message_id: "1", from_address: "alice@example.com" }),
    ]);
    const prompt = buildEmailRedactSystemPrompt(map);
    expect(prompt).toContain("KUNDENNAME");
    expect(prompt).toContain("TELEFON");
    expect(prompt).toContain("PREIS_BETRAG");
  });

  it("contains V5-Output-Format-Regel (Antworte AUSSCHLIESSLICH mit redacted-Text)", () => {
    const map = extractParticipantMap([]);
    const prompt = buildEmailRedactSystemPrompt(map);
    expect(prompt).toContain("AUSSCHLIESSLICH");
  });

  it("appends Participant-Liste mit P1/P2/...", () => {
    const map = extractParticipantMap([
      mkEmail({
        message_id: "1",
        from_address: "alice@example.com",
        to_addresses: ["bob@example.com"],
      }),
    ]);
    const prompt = buildEmailRedactSystemPrompt(map);
    expect(prompt).toContain("PARTICIPANT-LISTE");
    expect(prompt).toContain("P1: alice@example.com");
    expect(prompt).toContain("P2: bob@example.com");
  });

  it("contains Email-spezifischen Hint (Regeln 8 + 9)", () => {
    const map = extractParticipantMap([]);
    const prompt = buildEmailRedactSystemPrompt(map);
    expect(prompt).toMatch(/8\..*Pseudonyme/);
    expect(prompt).toMatch(/9\..*Klarnamen/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildEmailRedactUserMessage
// ──────────────────────────────────────────────────────────────────────────────

describe("buildEmailRedactUserMessage", () => {
  it("concatenates emails with === Email N === separator", () => {
    const emails: EmailForRedaction[] = [
      mkEmail({
        message_id: "1",
        from_address: "alice@example.com",
        to_addresses: ["bob@example.com"],
        date: "2026-06-01T10:00:00Z",
        body_text: "Hallo Bob,\n\nBitte um Rueckmeldung.",
      }),
      mkEmail({
        message_id: "2",
        from_address: "bob@example.com",
        to_addresses: ["alice@example.com"],
        date: "2026-06-01T11:00:00Z",
        body_text: "Klar, melde mich gleich.",
      }),
    ];
    const map = extractParticipantMap(emails);
    const msg = buildEmailRedactUserMessage(emails, map);
    expect(msg).toContain("=== Email 1 ===");
    expect(msg).toContain("=== Email 2 ===");
    expect(msg).toContain("From: P1");
    expect(msg).toContain("To: P2");
    expect(msg).toContain("Date: 2026-06-01T10:00:00Z");
  });

  it("strippt Signaturen vor Pseudonym-Replace", () => {
    const emails: EmailForRedaction[] = [
      mkEmail({
        message_id: "1",
        from_address: "alice@example.com",
        body_text: "Hallo,\n\nDanke.\n\n--\nAlice\nGF\nalice@example.com",
      }),
    ];
    const map = extractParticipantMap(emails);
    const msg = buildEmailRedactUserMessage(emails, map);
    expect(msg).toContain("Danke.");
    expect(msg).not.toContain("Alice\nGF");
  });

  it("ersetzt Email-Adressen im Body durch Pseudonyme", () => {
    const emails: EmailForRedaction[] = [
      mkEmail({
        message_id: "1",
        from_address: "alice@example.com",
        body_text: "Schreibt an alice@example.com fuer Details.",
      }),
    ];
    const map = extractParticipantMap(emails);
    const msg = buildEmailRedactUserMessage(emails, map);
    expect(msg).toContain("Schreibt an P1");
    expect(msg).not.toContain("alice@example.com\n");
  });

  it("Date-NULL → 'Date: (unbekannt)'", () => {
    const emails: EmailForRedaction[] = [
      mkEmail({
        message_id: "1",
        from_address: "alice@example.com",
        date: null,
      }),
    ];
    const map = extractParticipantMap(emails);
    const msg = buildEmailRedactUserMessage(emails, map);
    expect(msg).toContain("Date: (unbekannt)");
  });

  it("Empty To-Liste → 'To: (keine)'", () => {
    const emails: EmailForRedaction[] = [
      mkEmail({
        message_id: "1",
        from_address: "alice@example.com",
        to_addresses: [],
      }),
    ];
    const map = extractParticipantMap(emails);
    const msg = buildEmailRedactUserMessage(emails, map);
    expect(msg).toContain("To: (keine)");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// redactEmailThread (Orchestrator)
// ──────────────────────────────────────────────────────────────────────────────

describe("redactEmailThread", () => {
  function mockCaller(returnText: string) {
    return vi.fn(async () => returnText);
  }

  it("ruft chatCaller mit V5-System-Prompt + concatenated body", async () => {
    const emails: EmailForRedaction[] = [
      mkEmail({
        message_id: "m1",
        from_address: "alice@example.com",
        to_addresses: ["bob@example.com"],
        body_text: "Hallo Bob.",
      }),
    ];
    const thread = mkThread(["m1"]);
    const caller = mockCaller("Redacted: Hallo P2.");
    const result = await redactEmailThread(thread, emails, {
      chatCaller: caller as unknown as RedactEmailThreadOptions["chatCaller"],
    });

    expect(caller).toHaveBeenCalledTimes(1);
    const call = (caller.mock.calls as unknown as Array<[Array<{role: string; content: string}>, {temperature: number; maxTokens: number}]>)[0]!;
    const messages = call[0];
    const opts = call[1];
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe("system");
    expect(messages[1]!.role).toBe("user");
    expect(opts).toEqual({ temperature: 0, maxTokens: 8000 });

    expect(result.redactedBody).toBe("Redacted: Hallo P2.");
    expect(result.participantMap.byEmail.get("alice@example.com")).toBe("P1");
    expect(result.participantMap.byEmail.get("bob@example.com")).toBe("P2");
    expect(result.estimatedInputTokens).toBeGreaterThan(0);
    expect(result.estimatedOutputTokens).toBeGreaterThan(0);
    expect(result.callDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("Spec-Case Multi-Reply 5 Emails: P1+P2 konsistent ueber alle, 1 chatCall", async () => {
    const emails: EmailForRedaction[] = [
      mkEmail({ message_id: "1", from_address: "kunde@kunde.de", to_addresses: ["gf@firma.de"], body_text: "Frage 1." }),
      mkEmail({ message_id: "2", from_address: "gf@firma.de", to_addresses: ["kunde@kunde.de"], body_text: "Antwort 1." }),
      mkEmail({ message_id: "3", from_address: "kunde@kunde.de", to_addresses: ["gf@firma.de"], body_text: "Frage 2." }),
      mkEmail({ message_id: "4", from_address: "gf@firma.de", to_addresses: ["kunde@kunde.de"], body_text: "Antwort 2." }),
      mkEmail({ message_id: "5", from_address: "kunde@kunde.de", to_addresses: ["gf@firma.de"], body_text: "Frage 3." }),
    ];
    const thread = mkThread(["1", "2", "3", "4", "5"]);
    let capturedSystemPrompt = "";
    const caller = vi.fn(async (messages: Array<{role: string; content: string}>) => {
      capturedSystemPrompt = messages[0]!.content;
      return "Mock-Redacted Body";
    });
    const result = await redactEmailThread(thread, emails, {
      tenantDomain: "firma.de",
      chatCaller: caller as unknown as RedactEmailThreadOptions["chatCaller"],
    });

    expect(caller).toHaveBeenCalledTimes(1);
    expect(result.participantMap.byEmail.get("gf@firma.de")).toBe("P1");
    expect(result.participantMap.byEmail.get("kunde@kunde.de")).toBe("P2");
    expect(capturedSystemPrompt).toContain("P1: gf@firma.de");
    expect(capturedSystemPrompt).toContain("P2: kunde@kunde.de");
  });

  it("Spec-Case Forward-Chain: Pseudonyme konsistent ueber 3 Emails", async () => {
    const emails: EmailForRedaction[] = [
      mkEmail({
        message_id: "orig",
        from_address: "external@partner.de",
        to_addresses: ["gf@firma.de"],
        body_text: "Original-Anfrage.",
      }),
      mkEmail({
        message_id: "fwd",
        from_address: "gf@firma.de",
        to_addresses: ["colleague@firma.de"],
        body_text: "FYI: ---\nexternal@partner.de schreibt...",
      }),
      mkEmail({
        message_id: "fwd-reply",
        from_address: "colleague@firma.de",
        to_addresses: ["gf@firma.de"],
        body_text: "Verstanden, kontaktiere external@partner.de.",
      }),
    ];
    const thread = mkThread(["orig", "fwd", "fwd-reply"]);
    const caller = mockCaller("Done");
    const result = await redactEmailThread(thread, emails, {
      tenantDomain: "firma.de",
      chatCaller: caller as unknown as RedactEmailThreadOptions["chatCaller"],
    });
    // Tenants zuerst (gf + colleague), dann external
    expect(result.participantMap.byEmail.get("gf@firma.de")).toBe("P1");
    expect(result.participantMap.byEmail.get("colleague@firma.de")).toBe("P2");
    expect(result.participantMap.byEmail.get("external@partner.de")).toBe("P3");
  });

  it("V5-Bedrock-Mock-Call returnt redacted text — Pseudonyme bleiben in Body erhalten", async () => {
    // Simuliert ein V5-konformer-LLM, der die Pseudonyme korrekt erhaelt.
    const emails: EmailForRedaction[] = [
      mkEmail({
        message_id: "1",
        from_address: "alice@example.com",
        to_addresses: ["bob@example.com"],
        body_text: "Schreibt an alice@example.com fuer 12.500 EUR Auftrag.",
      }),
    ];
    const thread = mkThread(["1"]);
    // Caller simuliert V5-Verhalten: ersetzt 12.500 EUR durch [BETRAG], behaelt P1
    const caller = vi.fn(async () => "Schreibt an P1 fuer [BETRAG] Auftrag.");
    const result = await redactEmailThread(thread, emails, {
      chatCaller: caller as unknown as RedactEmailThreadOptions["chatCaller"],
    });
    expect(result.redactedBody).toContain("P1");
    expect(result.redactedBody).toContain("[BETRAG]");
    expect(result.redactedBody).not.toContain("12.500");
    expect(result.redactedBody).not.toContain("alice@example.com");
  });

  it("Filtert auf thread.message_ids — extra emails werden ignoriert", async () => {
    const emails: EmailForRedaction[] = [
      mkEmail({ message_id: "in-thread", from_address: "a@x.com", body_text: "in" }),
      mkEmail({ message_id: "extra-NOT-in-thread", from_address: "z@x.com", body_text: "ext" }),
    ];
    const thread = mkThread(["in-thread"]);
    const caller = mockCaller("Done");
    const result = await redactEmailThread(thread, emails, {
      chatCaller: caller as unknown as RedactEmailThreadOptions["chatCaller"],
    });
    expect(result.participantMap.byEmail.size).toBe(1);
    expect(result.participantMap.byEmail.get("a@x.com")).toBe("P1");
    expect(result.participantMap.byEmail.has("z@x.com")).toBe(false);
  });

  it("Throw bei leerem Thread (keine matching emails)", async () => {
    const emails: EmailForRedaction[] = [
      mkEmail({ message_id: "elsewhere", from_address: "a@x.com" }),
    ];
    const thread = mkThread(["missing"]);
    const caller = mockCaller("Should not be called");
    await expect(
      redactEmailThread(thread, emails, {
        chatCaller: caller as unknown as RedactEmailThreadOptions["chatCaller"],
      }),
    ).rejects.toThrow(/keine matching emails/);
    expect(caller).not.toHaveBeenCalled();
  });

  it("Throw bei leerer Bedrock-Response", async () => {
    const emails: EmailForRedaction[] = [
      mkEmail({ message_id: "1", from_address: "a@x.com", body_text: "Inhalt" }),
    ];
    const thread = mkThread(["1"]);
    const caller = mockCaller(""); // leer
    await expect(
      redactEmailThread(thread, emails, {
        chatCaller: caller as unknown as RedactEmailThreadOptions["chatCaller"],
      }),
    ).rejects.toThrow(/empty text/);
  });

  it("Throw propagiert bei chatCaller-Error", async () => {
    const emails: EmailForRedaction[] = [
      mkEmail({ message_id: "1", from_address: "a@x.com", body_text: "Inhalt" }),
    ];
    const thread = mkThread(["1"]);
    const caller = vi.fn(async () => {
      throw new Error("Bedrock-timeout");
    });
    await expect(
      redactEmailThread(thread, emails, {
        chatCaller: caller as unknown as RedactEmailThreadOptions["chatCaller"],
      }),
    ).rejects.toThrow(/Bedrock-timeout/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// __testing exports
// ──────────────────────────────────────────────────────────────────────────────

describe("__testing exports", () => {
  it("exposes SIGNATURE_DROP_LINES_AFTER_TRIGGER as 3", () => {
    expect(__testing.SIGNATURE_DROP_LINES_AFTER_TRIGGER).toBe(3);
  });

  it("exposes SIGNATURE_TRIGGER_REGEXES array (non-empty)", () => {
    expect(Array.isArray(__testing.SIGNATURE_TRIGGER_REGEXES)).toBe(true);
    expect(__testing.SIGNATURE_TRIGGER_REGEXES.length).toBeGreaterThan(0);
  });
});
