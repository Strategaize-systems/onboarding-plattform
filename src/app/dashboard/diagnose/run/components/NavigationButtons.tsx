// V7.3 SLC-140 MT-3 — Zurueck/Weiter-Buttons als sticky Bottom-Bar.
//
// Konsolidiert die zwei Navigations-Aktionen der Run-Page:
//   - Zurueck → linkt zurueck auf /dashboard/diagnose/start (sekundaer).
//   - Weiter (= Submit Diagnose) → triggert submitDiagnoseRun (primaer).
//
// Submit-Button bleibt disabled bis alle Fragen beantwortet sind. Der
// AutoSaveIndicator wird vom Parent oberhalb dieser Bar gerendert
// (separation of concerns).

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableText } from "@/components/text-override/EditableText";

interface NavigationButtonsProps {
  backHref: string;
  disabled: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
  children?: ReactNode;
}

export function NavigationButtons({
  backHref,
  disabled,
  isSubmitting,
  onSubmit,
  children,
}: NavigationButtonsProps) {
  return (
    <div className="sticky bottom-4 z-10 rounded-lg border border-slate-200 bg-white p-4 shadow-md">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-slate-600 transition-colors hover:text-brand-primary focus:text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 rounded"
          >
            <ArrowLeft className="h-4 w-4" />
            <EditableText
              keyPath="diagnose.run.back_link"
              defaultText="Zurueck zur Uebersicht"
            />
          </Link>
          {children}
        </div>
        <Button
          type="button"
          size="lg"
          onClick={onSubmit}
          disabled={disabled || isSubmitting}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <EditableText
                keyPath="diagnose.run.submitting_label"
                defaultText="Sende ab..."
              />
            </>
          ) : (
            <EditableText
              keyPath="diagnose.run.submit_button"
              defaultText="Diagnose abschicken"
            />
          )}
        </Button>
      </div>
    </div>
  );
}
