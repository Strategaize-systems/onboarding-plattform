// V7.2 SLC-141 MT-5 (FEAT-060) — Pure-Logic Helpers fuer SendReportByEmailModal.
//
// Vitest in node-env kann React nicht rendern (gleiche Konvention wie
// helper-text-modal-logic). Daher Pure-Funktionen separat halten und testen;
// die Component-Verdrahtung selbst per /qa-Live-Smoke.

export const CUSTOM_MESSAGE_MAX_LEN = 500;

export interface ModalFormState {
  recipientToSelf: boolean;
  recipientToPartner: boolean;
  additionalEmail: string;
  customMessage: string;
}

export interface ServerActionInput {
  captureSessionId: string;
  recipientToSelf: boolean;
  recipientToPartner: boolean;
  additionalEmail?: string;
  customMessage?: string;
}

/**
 * True, wenn mindestens einer der drei Empfaenger-Kanaele eingeschaltet ist.
 * Additional zaehlt nur als Empfaenger, wenn die Eingabe nach Trim nicht leer
 * ist — sonst kann der Submit-Button trotz aktiver Checkbox blockiert bleiben.
 */
export function hasAtLeastOneRecipient(state: ModalFormState): boolean {
  return (
    state.recipientToSelf ||
    state.recipientToPartner ||
    state.additionalEmail.trim().length > 0
  );
}

/**
 * Verbleibende Zeichen im Custom-Message-Feld (negativ wenn zu lang).
 */
export function customMessageRemaining(state: ModalFormState): number {
  return CUSTOM_MESSAGE_MAX_LEN - state.customMessage.length;
}

export function isCustomMessageOverLimit(state: ModalFormState): boolean {
  return customMessageRemaining(state) < 0;
}

/**
 * Wandelt Form-State + sessionId in den Server-Action-Input-Shape um.
 * Leere Strings werden zu `undefined` (matched Optional-Properties).
 */
export function buildServerActionInput(
  captureSessionId: string,
  state: ModalFormState,
): ServerActionInput {
  const additional = state.additionalEmail.trim();
  const custom = state.customMessage.trim();
  return {
    captureSessionId,
    recipientToSelf: state.recipientToSelf,
    recipientToPartner: state.recipientToPartner,
    additionalEmail: additional.length > 0 ? additional : undefined,
    customMessage: custom.length > 0 ? custom : undefined,
  };
}

/**
 * Formatiert die Success-Toast-Nachricht. Aktuell Singular/Plural identisch
 * ("Empfaenger") — Helper haelt die Stelle aber wartungsfreundlich offen, falls
 * spaeter doch Plural-Differenzierung gewuenscht ist (z.B. "Empfaenger:innen").
 */
export function formatSuccessToast(recipientsCount: number): string {
  return `Bericht versendet an ${recipientsCount} Empfaenger.`;
}

/**
 * Mapping von Server-Action-Error-Codes auf deutsche User-facing Labels.
 * Single source of truth; Modal-Component und Tests beziehen sich auf diese
 * Tabelle.
 */
export const ERROR_LABELS: Record<string, string> = {
  invalid_capture_session_id: "Diagnose-Session konnte nicht aufgeloest werden.",
  no_recipients: "Bitte mindestens einen Empfaenger waehlen.",
  invalid_additional_email: "Die zusaetzliche E-Mail-Adresse ist ungueltig.",
  custom_message_too_long: `Die persoenliche Nachricht darf hoechstens ${CUSTOM_MESSAGE_MAX_LEN} Zeichen lang sein.`,
  unauthenticated: "Session abgelaufen. Bitte neu einloggen.",
  profile_not_found: "Profil nicht gefunden.",
  capture_session_lookup_failed:
    "Diagnose konnte nicht geladen werden. Bitte spaeter erneut versuchen.",
  capture_session_not_found: "Diagnose nicht gefunden.",
  forbidden: "Keine Berechtigung fuer diese Diagnose.",
  not_finalized: "Diagnose ist noch nicht abgeschlossen.",
  rate_limit_exceeded:
    "Versand-Limit erreicht (max. 5 pro Stunde). Bitte spaeter erneut versuchen.",
  self_email_missing: "Eigene E-Mail-Adresse ist nicht hinterlegt.",
  partner_email_missing:
    "Partner-Steuerberater hat keine E-Mail-Adresse hinterlegt.",
  no_partner_assigned: "Kein Partner-Steuerberater zugeordnet.",
  no_recipients_resolved:
    "Empfaenger konnten nicht aufgeloest werden. Bitte Auswahl pruefen.",
  template_not_found: "Diagnose-Vorlage nicht gefunden.",
  pdf_render_failed:
    "Bericht-PDF konnte nicht erzeugt werden. Bitte spaeter erneut versuchen.",
  smtp_send_failed:
    "E-Mail-Versand fehlgeschlagen. Bitte spaeter erneut versuchen.",
};

export const GENERIC_ERROR =
  "Etwas ist schiefgelaufen. Wir kuemmern uns darum, bitte spaeter erneut versuchen.";

export function mapErrorToLabel(errorCode: string): string {
  return ERROR_LABELS[errorCode] ?? GENERIC_ERROR;
}
