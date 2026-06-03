// V9 SLC-166 MT-4 — Thread-Aggregation Pure-Function.
//
// Slice: SLC-166 (V9 Pre-Filter + Thread-Aggregation + PII-Redaction)
// Spec: slices/SLC-166-v9-pre-filter-thread-redact.md (MT-4)
// FEAT: FEAT-072 Thread-Aggregation + PII-Redaction
//
// Aufgabe: Aus einer Liste von Emails (snake_case-Form wie aus email_message
// geladen) gruppierte Threads bauen anhand RFC-5322-Headers (Message-ID,
// In-Reply-To, References-Array). Pure-Function — keine DB, kein I/O.
//
// Algorithmus (Spec L130-145):
//   1. Map<message_id, EmailForThreading> aufbauen.
//   2. Pro Email: effektiven Thread-Root finden via Walk in_reply_to →
//      Fallback references_array[0] mit max 100 Iterationen.
//   3. Forward-Chain: subject startend mit `Fwd:` / `Fw:` / `WG:` / `FW:` ist
//      eigener Thread-Root (auch wenn in_reply_to existiert) — verhindert
//      Auto-Join bei Forwards.
//   4. Cycle-Detection: visited-Set + iteration-Cap = doppelter Schutz gegen
//      hangs durch zirkulaere oder pathologische References.
//   5. Group emails by root → EmailThread mit message_ids + email_count +
//      first_date + last_date.
//
// Output-Reihenfolge:
//   - Threads: nach `first_date` asc (NULL-Dates am Ende). Deterministisch.
//   - message_ids in Thread: in Eingabe-Reihenfolge (Caller kann nachsortieren).
//
// Edge-Cases (alle in Tests verifiziert):
//   - Single-Email-Thread (kein parent_pointer oder parent extern) → 1 Element
//   - Reply-Loop A→B→A → 1 Thread, hard-cut nach 100 Iterations (kein Crash)
//   - Forward-Chain Fwd:/WG: → separater Thread (kein Join trotz in_reply_to)
//   - Multiple Forwards mit gleichem Subject → jeweils eigener Thread
//   - Parent extern (in_reply_to ist nicht in unserer Map) → current = root

const MAX_THREAD_WALK_ITERATIONS = 100;

const FORWARD_SUBJECT_REGEX = /^\s*(fwd?|fw|wg)\s*:/i;

export interface EmailForThreading {
  message_id: string;
  in_reply_to: string | null;
  references_array: string[] | null;
  subject: string | null;
  date: string | null;
}

export interface EmailThread {
  /** Message-ID der Root-Email (oder der Email selbst wenn standalone). */
  root_message_id: string;
  /** Subject der Root-Email. Leer-String wenn root.subject NULL. */
  subject: string;
  /** Anzahl Emails im Thread (entspricht message_ids.length). */
  email_count: number;
  /** Aelteste Date im Thread (ISO-String), oder null wenn alle Dates NULL. */
  first_date: string | null;
  /** Juengste Date im Thread (ISO-String), oder null wenn alle Dates NULL. */
  last_date: string | null;
  /** Alle Message-IDs im Thread (in Eingabe-Reihenfolge). */
  message_ids: string[];
}

/**
 * Pruefe ob ein Subject ein Forward ist (RFC-5322-untypisch aber praktisch
 * verbreitet — die meisten Clients setzen kein in_reply_to bei Forward,
 * aber manche tun es. Subject-Prefix ist die robuste Erkennung.)
 *
 * Unterstuetzte Prefixe (case-insensitive):
 *   - "Fwd:" / "Fwd :"  (englisch standard)
 *   - "Fw:"  / "Fw :"   (englisch kurz)
 *   - "FW:"             (Outlook-Style)
 *   - "WG:"             (deutsch "weitergeleitet")
 */
function isForwardSubject(subject: string | null): boolean {
  if (!subject) return false;
  return FORWARD_SUBJECT_REGEX.test(subject);
}

/**
 * Effektiven Thread-Root fuer eine Email finden. Walk in_reply_to → Fallback
 * references_array[0] bis: (a) parent extern, (b) iteration-Cap, (c) Cycle.
 *
 * Return:
 *   - Forward-Subject: liefert die Email selbst als Root zurueck (kein Walk).
 *   - Standalone (keine Pointer): die Email selbst.
 *   - Walk-Ende durch externen Parent / Cap / Cycle: letzter erreichter
 *     in-Map-Knoten ist Root.
 */
function findRootMessageId(
  start: EmailForThreading,
  emailMap: Map<string, EmailForThreading>,
): string {
  // Forward bricht den Walk komplett — Forwards sind eigene Threads.
  if (isForwardSubject(start.subject)) {
    return start.message_id;
  }

  const visited = new Set<string>();
  let current: EmailForThreading = start;

  for (let i = 0; i < MAX_THREAD_WALK_ITERATIONS; i++) {
    if (visited.has(current.message_id)) {
      // Cycle erkannt — konsolidiere alle besuchten Knoten in einem Thread,
      // indem wir die lexikographisch kleinste message_id als Root waehlen.
      // Das ist deterministisch und sorgt dafuer, dass alle Walker im Cycle
      // auf dieselbe Root-ID konvergieren (unabhaengig vom Start-Knoten).
      let smallest = current.message_id;
      for (const id of visited) {
        if (id < smallest) smallest = id;
      }
      return smallest;
    }
    visited.add(current.message_id);

    const parentId =
      current.in_reply_to ??
      (current.references_array && current.references_array.length > 0
        ? current.references_array[0]
        : null);

    if (!parentId) {
      // current ist Root.
      return current.message_id;
    }

    const parent = emailMap.get(parentId);
    if (!parent) {
      // Parent ist extern (nicht in dieser Bulk-Run) — current ist effektiver
      // Root in unserem Universum.
      return current.message_id;
    }

    // Forward-Pruefung beim Parent: wenn der Parent ein Forward ist, IST der
    // Forward der Root des Sub-Threads. Replies auf den Forward landen im
    // selben Thread wie der Forward, aber getrennt vom Original. Wir geben
    // parent.message_id zurueck (nicht current) damit alle Walker auf dieselbe
    // Root-ID konvergieren.
    if (isForwardSubject(parent.subject)) {
      return parent.message_id;
    }

    current = parent;
  }

  // Iteration-Cap erreicht — kein Crash, letztes current ist Root.
  return current.message_id;
}

/**
 * Parsed Date-String fuer Vergleich. Toleriert ungueltige Inputs (gibt null
 * zurueck), damit min/max ueber undefined-Sets stabil bleibt.
 */
function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Aggregiere eine Liste von Emails in Threads.
 *
 * Vertrag:
 *   - Input darf leer sein → returnt `[]`.
 *   - message_id muss eindeutig sein. Bei Duplikaten gewinnt der erste Eintrag
 *     (deterministisch, kein Throw — Caller sollte vorher dedupen).
 *   - Output ist sortiert nach first_date asc; NULL-Dates landen ans Ende.
 *   - Innerhalb eines Threads steht message_ids in Eingabe-Reihenfolge.
 *   - Reply-Loops werden hart abgebrochen (max 100 Iterations) — kein Crash.
 *   - Forwards (Fwd:/Fw:/WG: subject) sind eigene Threads.
 */
export function aggregateThreads(emails: EmailForThreading[]): EmailThread[] {
  if (emails.length === 0) return [];

  // 1. Map<message_id, email>. Duplikate: erster gewinnt.
  const emailMap = new Map<string, EmailForThreading>();
  for (const e of emails) {
    if (!emailMap.has(e.message_id)) {
      emailMap.set(e.message_id, e);
    }
  }

  // 2. Pro Email: Root finden + in Thread-Bucket einsortieren (Insertion-
  //    Reihenfolge ist die Input-Reihenfolge).
  const threadBuckets = new Map<string, EmailForThreading[]>();
  for (const e of emails) {
    const rootId = findRootMessageId(e, emailMap);
    const bucket = threadBuckets.get(rootId);
    if (bucket) {
      bucket.push(e);
    } else {
      threadBuckets.set(rootId, [e]);
    }
  }

  // 3. Buckets → EmailThread-Struct.
  const threads: EmailThread[] = [];
  for (const [rootId, members] of threadBuckets) {
    const root = emailMap.get(rootId);
    const subject = root?.subject ?? "";

    let first: Date | null = null;
    let last: Date | null = null;
    for (const m of members) {
      const d = parseDate(m.date);
      if (!d) continue;
      if (!first || d.getTime() < first.getTime()) first = d;
      if (!last || d.getTime() > last.getTime()) last = d;
    }

    threads.push({
      root_message_id: rootId,
      subject,
      email_count: members.length,
      first_date: first ? first.toISOString() : null,
      last_date: last ? last.toISOString() : null,
      message_ids: members.map((m) => m.message_id),
    });
  }

  // 4. Output sortieren: first_date asc, NULL ans Ende, Tie-Break per
  //    root_message_id fuer Determinismus.
  threads.sort((a, b) => {
    if (a.first_date && b.first_date) {
      if (a.first_date < b.first_date) return -1;
      if (a.first_date > b.first_date) return 1;
      return a.root_message_id.localeCompare(b.root_message_id);
    }
    if (a.first_date && !b.first_date) return -1;
    if (!a.first_date && b.first_date) return 1;
    return a.root_message_id.localeCompare(b.root_message_id);
  });

  return threads;
}

export const __testing = {
  MAX_THREAD_WALK_ITERATIONS,
  FORWARD_SUBJECT_REGEX,
  isForwardSubject,
  findRootMessageId,
};
