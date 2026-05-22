"use client";

// V7.2 SLC-141 MT-5 (FEAT-060) — Modal-UI fuer Diagnose-Bericht Email-Versand.
// Native HTML Form + useTransition + Server Action (Memory feedback_native_html_form_pattern).
// Pattern 1:1 portiert aus IchWillMehrModal.tsx (V6 SLC-106 MT-7) — gleiches
// Dialog-UI, gleiche useTransition-Form-Mechanik, gleiches ERROR_LABEL-Mapping.
// Per User-Default Option b (Handoff 2026-05-22): Interim-Modal-Open via
// "Bericht per E-Mail senden"-Button direkt in BerichtRenderer, kein
// QuickActionRing-Wait auf SLC-140.

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendDiagnoseReportByEmail } from "@/app/dashboard/diagnose/[capture_session_id]/bericht/actions";
import {
  CUSTOM_MESSAGE_MAX_LEN,
  ERROR_LABELS,
  buildServerActionInput,
  customMessageRemaining,
  formatSuccessToast,
  hasAtLeastOneRecipient,
  isCustomMessageOverLimit,
  mapErrorToLabel,
} from "./send-report-modal-logic";

interface SendReportByEmailModalProps {
  captureSessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendReportByEmailModal({
  captureSessionId,
  open,
  onOpenChange,
}: SendReportByEmailModalProps) {
  const [recipientToSelf, setRecipientToSelf] = useState(true);
  const [recipientToPartner, setRecipientToPartner] = useState(false);
  const [additionalEmail, setAdditionalEmail] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const formState = {
    recipientToSelf,
    recipientToPartner,
    additionalEmail,
    customMessage,
  };
  const atLeastOneRecipient = hasAtLeastOneRecipient(formState);
  const remaining = customMessageRemaining(formState);
  const customMessageOver = isCustomMessageOverLimit(formState);

  function resetState() {
    setRecipientToSelf(true);
    setRecipientToPartner(false);
    setAdditionalEmail("");
    setCustomMessage("");
    setError(null);
    setSubmitted(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      resetState();
    }
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!atLeastOneRecipient) {
      setError(ERROR_LABELS.no_recipients);
      return;
    }
    if (customMessageOver) {
      setError(ERROR_LABELS.custom_message_too_long);
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await sendDiagnoseReportByEmail(
        buildServerActionInput(captureSessionId, formState),
      );

      if (result.ok) {
        setSubmitted(true);
        toast.success(formatSuccessToast(result.recipientsCount));
        return;
      }

      const label = mapErrorToLabel(result.error);
      setError(label);
      toast.error(label);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        {submitted ? (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-emerald-100 p-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <DialogTitle>Bericht versendet</DialogTitle>
              <DialogDescription className="text-slate-600">
                Die E-Mail mit dem Bericht-PDF wurde an die ausgewaehlten
                Empfaenger zugestellt.
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
              <DialogTitle>Bericht per E-Mail senden</DialogTitle>
              <DialogDescription className="text-slate-600">
                Der Bericht wird als PDF-Anhang versendet. Sie koennen mehrere
                Empfaenger auswaehlen und eine kurze persoenliche Nachricht
                ergaenzen.
              </DialogDescription>
            </DialogHeader>

            <fieldset className="space-y-3" disabled={pending}>
              <legend className="text-sm font-medium text-slate-700">
                Empfaenger
              </legend>

              <label className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-white p-3 text-sm">
                <input
                  type="checkbox"
                  checked={recipientToSelf}
                  onChange={(e) => setRecipientToSelf(e.target.checked)}
                  disabled={pending}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-2 focus:ring-brand-primary"
                  data-testid="send-report-recipient-self"
                />
                <span className="text-slate-700">
                  An mich selbst
                  <span className="block text-xs text-slate-500">
                    Sie erhalten den Bericht an Ihre eigene E-Mail-Adresse.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-white p-3 text-sm">
                <input
                  type="checkbox"
                  checked={recipientToPartner}
                  onChange={(e) => setRecipientToPartner(e.target.checked)}
                  disabled={pending}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-2 focus:ring-brand-primary"
                  data-testid="send-report-recipient-partner"
                />
                <span className="text-slate-700">
                  An meinen Partner-Steuerberater
                  <span className="block text-xs text-slate-500">
                    Wird als CC mitgesendet, wenn ein Partner zugeordnet ist.
                  </span>
                </span>
              </label>

              <div className="space-y-1.5">
                <Label htmlFor="send-report-additional-email">
                  Zusaetzliche E-Mail-Adresse{" "}
                  <span className="text-slate-400">(optional)</span>
                </Label>
                <Input
                  id="send-report-additional-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder="z.B. partner@beispiel.de"
                  value={additionalEmail}
                  onChange={(e) => setAdditionalEmail(e.target.value)}
                  disabled={pending}
                  data-testid="send-report-additional-email"
                />
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="send-report-custom-message">
                Persoenliche Nachricht{" "}
                <span className="text-slate-400">(optional)</span>
              </Label>
              <Textarea
                id="send-report-custom-message"
                rows={4}
                placeholder="Diese Nachricht erscheint am Anfang der E-Mail."
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                disabled={pending}
                data-testid="send-report-custom-message"
              />
              <p
                className={`text-xs ${
                  customMessageOver ? "text-red-600" : "text-slate-400"
                }`}
                aria-live="polite"
              >
                {customMessageOver
                  ? `Nachricht ist um ${Math.abs(remaining)} Zeichen zu lang.`
                  : `${remaining} von ${CUSTOM_MESSAGE_MAX_LEN} Zeichen verbleibend.`}
              </p>
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                data-testid="send-report-error"
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
                disabled={
                  pending || !atLeastOneRecipient || customMessageOver
                }
                data-testid="send-report-submit"
              >
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                {pending ? "Versende…" : "Bericht senden"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
