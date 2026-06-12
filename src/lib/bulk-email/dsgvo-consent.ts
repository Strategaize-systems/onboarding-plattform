// V9.1 SLC-V9.1-D — DSGVO-Disclaimer-Wording + Version (FEAT-079, DEC-209).
//
// Geteilt zwischen DsgvoDisclaimerModal (Anzeige) und confirmDsgvoDisclaimer
// (Persistenz in email_inbound_endpoint.dsgvo_consent_text_version). Keine
// "use server"-Direktive -> importierbar aus Client-Components.
//
// Wording-Hinweis (R3): V9.1 ist Internal-Test-Mode (Founder-Pilot, kein Customer)
// per module-lifecycle-discipline. Anwalts-Review des finalen Wordings ist
// vor Customer-Live deferred. Bei Wording-Aenderung MUSS die Version hochgezaehlt
// werden, damit der Audit-Trail (error_log + dsgvo_consent_text_version) erkennbar
// macht, welche Fassung ein Founder bestaetigt hat.

/** Version-String der aktuell gueltigen Disclaimer-Fassung. Bei Text-Aenderung erhoehen. */
export const DSGVO_CONSENT_TEXT_VERSION = "2026-06-11.v1";

/** Pflicht-Bestaetigungstext, im Modal angezeigt und beim Confirm referenziert. */
export const DSGVO_DISCLAIMER_TEXT =
  "Ich bestaetige, dass ich die weitergeleiteten Emails verarbeiten und an " +
  "Strategaize uebermitteln darf. Diese Bestaetigung wird mit Timestamp und " +
  "User-ID unloeschbar 7 Jahre gespeichert (DSGVO-Pflicht-Audit).";

/** Hinweis-Text zum Audit-Trail, unter der Checkbox angezeigt. */
export const DSGVO_AUDIT_HINT =
  "Diese Bestaetigung wird in error_log mit " +
  "event_type='email_inbound_endpoint_dsgvo_consent' protokolliert und auf der " +
  "Endpoint-Row gespeichert (dsgvo_consent_accepted_at + dsgvo_consent_user_id).";
