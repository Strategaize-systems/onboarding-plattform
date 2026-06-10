// V9.1 SLC-V9.1-A MT-4 — Schicht-3-Validation: Optional Sender-Allowlist (DEC-201).
//
// Slice: SLC-V9.1-A — Inbound-Foundation + Validation-Layer
// Spec:  slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-4, Flow A Schritt 6)
//
// Default-Off: wenn fuer einen Endpoint KEINE enabled Allowlist-Row existiert, wird
// die Schicht uebersprungen (allowed=true). Sobald min. 1 enabled Row existiert, muss
// die Original-`From:`-Adresse gegen mindestens ein enabled Pattern matchen.
//
// Pattern-Typen (MIG-057 email_forward_allowlist.pattern_type CHECK):
//   - 'email_exact' : exakte (case-insensitive) Email-Adresse
//   - 'domain'      : Domain + alle Subdomains (z.B. 'example.com' matcht
//                     'a@example.com' UND 'a@sub.example.com')

export interface AllowlistEntry {
  pattern: string;
  pattern_type: "domain" | "email_exact";
  enabled: boolean;
}

export interface AllowlistDecision {
  /** true wenn min. 1 enabled Row existiert (Schicht aktiv). */
  required: boolean;
  /** true wenn die Adresse erlaubt ist (oder Schicht inaktiv). */
  allowed: boolean;
}

function extractDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

function domainMatches(senderDomain: string, patternDomain: string): boolean {
  if (senderDomain === patternDomain) return true;
  // Subdomain-Match: 'sub.example.com' endet auf '.example.com'.
  return senderDomain.endsWith(`.${patternDomain}`);
}

/**
 * Prueft die Sender-Adresse gegen die Allowlist eines Endpoints.
 *
 * - Keine enabled Rows           -> { required: false, allowed: true }  (Schicht uebersprungen)
 * - enabled Rows, From fehlt     -> { required: true,  allowed: false }
 * - enabled Rows, Match          -> { required: true,  allowed: true }
 * - enabled Rows, kein Match     -> { required: true,  allowed: false }
 */
export function evaluateSenderAllowlist(
  fromAddress: string | null | undefined,
  entries: AllowlistEntry[],
): AllowlistDecision {
  const enabled = entries.filter((e) => e.enabled);
  if (enabled.length === 0) {
    return { required: false, allowed: true };
  }
  if (typeof fromAddress !== "string" || fromAddress.length === 0) {
    return { required: true, allowed: false };
  }

  const from = fromAddress.toLowerCase().trim();
  const senderDomain = extractDomain(from);

  for (const entry of enabled) {
    const pattern = entry.pattern.toLowerCase().trim();
    if (entry.pattern_type === "email_exact" && from === pattern) {
      return { required: true, allowed: true };
    }
    if (
      entry.pattern_type === "domain" &&
      senderDomain.length > 0 &&
      domainMatches(senderDomain, pattern)
    ) {
      return { required: true, allowed: true };
    }
  }
  return { required: true, allowed: false };
}
