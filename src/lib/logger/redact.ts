// SLC-195 MT-3 (V20, ISSUE-132) — Logger-Redaction Pure-Function.
//
// Pattern aus strategaize-business-system/cockpit/src/lib/logger/redact.ts
// (P-092 / Rule: strategaize-pattern-reuse.md). 1:1-Port; die Key-Liste ist
// fuer OP relevant identisch (Security-Core + PII-Minimal + Domain-PII:
// OP hat inbound-email [from_address/recipient/body_text], dialogue-transcript
// und den x-cron-secret-Header aus SLC-195 MT-2).
//
// Zweck: metadata-Objekte, die in error_log geschrieben werden, koennen Secrets/
// PII enthalten (Header, Payload-Fragmente). Diese key-basierte Redaction ersetzt
// die Werte gefaehrlicher Keys durch [REDACTED], bevor logToDb sie persistiert.

/**
 * Keys, deren Werte in geloggten Objekten durch `[REDACTED]` ersetzt werden.
 * Security-Core (10) + PII-Minimal (2) + Domain-PII (5). Erweiterbar via
 * `opts.extraKeys`.
 */
export const DEFAULT_REDACT_KEYS = [
  // Security-Core (10)
  "password",
  "token",
  "secret",
  "api_key",
  "authorization",
  "cookie",
  "session",
  "jwt",
  "refresh_token",
  "access_token",
  // PII-Minimal (2)
  "email",
  "phone",
  // Domain-PII (5) — OP inbound-email / dialogue / cron
  "from_address",
  "recipient",
  "body_text",
  "transcript",
  "x-cron-secret",
] as const;

export interface RedactOptions {
  /** Zusaetzliche Keys, die ueber DEFAULT_REDACT_KEYS hinaus redactet werden. */
  extraKeys?: string[];
  /** Ersatzwert fuer redactete Felder. Default `[REDACTED]`. */
  replacementValue?: string;
}

/** Schutz gegen unbegrenzte Rekursion (z.B. tiefe Next.js-Request-Objekte). */
const MAX_DEPTH = 10;

/**
 * Erzeugt eine redactete TIEFE KOPIE von `obj`. Mutiert das Original nicht.
 *
 * - Key-basiert (case-insensitive), unabhaengig vom Wert-Typ.
 * - Deep-recursive ueber Objekte und Arrays.
 * - Zirkulaere Referenzen via WeakSet → `[Circular]` (JSON-serialisierbar).
 * - Ab `MAX_DEPTH` wird der Wert unveraendert zurueckgegeben.
 *
 * Primitive werden unveraendert durchgereicht — Redaction ist key-basiert.
 */
export function redactSecrets<T>(obj: T, opts?: RedactOptions): T {
  const redactKeys = new Set(
    [...DEFAULT_REDACT_KEYS, ...(opts?.extraKeys ?? [])].map((k) =>
      k.toLowerCase(),
    ),
  );
  const replacement = opts?.replacementValue ?? "[REDACTED]";
  const seen = new WeakSet<object>();

  function walk(value: unknown, depth: number): unknown {
    if (value === null || typeof value !== "object") {
      return value;
    }
    if (depth >= MAX_DEPTH) {
      return value;
    }
    if (seen.has(value as object)) {
      return "[Circular]";
    }
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.map((item) => walk(item, depth + 1));
    }

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (redactKeys.has(key.toLowerCase())) {
        out[key] = replacement;
      } else {
        out[key] = walk(val, depth + 1);
      }
    }
    return out;
  }

  return walk(obj, 0) as T;
}
