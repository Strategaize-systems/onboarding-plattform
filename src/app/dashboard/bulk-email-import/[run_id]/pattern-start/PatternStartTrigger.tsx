"use client";

// V9 SLC-167 MT-4 — Client-Component fuer Pattern-Start-Form + Error-Anzeige.
//
// Spec-Drift D-MT4-Extra-Client-Component — DOKUMENTIERT + AKZEPTIERT:
//   Slice-Spec L133-136 listet nur page.tsx + actions.ts + actions.test.ts.
//   Wir brauchen aber eine kleine Client-Component, um Server-Action-Errors
//   (Pre-Approval-Required, Cap-Exceeded) ohne Round-Trip-Reload anzuzeigen.
//   Pattern-Reuse aus SLC-166 MT-3 FilterReviewClient.tsx — gleicher Trade-off,
//   gleiche Loesung.
//
// Two-Step-UX:
//   - Estimate <= Pre-Approval-Schwelle: Direkt-Button "Pattern-Extraktion starten".
//   - Estimate > Pre-Approval-Schwelle: Zwei-Klick-Confirm
//     (1. Klick: Cost-Anzeige + Inline-Confirmation-Box,
//      2. Klick: "Ja, fortfahren mit X EUR" sendet preApprovalGranted=true).

import { useState, useTransition } from "react";
import { Loader2, AlertCircle, Euro } from "lucide-react";

import { startPatternExtraction } from "./actions";

interface PatternStartTriggerProps {
  bulkRunId: string;
  estimateEur: number;
  preApprovalThresholdEur: number;
  /** Wenn true (z.B. status != 'thread_redacted' oder Cap-Block), Button wird disabled. */
  disabled?: boolean;
  /** Optionaler Hinweis, warum disabled. */
  disabledReason?: string;
}

export function PatternStartTrigger({
  bulkRunId,
  estimateEur,
  preApprovalThresholdEur,
  disabled,
  disabledReason,
}: PatternStartTriggerProps) {
  const requiresPreApproval = estimateEur > preApprovalThresholdEur;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(preApprovalGranted: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await startPatternExtraction(bulkRunId, preApprovalGranted);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Bei Erfolg revalidatePath in der Action triggert Re-Render der Detail-
      // Page; window.location.href bringt den User zur Live-Progress-View.
      window.location.href = `/dashboard/bulk-email-import/${bulkRunId}`;
    });
  }

  if (disabled) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-600">
          {disabledReason ?? "Start derzeit nicht moeglich."}
        </p>
      </div>
    );
  }

  if (requiresPreApproval && !confirmOpen) {
    return (
      <div className="space-y-3">
        {error ? <ErrorBanner message={error} /> : null}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90 disabled:opacity-50"
          data-testid="pattern-start-open-confirm"
        >
          <Euro className="h-4 w-4" />
          Pattern-Extraktion starten ({formatEuro(estimateEur)})
        </button>
        <p className="text-xs text-slate-500">
          Erwartete Kosten ueberschreiten die Pre-Approval-Schwelle ({formatEuro(preApprovalThresholdEur)}). Bestaetigung in 2 Schritten.
        </p>
      </div>
    );
  }

  if (requiresPreApproval && confirmOpen) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        {error ? <ErrorBanner message={error} className="mb-3" /> : null}
        <p className="text-sm font-semibold text-amber-900">
          Bestaetigung erforderlich
        </p>
        <p className="mt-1 text-sm text-amber-800">
          Erwartete Kosten: <strong>{formatEuro(estimateEur)}</strong>. Pre-Approval-Schwelle: {formatEuro(preApprovalThresholdEur)}.
          Mit Klick auf &quot;Ja, fortfahren&quot; wird der Bedrock-Sonnet-Worker gestartet
          und die Kosten werden Tenant-Monatscap angerechnet.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            data-testid="pattern-start-confirm"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Euro className="h-4 w-4" />
            )}
            Ja, fortfahren mit {formatEuro(estimateEur)}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmOpen(false);
              setError(null);
            }}
            disabled={isPending}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  // Direkt-Start (estimate unter Pre-Approval-Schwelle)
  return (
    <div className="space-y-3">
      {error ? <ErrorBanner message={error} /> : null}
      <button
        type="button"
        onClick={() => submit(false)}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90 disabled:opacity-50"
        data-testid="pattern-start-direct"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Euro className="h-4 w-4" />
        )}
        Pattern-Extraktion starten ({formatEuro(estimateEur)})
      </button>
    </div>
  );
}

function ErrorBanner({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 ${className ?? ""}`}
      data-testid="pattern-start-error"
    >
      <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
      <p className="text-sm text-red-800">{message}</p>
    </div>
  );
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}
