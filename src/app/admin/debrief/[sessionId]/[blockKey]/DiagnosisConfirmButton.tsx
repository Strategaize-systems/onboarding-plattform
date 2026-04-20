"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { confirmDiagnosis } from "./diagnosis-actions";

interface DiagnosisConfirmButtonProps {
  diagnosisId: string;
  isConfirmed: boolean;
  onConfirmed: () => void;
}

export function DiagnosisConfirmButton({
  diagnosisId,
  isConfirmed,
  onConfirmed,
}: DiagnosisConfirmButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (isConfirmed) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700">
        <CheckCircle2 className="h-4 w-4" />
        Diagnose bestätigt
      </div>
    );
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmDiagnosis(diagnosisId);
      if (!result.success) {
        setError(result.error ?? "Bestätigung fehlgeschlagen");
        return;
      }
      onConfirmed();
    });
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleConfirm}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        {isPending ? "Wird bestätigt…" : "Diagnose bestätigen"}
      </button>
      <p className="text-xs text-slate-500">
        Nach Bestätigung wird die SOP-Generierung freigeschaltet
      </p>
      {error && (
        <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
