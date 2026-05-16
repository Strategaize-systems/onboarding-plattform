"use client";

// V6.3 SLC-105 MT-6 — Mandanten-Diagnose Frage-Flow Client-Component.
//
// Linearer Frage-Flow ohne Block-Submit-Granularitaet:
//   - 24 Fragen (6 Bloecke x 4) als linear scrollbare Liste mit
//     Block-Header pro Gruppe (visuelle Orientierung, keine technische
//     Trennung).
//   - Pro Frage: Radio-Button-Liste mit den `score_mapping[].label`-Strings
//     EXAKT — das schuetzt `computeBlockScores` vor R-V63-2 String-Drift.
//   - useTransition-pattern (siehe feedback_native_html_form_pattern.md)
//     fuer Server-Action-Calls ohne react-hook-form.
//   - Auto-Save pro Antwort via `saveDiagnoseDraft` (optimistic UI: lokaler
//     State fuehrt, Server-Action faengt nur Persistenz-Fehler ab).
//   - Submit-Button erscheint sobald alle 24 Antworten gesetzt sind.
//
// Ref: docs/ARCHITECTURE.md V6.3 Phase 2, feedback_native_html_form_pattern.md.

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, Check } from "lucide-react";
import type { TemplateBlock } from "@/workers/condensation/light-pipeline";
import { saveDiagnoseDraft, submitDiagnoseRun } from "@/app/dashboard/diagnose/actions";

interface QuestionFlowProps {
  sessionId: string;
  blocks: TemplateBlock[];
  initialAnswers: Record<string, string>;
}

export function QuestionFlow({
  sessionId,
  blocks,
  initialAnswers,
}: QuestionFlowProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  const totalQuestions = useMemo(
    () => blocks.reduce((acc, b) => acc + (b.questions?.length ?? 0), 0),
    [blocks],
  );
  const answeredCount = Object.keys(answers).filter(
    (k) => typeof answers[k] === "string" && answers[k].length > 0,
  ).length;
  const allAnswered = answeredCount === totalQuestions;

  function handleAnswer(questionKey: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionKey]: value }));
    setSaveErrors((prev) => {
      const next = { ...prev };
      delete next[questionKey];
      return next;
    });
    startSaving(async () => {
      const result = await saveDiagnoseDraft(sessionId, questionKey, value);
      if (result.error) {
        setSaveErrors((prev) => ({
          ...prev,
          [questionKey]: result.error ?? "Speicherfehler",
        }));
      }
    });
  }

  function handleSubmit() {
    setSubmitError(null);
    startSubmit(async () => {
      const result = await submitDiagnoseRun(sessionId);
      if (result?.error) {
        setSubmitError(result.error);
      }
      // Bei Erfolg redirected die Server-Action — kein Client-Side-Routing noetig.
    });
  }

  return (
    <div className="space-y-8">
      <ProgressBar answered={answeredCount} total={totalQuestions} />

      {blocks.map((block, blockIndex) => (
        <Card key={block.key}>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              Baustein {blockIndex + 1}: {block.title}
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">{block.intro}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {block.questions.map((question, qIndex) => {
              const value = answers[question.key];
              const errorMsg = saveErrors[question.key];
              return (
                <fieldset key={question.key} className="space-y-3">
                  <legend className="text-sm font-medium text-slate-800">
                    Frage {blockIndex + 1}.{qIndex + 1}: {question.text}
                  </legend>
                  <div className="space-y-2">
                    {question.score_mapping.map((option) => {
                      const isSelected = value === option.label;
                      return (
                        <label
                          key={option.label}
                          className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${
                            isSelected
                              ? "border-brand-primary bg-brand-primary/5"
                              : "border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name={question.key}
                            value={option.label}
                            checked={isSelected}
                            onChange={() =>
                              handleAnswer(question.key, option.label)
                            }
                            className="mt-1"
                          />
                          <span className="flex-1 text-slate-700">
                            {option.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {errorMsg ? (
                    <p className="flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle className="h-3 w-3" />
                      {errorMsg}
                    </p>
                  ) : null}
                </fieldset>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <div className="sticky bottom-4 z-10 rounded-lg border border-slate-200 bg-white p-4 shadow-md">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            {allAnswered ? (
              <span className="flex items-center gap-1 text-emerald-700">
                <Check className="h-4 w-4" />
                Alle 24 Fragen beantwortet
              </span>
            ) : (
              <span>
                {answeredCount} von {totalQuestions} beantwortet
              </span>
            )}
            {isSaving ? (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Speichere...
              </span>
            ) : null}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!allAnswered || isSubmitting}
            type="button"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sende ab...
              </>
            ) : (
              "Diagnose abschicken"
            )}
          </Button>
        </div>
        {submitError ? (
          <p className="mt-3 flex items-center gap-1 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {submitError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ProgressBar({ answered, total }: { answered: number; total: number }) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Fortschritt</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full bg-brand-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
