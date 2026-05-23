// V7.3 SLC-140 MT-3 — Auto-Save Pulse-Indicator.
//
// Drei sichtbare States:
//   - idle (noch keine Antwort gespeichert) → unsichtbar.
//   - saving (Server-Action laeuft) → Spinner + "Speichere …".
//   - saved (Antwort persistiert, !isSaving) → Check + "Gespeichert".
//
// Per [[feedback-look-alignment-needs-page-level-scope]] Page 2 Check 7:
// "Auto-Save-Indicator sichtbar nach Antwort-Klick (~1-2s Pulse)". Der
// Component rendert nur, wenn der Parent bereits mindestens eine Antwort
// erfasst hat (answeredCount > 0), damit der initial-leere Zustand keinen
// irrefuehrenden "Gespeichert"-Label zeigt.

import { Check, Loader2 } from "lucide-react";
import { EditableText } from "@/components/text-override/EditableText";

interface AutoSaveIndicatorProps {
  isSaving: boolean;
  answeredCount: number;
}

export function AutoSaveIndicator({
  isSaving,
  answeredCount,
}: AutoSaveIndicatorProps) {
  if (answeredCount === 0 && !isSaving) {
    return null;
  }
  if (isSaving) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        <EditableText
          keyPath="diagnose.run.saving_label"
          defaultText="Speichere …"
        />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
      <Check className="h-3 w-3" />
      <EditableText
        keyPath="diagnose.run.saved_label"
        defaultText="Gespeichert"
      />
    </span>
  );
}
