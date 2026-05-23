// V7.3 SLC-140 MT-4 — QuickActionRing fuer Bericht-Page.
//
// Konsolidiert die bisher als zwei separate Buttons gerenderten Aktionen
// (Print, Email-Versand) plus die optional verfuegbare "Ich will mehr"-Aktion
// (bisher als Hinweis-Box im Bericht). Re-Run ist V1-out-of-scope (siehe
// SLC-140 Slice Spec MT-4 "Re-Run-optional → hide bei nur 3 Aktionen").
//
// Wiring (R-3 Mitigation per SLC-140 Slice Spec):
//   - onEmailClick MUSS setEmailModalOpen(true) im Parent triggern, damit der
//     SendReportByEmailModal aus SLC-141 MT-5 1:1 weiterverwendet wird.
//   - onPrintClick triggert window.print() (existierender Pfad aus SLC-105).
//   - onIchWillMehrClick (optional) oeffnet den IchWillMehrModal aus SLC-106.
//
// Per [[feedback-look-alignment-needs-page-level-scope]] Page 3 Checks 6-9.

"use client";

import { Mail, Printer, Sparkles } from "lucide-react";
import { EditableText } from "@/components/text-override/EditableText";

interface QuickActionRingProps {
  onEmailClick: () => void;
  onPrintClick: () => void;
  /** Falls undefined: "Ich will mehr"-Slot wird nicht gerendert (z.B. Lead-Push schon gesendet). */
  onIchWillMehrClick?: () => void;
}

export function QuickActionRing({
  onEmailClick,
  onPrintClick,
  onIchWillMehrClick,
}: QuickActionRingProps) {
  return (
    <section
      aria-label="Bericht-Aktionen"
      className="rounded-lg border border-slate-200 bg-white p-5 print:hidden"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-center">
        <ActionButton
          onClick={onEmailClick}
          icon={<Mail className="h-5 w-5" />}
          labelKey="diagnose.bericht.action.email"
          defaultLabel="Per E-Mail senden"
          accent="brand"
          testId="bericht-action-email"
        />
        <ActionButton
          onClick={onPrintClick}
          icon={<Printer className="h-5 w-5" />}
          labelKey="diagnose.bericht.action.print"
          defaultLabel="Bericht drucken"
          accent="neutral"
          testId="bericht-action-print"
        />
        {onIchWillMehrClick ? (
          <ActionButton
            onClick={onIchWillMehrClick}
            icon={<Sparkles className="h-5 w-5" />}
            labelKey="diagnose.bericht.action.ich_will_mehr"
            defaultLabel="Ich will mehr"
            accent="brand"
            testId="bericht-action-ich-will-mehr"
          />
        ) : null}
      </div>
    </section>
  );
}

interface ActionButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  labelKey: string;
  defaultLabel: string;
  accent: "brand" | "neutral";
  testId: string;
}

function ActionButton({
  onClick,
  icon,
  labelKey,
  defaultLabel,
  accent,
  testId,
}: ActionButtonProps) {
  const iconWrapClasses =
    accent === "brand"
      ? "bg-brand-primary/10 text-brand-primary group-hover:bg-brand-primary group-hover:text-white"
      : "bg-slate-100 text-slate-600 group-hover:bg-slate-200 group-hover:text-slate-800";
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="group flex flex-1 items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand-primary/50 hover:bg-brand-primary/5 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 sm:flex-col sm:items-center sm:gap-2 sm:p-4 sm:text-center"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${iconWrapClasses}`}
      >
        {icon}
      </span>
      <span className="text-sm font-medium text-slate-800">
        <EditableText keyPath={labelKey} defaultText={defaultLabel} />
      </span>
    </button>
  );
}
