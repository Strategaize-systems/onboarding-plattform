"use client";

// V6 SLC-106 MT-7 — "Ich will mehr von Strategaize" Modal (FEAT-046).
// Native HTML Form + useTransition + Server Action (Memory feedback_native_html_form_pattern).
// Pflicht-Checkbox-Pattern aus ApprovalForm.tsx (DEC-091 V5).
// Submit-Button disabled bis Einwilligung aktiv (UI-Layer) + Re-Validation
// in requestLeadPush (Defense-in-Depth).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestLeadPush } from "@/app/dashboard/diagnose/[capture_session_id]/lead-push-actions";

const CONSENT_TEXT_VERSION = "v1-2026-05";

const CONSENT_TEXT =
  "Ich willige ein, dass mein Vor- und Nachname, meine E-Mail-Adresse und eine kurze Strukturzusammenfassung meiner Diagnose an Strategaize uebermittelt werden, damit Strategaize Kontakt mit mir aufnehmen kann. Diese Einwilligung kann ich jederzeit widerrufen.";

// User-facing Fehlerlabels. Die meisten Faelle sollten in der Praxis nicht
// auftreten, weil die Card nur sichtbar ist, wenn eine `finalized`
// capture_session + noch kein Consent existiert. Defense-in-Depth fuer
// Race-Conditions (zweiter Tab) und Server-Action-Validation.
const ERROR_LABEL: Record<string, string> = {
  privacy_checkbox_required:
    "Bitte bestaetige die Einwilligung vor dem Absenden.",
  invalid_capture_session_id: "Diagnose-Session konnte nicht aufgeloest werden.",
  invalid_consent_text_version: "Einwilligungs-Version ungueltig.",
  unauthenticated: "Session abgelaufen. Bitte neu einloggen.",
  profile_not_found: "Profil nicht gefunden.",
  capture_session_lookup_failed:
    "Diagnose konnte nicht geladen werden. Bitte spaeter erneut versuchen.",
  capture_session_not_found: "Diagnose nicht gefunden.",
  forbidden: "Keine Berechtigung fuer diese Diagnose.",
  not_finalized: "Diagnose ist noch nicht abgeschlossen.",
  tenant_not_found: "Mandant nicht gefunden.",
  not_partner_client:
    "Lead-Push ist nur fuer Mandanten unter einem Steuerberater verfuegbar.",
  no_parent_partner: "Kein Partner-Steuerberater hinterlegt.",
  already_pushed: "Anfrage wurde bereits gesendet.",
  consent_insert_failed:
    "Einwilligung konnte nicht gespeichert werden. Bitte erneut versuchen.",
  audit_insert_failed:
    "Anfrage konnte nicht angelegt werden. Bitte erneut versuchen.",
};

const GENERIC_ERROR =
  "Etwas ist schiefgelaufen. Wir kuemmern uns darum, bitte spaeter erneut versuchen.";

interface IchWillMehrModalProps {
  captureSessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IchWillMehrModal({
  captureSessionId,
  open,
  onOpenChange,
}: IchWillMehrModalProps) {
  const router = useRouter();
  const [consentChecked, setConsentChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  function resetState() {
    setConsentChecked(false);
    setError(null);
    setSubmitted(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Nach Close den State zuruecksetzen, damit ein erneutes Oeffnen
      // (vor Router-Refresh) keinen Stale-Success zeigt. Router.refresh()
      // im Success-Pfad sorgt anschliessend dafuer, dass die Karte
      // verschwindet (kein Wieder-Oeffnen ueblicherweise moeglich).
      resetState();
    }
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!consentChecked) {
      setError(ERROR_LABEL.privacy_checkbox_required);
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await requestLeadPush({
        capture_session_id: captureSessionId,
        consent_checkbox_value: true,
        consent_text_version: CONSENT_TEXT_VERSION,
      });
      if (result.ok) {
        setSubmitted(true);
        // Router-Refresh damit der Server-Branch in PartnerClientWelcomeBlock
        // beim naechsten Render erkennt: Consent existiert → Card verschwindet.
        // MT-8 wird das durch eine Status-Card ersetzen.
        router.refresh();
        return;
      }
      // already_pushed = Race-Condition (paralleler Tab). Trotzdem als
      // Erfolg darstellen, weil der Lead tatsaechlich (frueher) gesendet
      // wurde. Refresh sorgt dafuer, dass die Card-Anzeige korrekt ist.
      if (result.error === "already_pushed") {
        setSubmitted(true);
        router.refresh();
        return;
      }
      setError(ERROR_LABEL[result.error] ?? GENERIC_ERROR);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        {submitted ? (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-emerald-100 p-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <DialogTitle>Wir haben Ihre Anfrage erhalten</DialogTitle>
              <DialogDescription className="text-slate-600">
                Strategaize meldet sich in den naechsten Werktagen bei Ihnen.
              </DialogDescription>
            </div>
            <DialogFooter className="sm:justify-center">
              <Button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="w-full sm:w-auto"
              >
                Schliessen
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Strategaize meldet sich</DialogTitle>
              <DialogDescription className="text-slate-600">
                Sie moechten direkt von Strategaize kontaktiert werden? Wir
                uebernehmen die Folgekommunikation und kuemmern uns um Ihre
                naechsten Schritte.
              </DialogDescription>
            </DialogHeader>

            <label className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                disabled={pending}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-brand-primary focus:ring-2 focus:ring-brand-primary"
                data-testid="ich-will-mehr-consent-checkbox"
                aria-describedby="ich-will-mehr-consent-text"
              />
              <span id="ich-will-mehr-consent-text" className="text-amber-900">
                {CONSENT_TEXT}{" "}
                <span className="font-medium">Pflicht.</span>
              </span>
            </label>

            {error ? (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={pending}
              >
                Abbrechen
              </Button>
              <Button
                type="submit"
                disabled={pending || !consentChecked}
                data-testid="ich-will-mehr-submit"
              >
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Anfrage senden
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
