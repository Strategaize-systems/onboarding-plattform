// V7.3 SLC-140 MT-5 — PendingState fuer bericht-pending-Page (KI verarbeitet).
//
// Wiederverwendbarer Visual-Pending-State: Spinner-Badge + Title + Beschreibung
// mit Estimated-Time + optionaler Children-Slot (fuer BerichtPendingPoller
// oder andere Status-Trigger) + Info-Hinweis.
//
// Pflicht-Strings via EditableText. Strings haben Default-Text, der Hook
// faellt graceful auf Default zurueck wenn kein TextOverrideProvider gesetzt
// ist (siehe use-text-override.ts).

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { EditableText } from "@/components/text-override/EditableText";

interface PendingStateProps {
  titleKeyPath: string;
  titleDefault: string;
  descriptionKeyPath: string;
  descriptionDefault: string;
  hintKeyPath: string;
  hintDefault: string;
  /** Optional: Poller, Progress-Counter oder weitere Status-Indikatoren. */
  children?: ReactNode;
}

export function PendingState({
  titleKeyPath,
  titleDefault,
  descriptionKeyPath,
  descriptionDefault,
  hintKeyPath,
  hintDefault,
  children,
}: PendingStateProps) {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary/10">
          <Loader2
            className="h-6 w-6 animate-spin text-brand-primary"
            aria-hidden="true"
          />
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="text-lg font-semibold text-slate-900">
            <EditableText keyPath={titleKeyPath} defaultText={titleDefault} />
          </h3>
          <p className="text-sm text-slate-600">
            <EditableText
              keyPath={descriptionKeyPath}
              defaultText={descriptionDefault}
              multiline
            />
          </p>
          {children ? <div className="pt-3">{children}</div> : null}
          <p className="pt-2 text-xs text-slate-400">
            <EditableText
              keyPath={hintKeyPath}
              defaultText={hintDefault}
              multiline
            />
          </p>
        </div>
      </div>
    </div>
  );
}
