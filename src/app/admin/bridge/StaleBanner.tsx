"use client";

import { AlertTriangle } from "lucide-react";
import { TriggerBridgeButton } from "./TriggerBridgeButton";

interface Props {
  captureSessionId: string;
}

export function StaleBanner({ captureSessionId }: Props) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1 space-y-1">
        <p className="text-sm font-semibold text-amber-900">
          Neue Bloecke wurden seit dem letzten Bridge-Lauf abgeschlossen.
        </p>
        <p className="text-xs text-amber-800">
          Starte den Bridge-Lauf erneut, um Vorschlaege auf den aktuellen Stand der Antworten zu basieren.
        </p>
      </div>
      <TriggerBridgeButton
        captureSessionId={captureSessionId}
        hasPreviousRun={true}
        size="sm"
      />
    </div>
  );
}
