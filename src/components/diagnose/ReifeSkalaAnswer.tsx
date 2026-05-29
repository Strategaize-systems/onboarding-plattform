"use client";

// V8 SLC-149 MT-2 — ReifeSkalaAnswer Client-Component (FEAT-064).
//
// 5-Punkt-Reifeskala-Komponente fuer Mandanten-Diagnose mit neutraler
// Grauskala (OQ-2-Entscheidung, siehe slices/SLC-149 line 52-67).
//   - 5 Buttons horizontal auf sm:+ / vertikal auf Mobile
//   - Touch-Target min-h-[44px] min-w-[60px]
//   - Custom-Tailwind statt shadcn-Button (Style-Note MT-2): 3 visuelle States
//     (default + hover + selected) die shadcn-Button-Variants nicht direkt liefern
//   - EditableText fuer Frage-Label (text_override-Konvention analog QuestionFlow)
//   - Helper-Modal-Trigger via shouldShowInfoIcon (Pattern aus SLC-138)
//   - Telemetry wird NICHT hier verkabelt — Parent (SLC-149 MT-4) wired auf
//     onChange-Callback
//
// Ref: src/components/diagnose/QuestionFlow.tsx (Component-Pattern),
//      src/components/diagnose/reife-skala-answer-logic.ts (Pure-Logic).

import { Info } from "lucide-react";
import { EditableText } from "@/components/text-override/EditableText";
import { shouldShowInfoIcon } from "./helper-text-modal-logic";
import {
  formatStufeLabel,
  scoreToStufe,
  type ScoreMapping,
  type Stufe,
} from "./reife-skala-answer-logic";

interface ReifeSkalaAnswerProps {
  templateSlug: string;
  questionKey: string;
  questionLabel: string;
  helperText?: string | null;
  examplesMd?: string | null;
  currentValue?: number | null;
  scoreMapping: ScoreMapping;
  onChange: (score: number, stufe: Stufe) => void;
  disabled?: boolean;
  onOpenHelper?: () => void;
}

const STUFEN: Stufe[] = [1, 2, 3, 4, 5];

export function ReifeSkalaAnswer({
  templateSlug,
  questionKey,
  questionLabel,
  helperText,
  examplesMd,
  currentValue,
  scoreMapping,
  onChange,
  disabled,
  onOpenHelper,
}: ReifeSkalaAnswerProps) {
  const selectedStufe =
    typeof currentValue === "number"
      ? scoreToStufe(currentValue, scoreMapping)
      : null;

  const showInfoIcon = shouldShowInfoIcon({ helperText, examplesMd });

  return (
    <fieldset
      className={`space-y-3 ${disabled ? "pointer-events-none opacity-60" : ""}`}
      aria-disabled={disabled || undefined}
    >
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

      <div className="flex flex-col gap-2 sm:flex-row">
        {STUFEN.map((stufe) => {
          const score = scoreMapping[stufe];
          const isSelected = selectedStufe === stufe;
          const baseClasses =
            "min-h-[44px] min-w-[60px] flex-1 rounded-md border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1";
          const stateClasses = isSelected
            ? "bg-brand-primary/10 border-brand-primary text-brand-primary-dark"
            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100";
          return (
            <button
              key={stufe}
              type="button"
              onClick={() => onChange(score, stufe)}
              aria-pressed={isSelected}
              className={`${baseClasses} ${stateClasses}`}
            >
              <span className="block text-xs text-slate-500">Stufe {stufe}</span>
              <span className="block text-sm">{formatStufeLabel(stufe)}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
