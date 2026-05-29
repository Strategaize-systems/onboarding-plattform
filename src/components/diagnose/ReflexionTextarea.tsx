"use client";

// V8 SLC-149 MT-3 — Freitext-Textarea fuer V8-Reflexionsfragen (FEAT-064).
//
// Render-Component fuer `answer_schema_kind='reflexion_freitext'`.
//   - EditableText fuer Frage-Label (Reuse FEAT-056)
//   - Info-Icon + HelperTextModal-Trigger via Parent (Reuse FEAT-057)
//   - Zeichen-Counter mit getCounterState (ok/warning/error)
//   - Mobile-Layout: min-h-[120px] max-h-[300px] resize-y
//   - Auto-Save-Indikator (isSaving=true -> "Wird gespeichert...",
//     isSaving=false UND es wurde mind. einmal getippt -> "Gespeichert" + Check-Icon)
//   - Kein Debounce hier — Parent (QuestionFlow.tsx) haendelt debounced
//     Persistenz via saveDiagnoseDraft (analog choice_5-Path).
//   - Kein Score — Wert geht in capture_response.answer_text.
//   - Native maxLength bewusst NICHT gesetzt, damit Over-Typing den
//     Error-State (rot) sichtbar machen kann.
//
// Telemetry-Verkabelung passiert in MT-4 (QuestionFlow.tsx Render-Branch).

import { useState } from "react";
import { Check, Info } from "lucide-react";
import { EditableText } from "@/components/text-override/EditableText";
import { shouldShowInfoIcon } from "./helper-text-modal-logic";
import { getCounterState } from "./reflexion-textarea-logic";

interface ReflexionTextareaProps {
  templateSlug: string;
  questionKey: string;
  questionLabel: string;
  helperText?: string | null;
  examplesMd?: string | null;
  currentText?: string;
  maxChars?: number;
  onChange: (text: string) => void;
  isSaving?: boolean;
  disabled?: boolean;
  onOpenHelper?: () => void;
}

const COUNTER_CLASSES: Record<ReturnType<typeof getCounterState>, string> = {
  ok: "text-slate-500",
  warning: "text-amber-600",
  error: "text-red-600 font-medium",
};

export function ReflexionTextarea({
  templateSlug,
  questionKey,
  questionLabel,
  helperText,
  examplesMd,
  currentText,
  maxChars = 2000,
  onChange,
  isSaving = false,
  disabled = false,
  onOpenHelper,
}: ReflexionTextareaProps) {
  const value = currentText ?? "";
  const currentLength = value.length;
  const counterState = getCounterState(currentLength, maxChars);
  const counterClass = COUNTER_CLASSES[counterState];

  // "Gespeichert"-Indikator soll erst erscheinen, nachdem der User mindestens
  // einmal getippt hat. Verhindert "Gespeichert"-Anzeige beim initialen Render
  // wenn schon Text aus initialAnswers vorhanden ist und isSaving=false.
  const [hasTypedOnce, setHasTypedOnce] = useState(false);
  const showSavedIndicator = !isSaving && hasTypedOnce;

  const infoIconVisible = shouldShowInfoIcon({ helperText, examplesMd });

  return (
    <fieldset className={`space-y-2 ${disabled ? "opacity-60" : ""}`}>
      <legend className="text-sm font-medium text-slate-800">
        <EditableText
          keyPath={`template.${templateSlug}.question.${questionKey}.label`}
          defaultText={questionLabel}
          multiline
        />
        {infoIconVisible ? (
          <button
            type="button"
            onClick={onOpenHelper}
            aria-label="Erklaerung mit Beispielen anzeigen"
            className="ml-1.5 inline-flex h-5 w-5 -mb-0.5 items-center justify-center rounded-full text-slate-400 opacity-60 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </legend>

      <textarea
        value={value}
        onChange={(e) => {
          if (!hasTypedOnce) setHasTypedOnce(true);
          onChange(e.target.value);
        }}
        disabled={disabled}
        className="w-full rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors min-h-[120px] max-h-[300px] resize-y"
        aria-invalid={counterState === "error"}
        aria-describedby={`${questionKey}-counter`}
      />

      <div className="flex items-center justify-end gap-3 text-xs">
        {isSaving ? (
          <span className="text-slate-500">Wird gespeichert...</span>
        ) : showSavedIndicator ? (
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <Check className="h-3 w-3" />
            Gespeichert
          </span>
        ) : null}
        <div id={`${questionKey}-counter`} className={counterClass}>
          {currentLength} / {maxChars}
        </div>
      </div>
    </fieldset>
  );
}
