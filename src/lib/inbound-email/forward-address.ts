// V9.1 SLC-V9.1-E — Forward-Adress-Resolver (ISSUE-098 Single-Mailbox-Fix).
//
// Die Setup-UI zeigt dem GF die Adresse, an die er Emails weiterleiten soll, und
// die Test-Mail wird an genau diese Adresse versandt. Es gibt zwei Modi:
//
//   1. Single-Mailbox (as-built, DEC-205/206): ENV INBOUND_MAILBOX_ADDRESS gesetzt.
//      Alle Weiterleitungen laufen ueber EIN reales IONOS-Postfach (das der
//      IMAP-Sync via IMAP_USER abholt). Der Slug ist nur Endpoint-Identitaet, NICHT
//      Teil der Zustell-Adresse — resolveDefaultEndpoint ordnet ohne To-Matching zu.
//      => Zustell-Adresse = das reale Postfach, fuer alle Endpoints identisch.
//
//   2. Catchall (Zukunft): ENV INBOUND_MAILBOX_ADDRESS NICHT gesetzt.
//      Pro Endpoint eine eigene `bulk-<slug>@<INBOUND_CATCHALL_DOMAIN>`-Adresse,
//      sobald `bulk.strategaizetransition.com` einen MX-Record auf IONOS hat.
//
// ISSUE-098: Bis die Catchall-Subdomain einen MX hat, bounct jede Mail an
// `bulk-<slug>@bulk.strategaizetransition.com`. Im Single-Mailbox-Modus MUSS die
// UI deshalb das reale Postfach anzeigen und die Test-Mail dorthin schicken.

const DEFAULT_CATCHALL_DOMAIN = "bulk.strategaizetransition.com";

/** True, wenn der Single-Mailbox-Modus aktiv ist (INBOUND_MAILBOX_ADDRESS gesetzt). */
export function singleMailboxAddress(): string | null {
  return process.env.INBOUND_MAILBOX_ADDRESS?.trim() || null;
}

/**
 * Liefert die Adresse, an die der GF Emails weiterleiten soll.
 *
 * Single-Mailbox-Modus -> das reale IONOS-Postfach (slug-unabhaengig).
 * Catchall-Modus        -> `bulk-<slug>@<INBOUND_CATCHALL_DOMAIN>`.
 */
export function resolveForwardAddress(slug: string): string {
  const mailbox = singleMailboxAddress();
  if (mailbox) return mailbox;

  const domain = process.env.INBOUND_CATCHALL_DOMAIN?.trim() || DEFAULT_CATCHALL_DOMAIN;
  return `bulk-${slug}@${domain}`;
}
