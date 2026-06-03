// V9 SLC-166 MT-4 — Vitest fuer aggregateThreads Pure-Function.
//
// Coverage gemaess Spec L143-146:
//   1. 5 Emails, 1 Konversation → 1 Thread mit 5 Emails
//   2. 5 Emails ohne Reply-Relation → 5 Single-Email-Threads
//   3. Reply-Loop (Email A → B → A) → 1 Thread mit hartem Cut nach 100
//   4. Forward-Chain → 2 separate Threads
//
// Plus:
//   - Empty-Array → []
//   - in_reply_to existiert, parent extern (nicht in Map) → standalone
//   - references_array[0] Fallback wenn in_reply_to fehlt
//   - Subject vom Root wird genutzt (nicht vom letzten Reply)
//   - first_date / last_date korrekt aus heterogenen Date-Strings
//   - NULL-Dates landen ans Ende der Output-Reihenfolge
//   - isForwardSubject erkennt "Fwd:" / "Fw:" / "WG:" / "FW:" case-insensitive
//   - Duplikat-message_id: erster gewinnt, kein Throw

import { describe, it, expect } from "vitest";

import {
  aggregateThreads,
  __testing,
  type EmailForThreading,
} from "../thread-aggregation";

function mkEmail(
  partial: Partial<EmailForThreading> & Pick<EmailForThreading, "message_id">,
): EmailForThreading {
  return {
    in_reply_to: null,
    references_array: null,
    subject: null,
    date: null,
    ...partial,
  };
}

describe("isForwardSubject", () => {
  const { isForwardSubject } = __testing;
  it("returns true for 'Fwd:'", () => {
    expect(isForwardSubject("Fwd: Original")).toBe(true);
  });
  it("returns true for 'Fw:'", () => {
    expect(isForwardSubject("Fw: Original")).toBe(true);
  });
  it("returns true for 'FW:'", () => {
    expect(isForwardSubject("FW: Original")).toBe(true);
  });
  it("returns true for 'WG:'", () => {
    expect(isForwardSubject("WG: Original")).toBe(true);
  });
  it("returns true with leading whitespace", () => {
    expect(isForwardSubject("   Fwd: spaced")).toBe(true);
  });
  it("returns true case-insensitive 'fwd:'", () => {
    expect(isForwardSubject("fwd: lower")).toBe(true);
  });
  it("returns false for 'Re:' (Reply, not Forward)", () => {
    expect(isForwardSubject("Re: Original")).toBe(false);
  });
  it("returns false for 'Forward' (without colon)", () => {
    expect(isForwardSubject("Forward thinking")).toBe(false);
  });
  it("returns false for null", () => {
    expect(isForwardSubject(null)).toBe(false);
  });
  it("returns false for empty string", () => {
    expect(isForwardSubject("")).toBe(false);
  });
});

describe("aggregateThreads — empty + single", () => {
  it("returns [] for empty input", () => {
    expect(aggregateThreads([])).toEqual([]);
  });

  it("returns 1 Single-Email-Thread for 1 email without parent_pointer", () => {
    const result = aggregateThreads([
      mkEmail({
        message_id: "msg-1",
        subject: "Hallo",
        date: "2026-06-01T10:00:00Z",
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      root_message_id: "msg-1",
      subject: "Hallo",
      email_count: 1,
      first_date: "2026-06-01T10:00:00.000Z",
      last_date: "2026-06-01T10:00:00.000Z",
      message_ids: ["msg-1"],
    });
  });

  it("5 Emails ohne Reply-Relation → 5 Single-Email-Threads", () => {
    const emails = Array.from({ length: 5 }, (_, i) =>
      mkEmail({
        message_id: `msg-${i + 1}`,
        subject: `Subject ${i + 1}`,
        date: `2026-06-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      }),
    );
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(5);
    for (const thread of result) {
      expect(thread.email_count).toBe(1);
      expect(thread.message_ids).toHaveLength(1);
    }
  });
});

describe("aggregateThreads — Multi-Reply (1 Konversation)", () => {
  it("5 Emails, lineare Kette A ← B ← C ← D ← E → 1 Thread mit 5 Emails", () => {
    const emails: EmailForThreading[] = [
      mkEmail({
        message_id: "msg-A",
        subject: "Diskussion",
        date: "2026-06-01T10:00:00Z",
      }),
      mkEmail({
        message_id: "msg-B",
        in_reply_to: "msg-A",
        subject: "Re: Diskussion",
        date: "2026-06-01T11:00:00Z",
      }),
      mkEmail({
        message_id: "msg-C",
        in_reply_to: "msg-B",
        subject: "Re: Diskussion",
        date: "2026-06-01T12:00:00Z",
      }),
      mkEmail({
        message_id: "msg-D",
        in_reply_to: "msg-C",
        subject: "Re: Diskussion",
        date: "2026-06-01T13:00:00Z",
      }),
      mkEmail({
        message_id: "msg-E",
        in_reply_to: "msg-D",
        subject: "Re: Diskussion",
        date: "2026-06-01T14:00:00Z",
      }),
    ];
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      root_message_id: "msg-A",
      subject: "Diskussion",
      email_count: 5,
      first_date: "2026-06-01T10:00:00.000Z",
      last_date: "2026-06-01T14:00:00.000Z",
    });
    expect(result[0]!.message_ids).toEqual(["msg-A", "msg-B", "msg-C", "msg-D", "msg-E"]);
  });

  it("Star-Pattern: B/C/D/E alle Reply auf A → 1 Thread mit 5 Emails", () => {
    const emails: EmailForThreading[] = [
      mkEmail({ message_id: "msg-A", subject: "Frage" }),
      mkEmail({ message_id: "msg-B", in_reply_to: "msg-A" }),
      mkEmail({ message_id: "msg-C", in_reply_to: "msg-A" }),
      mkEmail({ message_id: "msg-D", in_reply_to: "msg-A" }),
      mkEmail({ message_id: "msg-E", in_reply_to: "msg-A" }),
    ];
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(1);
    expect(result[0]!.root_message_id).toBe("msg-A");
    expect(result[0]!.email_count).toBe(5);
  });

  it("Mit references_array Fallback (kein in_reply_to)", () => {
    const emails: EmailForThreading[] = [
      mkEmail({ message_id: "root", subject: "Origin" }),
      mkEmail({
        message_id: "leaf",
        in_reply_to: null,
        references_array: ["root", "intermediate-1"],
        subject: "Re: Origin",
      }),
    ];
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(1);
    expect(result[0]!.root_message_id).toBe("root");
    expect(result[0]!.email_count).toBe(2);
  });
});

describe("aggregateThreads — Reply-Loop (Cycle-Detection)", () => {
  it("Loop A → B → A → liefert 1 Thread und crasht nicht", () => {
    const emails: EmailForThreading[] = [
      mkEmail({
        message_id: "msg-A",
        in_reply_to: "msg-B",
        subject: "Cycle 1",
      }),
      mkEmail({
        message_id: "msg-B",
        in_reply_to: "msg-A",
        subject: "Cycle 2",
      }),
    ];
    const start = Date.now();
    const result = aggregateThreads(emails);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000); // hard cut bremst innerhalb 1s
    expect(result).toHaveLength(1);
    expect(result[0]!.email_count).toBe(2);
    // Beide Emails landen im gleichen Thread (cycle-detection consolidiert).
    expect(result[0]!.message_ids.sort()).toEqual(["msg-A", "msg-B"]);
  });

  it("Long cycle (3-knot loop) → hart-cut nach 100, kein Crash", () => {
    const emails: EmailForThreading[] = [
      mkEmail({ message_id: "X", in_reply_to: "Y" }),
      mkEmail({ message_id: "Y", in_reply_to: "Z" }),
      mkEmail({ message_id: "Z", in_reply_to: "X" }),
    ];
    const result = aggregateThreads(emails);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Alle 3 sind irgendwo zugeordnet.
    const allIds = result.flatMap((t) => t.message_ids);
    expect(allIds.sort()).toEqual(["X", "Y", "Z"]);
  });
});

describe("aggregateThreads — Forward-Chain", () => {
  it("Original-Mail + Forward davon → 2 separate Threads", () => {
    const emails: EmailForThreading[] = [
      mkEmail({
        message_id: "orig",
        subject: "Wichtige Info",
        date: "2026-06-01T10:00:00Z",
      }),
      mkEmail({
        message_id: "fwd",
        in_reply_to: "orig", // pathologischer Client setzt das trotz Forward
        subject: "Fwd: Wichtige Info",
        date: "2026-06-01T11:00:00Z",
      }),
    ];
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(2);
    const roots = result.map((t) => t.root_message_id).sort();
    expect(roots).toEqual(["fwd", "orig"]);
  });

  it("Forward + dessen Replies → eigener Thread getrennt vom Original", () => {
    const emails: EmailForThreading[] = [
      mkEmail({
        message_id: "orig",
        subject: "Origin",
        date: "2026-06-01T10:00:00Z",
      }),
      mkEmail({
        message_id: "orig-reply",
        in_reply_to: "orig",
        subject: "Re: Origin",
        date: "2026-06-01T10:30:00Z",
      }),
      mkEmail({
        message_id: "fwd",
        in_reply_to: "orig",
        subject: "Fwd: Origin",
        date: "2026-06-01T11:00:00Z",
      }),
      mkEmail({
        message_id: "fwd-reply",
        in_reply_to: "fwd",
        subject: "Re: Fwd: Origin",
        date: "2026-06-01T12:00:00Z",
      }),
    ];
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(2);
    const origThread = result.find((t) => t.root_message_id === "orig");
    const fwdThread = result.find((t) => t.root_message_id === "fwd");
    expect(origThread?.message_ids.sort()).toEqual(["orig", "orig-reply"]);
    expect(fwdThread?.message_ids.sort()).toEqual(["fwd", "fwd-reply"]);
  });

  it("Mehrere Fwd-Subjects → jeweils eigener Thread", () => {
    const emails: EmailForThreading[] = [
      mkEmail({ message_id: "a", subject: "Fwd: X", date: "2026-06-01T10:00:00Z" }),
      mkEmail({ message_id: "b", subject: "Fwd: X", date: "2026-06-01T11:00:00Z" }),
      mkEmail({ message_id: "c", subject: "Fwd: X", date: "2026-06-01T12:00:00Z" }),
    ];
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(3);
  });

  it("WG: (deutsche Forward) wird wie Fwd: behandelt", () => {
    const emails: EmailForThreading[] = [
      mkEmail({
        message_id: "orig",
        subject: "Frage",
        date: "2026-06-01T10:00:00Z",
      }),
      mkEmail({
        message_id: "wg",
        in_reply_to: "orig",
        subject: "WG: Frage",
        date: "2026-06-01T11:00:00Z",
      }),
    ];
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(2);
  });
});

describe("aggregateThreads — Externer Parent (Spec L141)", () => {
  it("in_reply_to verweist auf nicht-vorhandene message_id → Single-Email-Thread", () => {
    const emails: EmailForThreading[] = [
      mkEmail({
        message_id: "lonely",
        in_reply_to: "external-non-existent",
        subject: "Re: Etwas Externes",
      }),
    ];
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(1);
    expect(result[0]!.root_message_id).toBe("lonely");
    expect(result[0]!.email_count).toBe(1);
  });

  it("references_array[0] verweist auf extern → Single-Email", () => {
    const emails: EmailForThreading[] = [
      mkEmail({
        message_id: "lonely",
        references_array: ["external-1", "external-2"],
        subject: "Re: Externes",
      }),
    ];
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(1);
    expect(result[0]!.root_message_id).toBe("lonely");
  });
});

describe("aggregateThreads — Output-Order + Metadaten", () => {
  it("Threads sortiert nach first_date asc; NULL-Dates ans Ende", () => {
    const emails: EmailForThreading[] = [
      mkEmail({ message_id: "early", date: "2026-06-01T10:00:00Z" }),
      mkEmail({ message_id: "late", date: "2026-06-05T10:00:00Z" }),
      mkEmail({ message_id: "middle", date: "2026-06-03T10:00:00Z" }),
      mkEmail({ message_id: "nullDate", date: null }),
    ];
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(4);
    expect(result.map((t) => t.root_message_id)).toEqual([
      "early",
      "middle",
      "late",
      "nullDate",
    ]);
  });

  it("first_date / last_date korrekt ueber Multi-Mail-Thread", () => {
    const emails: EmailForThreading[] = [
      mkEmail({
        message_id: "root",
        subject: "Konvers",
        date: "2026-06-01T12:00:00Z",
      }),
      mkEmail({
        message_id: "earlier",
        in_reply_to: "root",
        subject: "Re: Konvers",
        date: "2026-06-01T08:00:00Z", // bewusst frueher als root → first_date
      }),
      mkEmail({
        message_id: "later",
        in_reply_to: "root",
        subject: "Re: Konvers",
        date: "2026-06-01T20:00:00Z",
      }),
    ];
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(1);
    expect(result[0]!.first_date).toBe("2026-06-01T08:00:00.000Z");
    expect(result[0]!.last_date).toBe("2026-06-01T20:00:00.000Z");
  });

  it("Subject aus Root, nicht aus Last-Reply", () => {
    const emails: EmailForThreading[] = [
      mkEmail({ message_id: "root", subject: "Original-Subject" }),
      mkEmail({
        message_id: "reply",
        in_reply_to: "root",
        subject: "Re: Original-Subject",
      }),
    ];
    const result = aggregateThreads(emails);
    expect(result[0]!.subject).toBe("Original-Subject");
  });

  it("NULL-Subject → leerer String im Output", () => {
    const emails: EmailForThreading[] = [
      mkEmail({ message_id: "root", subject: null }),
    ];
    const result = aggregateThreads(emails);
    expect(result[0]!.subject).toBe("");
  });

  it("message_ids in Eingabe-Reihenfolge innerhalb des Threads", () => {
    const emails: EmailForThreading[] = [
      mkEmail({ message_id: "A", subject: "Root" }),
      mkEmail({ message_id: "C", in_reply_to: "A" }),
      mkEmail({ message_id: "B", in_reply_to: "A" }),
    ];
    const result = aggregateThreads(emails);
    expect(result[0]!.message_ids).toEqual(["A", "C", "B"]);
  });
});

describe("aggregateThreads — Robustheit", () => {
  it("Duplikat-message_id: erster gewinnt, kein Throw", () => {
    const emails: EmailForThreading[] = [
      mkEmail({
        message_id: "dup",
        subject: "First",
        date: "2026-06-01T10:00:00Z",
      }),
      mkEmail({
        message_id: "dup",
        subject: "Second",
        date: "2026-06-01T11:00:00Z",
      }),
    ];
    expect(() => aggregateThreads(emails)).not.toThrow();
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(1);
    expect(result[0]!.email_count).toBe(2);
    // subject vom Map-First (= First, weil als erster eingefuegt)
    expect(result[0]!.subject).toBe("First");
  });

  it("Invalid Date-String → wird ignoriert, first/last bleiben null wenn alle invalid", () => {
    const emails: EmailForThreading[] = [
      mkEmail({ message_id: "x", date: "nicht-ein-datum" }),
    ];
    const result = aggregateThreads(emails);
    expect(result[0]!.first_date).toBeNull();
    expect(result[0]!.last_date).toBeNull();
  });

  it("references_array leeres Array → wie kein Pointer", () => {
    const emails: EmailForThreading[] = [
      mkEmail({ message_id: "x", references_array: [], in_reply_to: null }),
    ];
    const result = aggregateThreads(emails);
    expect(result).toHaveLength(1);
    expect(result[0]!.root_message_id).toBe("x");
  });

  it("MAX_THREAD_WALK_ITERATIONS Konstante = 100", () => {
    expect(__testing.MAX_THREAD_WALK_ITERATIONS).toBe(100);
  });
});
