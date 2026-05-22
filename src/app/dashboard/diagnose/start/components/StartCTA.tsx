// V7.3 SLC-140 MT-2 — Start-CTA-Form mit Loading-Indicator.
//
// Client-Component (useFormStatus erfordert Client). Bindet Server-Action
// `startDiagnoseRun` ein, zeigt Loading-State beim Submit. EditableText fuer
// Button-Label + Privacy-Hint bleibt erhalten (SLC-137-Migration).
//
// Pattern: useFormStatus muss INNERHALB des <form> in einem Sub-Component
// stehen. SubmitButton wird im StartCTAForm-Wrapper aufgerufen.

"use client";

import { useFormStatus } from "react-dom";
import { EditableText } from "@/components/text-override/EditableText";
import { Button } from "@/components/ui/button";
import { startDiagnoseRun } from "../../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      className="w-full sm:w-auto"
    >
      {pending ? (
        <EditableText
          keyPath="diagnose.start.start_button_pending"
          defaultText="Diagnose wird gestartet …"
        />
      ) : (
        <EditableText
          keyPath="diagnose.start.start_button"
          defaultText="Diagnose starten"
        />
      )}
    </Button>
  );
}

export function StartCTA() {
  return (
    <form action={startDiagnoseRun} className="space-y-3">
      <SubmitButton />
      <p className="text-xs text-slate-500">
        <EditableText
          keyPath="diagnose.start.privacy_hint"
          defaultText="Keine menschliche Pruefung — Sie erhalten den Bericht direkt nach der Verdichtung. Strategaize speichert Ihre Antworten nur zur Generierung dieses Berichts."
          multiline
        />
      </p>
    </form>
  );
}
