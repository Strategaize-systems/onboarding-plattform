"use client";

// V8 SLC-149 MT-1 — Hygiene-Antwort-Pills "Ja / Teilweise / Nein" (FEAT-065).
//
// 3-Pill-Komponente fuer Hygiene-Fragen (answer_schema_kind='hygiene_yes_partial_no').
// Neutrale Visualisierung pro OQ-2 (kein rot/amber/gruen-Farb-Signal pro Pill —
// nur Selected-Highlight in brand-primary). Toggle-Off bei Re-Klick via
// getNextValue() (siehe hygiene-answer-pills-logic.ts).
//
// Style-Note (SLC-149 MT-1): Custom-Tailwind statt shadcn-<Button>, weil
// 2 visuelle States (default-neutral + selected-highlight) shadcn-Button-Variants
// nicht direkt liefern. min-h-[44px] + min-w-[80px] Touch-Target (DEC-151) explizit.
//
// Telemetry: KEIN telemetry-import hier — Parent (QuestionFlow.tsx in MT-4)
// verkabelt diagnose_event in onChange-Callback (Spec MT-5 separation).
//
// Pattern referenziert: src/components/diagnose/QuestionFlow.tsx (EditableText
// keyPath + Info-icon button + helper-modal-trigger).

import { Info } from "lucide-react";
import { EditableText } from "@/components/text-override/EditableText";
import { shouldShowInfoIcon } from "./helper-text-modal-logic";
import {
  getNextValue,
  type HygieneValue,
} from "./hygiene-answer-pills-logic";

interface HygieneAnswerPillsProps {
  templateSlug: string;
  questionKey: string;
  questionLabel: string;
  helperText?: string | null;
  examplesMd?: string | null;
  currentValue?: HygieneValue | null;
  onChange: (value: HygieneValue | null) => void;
  disabled?: boolean;
  onOpenHelper?: () => void;
}

const PILL_OPTIONS: { value: HygieneValue; defaultLabel: string }[] = [
  { value: "ja", defaultLabel: "Ja" },
  { value: "teilweise", defaultLabel: "Teilweise" },
  { value: "nein", defaultLabel: "Nein" },
];

export function HygieneAnswerPills({
  templateSlug,
  questionKey,
  questionLabel,
  helperText,
  examplesMd,
  currentValue,
  onChange,
  disabled,
  onOpenHelper,
}: HygieneAnswerPillsProps) {
  const showInfoIcon = shouldShowInfoIcon({ helperText, examplesMd });

  function handlePillClick(clicked: HygieneValue) {
    if (disabled) return;
    onChange(getNextValue(currentValue, clicked));
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-slate-800">
        <EditableText
          keyPath={`template.${templateSlug}.question.${questionKey}.label`}
          defaultText={questionLabel}
          multiline
        />
        {showInfoIcon && onOpenHelper ? (
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
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        {PILL_OPTIONS.map((option) => {
          const isSelected = currentValue === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handlePillClick(option.value)}
              aria-pressed={isSelected}
              aria-disabled={disabled ? true : undefined}
              className={[
                "min-h-[44px] min-w-[80px] rounded-md border px-4 py-2 transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1",
                isSelected
                  ? "bg-brand-primary/10 border-brand-primary text-brand-primary-dark"
                  : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100",
                disabled ? "pointer-events-none opacity-60" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <EditableText
                keyPath={`diagnose.hygiene.pill.${option.value}`}
                defaultText={option.defaultLabel}
              />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
