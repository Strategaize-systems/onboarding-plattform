"use client";

// V9.1 SLC-V9.1-D MT-4 — DSGVO-Disclaimer-Modal (Pflicht-Bestaetigung vor Aktivierung).
//
// Zeigt den geteilten Disclaimer-Text (dsgvo-consent.ts), verlangt eine bewusste
// Checkbox-Bestaetigung und ruft dann confirmDsgvoDisclaimer(endpointId, version)
// auf. Erfolg setzt den Endpoint auf 'active' (DEC-209) und protokolliert den
// Consent unloeschbar (error_log + Endpoint-Row, 7-Jahre-Audit). Wording-Version
// wird mitgegeben, damit nachvollziehbar bleibt, welche Fassung bestaetigt wurde.

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  DSGVO_CONSENT_TEXT_VERSION,
  DSGVO_DISCLAIMER_TEXT,
  DSGVO_AUDIT_HINT,
} from "@/lib/bulk-email/dsgvo-consent";
import { confirmDsgvoDisclaimer } from "./actions";

interface DsgvoDisclaimerModalProps {
  endpointId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wird nach erfolgreicher Bestaetigung aufgerufen (Endpoint ist dann 'active'). */
  onConfirmed?: () => void;
}

export function DsgvoDisclaimerModal({
  endpointId,
  open,
  onOpenChange,
  onConfirmed,
}: DsgvoDisclaimerModalProps) {
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    if (!accepted) return;
    setError(null);
    startTransition(async () => {
      let result;
      try {
        result = await confirmDsgvoDisclaimer(endpointId, DSGVO_CONSENT_TEXT_VERSION);
      } catch (err) {
        setError((err as Error).message);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onConfirmed?.();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-primary" />
            DSGVO-Bestaetigung
          </DialogTitle>
          <DialogDescription>
            Bevor der Posteingang aktiviert wird, bestaetige bitte die Verarbeitung
            der weitergeleiteten Emails.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {DSGVO_DISCLAIMER_TEXT}
          </p>

          <div className="flex items-start gap-2">
            <Checkbox
              id="dsgvo-accept"
              checked={accepted}
              onCheckedChange={(v) => setAccepted(v === true)}
              disabled={isPending}
              className="mt-0.5"
            />
            <Label htmlFor="dsgvo-accept" className="text-sm font-normal leading-snug text-slate-700">
              Ich habe den Hinweis gelesen und bestaetige die Verarbeitung.
            </Label>
          </div>

          <p className="text-xs text-slate-400">{DSGVO_AUDIT_HINT}</p>

          {error && (
            <p className="flex items-start gap-1.5 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Abbrechen
          </Button>
          <Button type="button" onClick={confirm} disabled={!accepted || isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird gespeichert &hellip;
              </>
            ) : (
              "Bestaetigen & aktivieren"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
