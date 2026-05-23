"use client";

// V6.3 SLC-105 MT-6 — Mandanten-Diagnose Frage-Flow Client-Component.
// V7.3 SLC-140 MT-3 — Layout-Wrap mit ProgressIndicator (top sticky) +
//   AnswerOptionCard (statt Plain-Radio) + AutoSaveIndicator + NavigationButtons.
//   Helper-Modal-Verkabelung (SLC-138) + Telemetry (SLC-139) UNVERAENDERT.
//
// Linearer Frage-Flow ohne Block-Submit-Granularitaet:
//   - 24 Fragen (6 Bloecke x 4) als linear scrollbare Liste mit
//     Block-Header pro Gruppe (visuelle Orientierung, keine technische
//     Trennung).
//   - Pro Frage: AnswerOptionCard-Liste mit den `score_mapping[].label`-Strings
//     EXAKT — das schuetzt `computeBlockScores` vor R-V63-2 String-Drift.
//   - useTransition-pattern (siehe feedback_native_html_form_pattern.md)
//     fuer Server-Action-Calls ohne react-hook-form.
//   - Auto-Save pro Antwort via `saveDiagnoseDraft` (optimistic UI: lokaler
//     State fuehrt, Server-Action faengt nur Persistenz-Fehler ab).
//   - Submit-Button erscheint sobald alle 24 Antworten gesetzt sind.
//
// Ref: docs/ARCHITECTURE.md V6.3 Phase 2, feedback_native_html_form_pattern.md.

import { useRef, useState, useTransition, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Info } from "lucide-react";
import type { TemplateBlock } from "@/workers/condensation/light-pipeline";
import { saveDiagnoseDraft, submitDiagnoseRun } from "@/app/dashboard/diagnose/actions";
import { EditableText } from "@/components/text-override/EditableText";
import { HelperTextModal } from "./HelperTextModal";
import { shouldShowInfoIcon } from "./helper-text-modal-logic";
import { useDiagnoseTelemetry } from "./DiagnoseTelemetryProvider";
import { ProgressIndicator } from "@/app/dashboard/diagnose/run/components/ProgressIndicator";
import { AnswerOptionCard } from "@/app/dashboard/diagnose/run/components/AnswerOptionCard";
import { AutoSaveIndicator } from "@/app/dashboard/diagnose/run/components/AutoSaveIndicator";
import { NavigationButtons } from "@/app/dashboard/diagnose/run/components/NavigationButtons";

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
  // V7.1 SLC-138 (FEAT-057): aktiv geoeffneter Helper-Text-Modal-State.
  const [helperOpenKey, setHelperOpenKey] = useState<string | null>(null);
  // V7.2 SLC-139 (FEAT-058): Telemetry-Hook + question_start-Dedup.
  // Set wird per useRef gehalten, damit re-renders die Set-Identitaet behalten
  // und kein useEffect+setState getriggert wird (siehe feedback_react19_use_mounted_pattern).
  const telemetry = useDiagnoseTelemetry();
  const startedQuestionsRef = useRef<Set<string>>(new Set(Object.keys(initialAnswers)));

  const helperFor = useMemo(() => {
    if (!helperOpenKey) return null;
    for (const block of blocks) {
      const q = block.questions.find((it) => it.key === helperOpenKey);
      if (q) return q;
    }
    return null;
  }, [helperOpenKey, blocks]);

  const totalQuestions = useMemo(
    () => blocks.reduce((acc, b) => acc + (b.questions?.length ?? 0), 0),
    [blocks],
  );
  const answeredCount = Object.keys(answers).filter(
    (k) => typeof answers[k] === "string" && answers[k].length > 0,
  ).length;
  const allAnswered = answeredCount === totalQuestions;

  function handleAnswer(questionKey: string, value: string) {
    // V7.2 SLC-139: erste Interaktion mit einer Frage emittiert question_start,
    // jede Antwort-Aenderung danach question_answer.
    if (!startedQuestionsRef.current.has(questionKey)) {
      startedQuestionsRef.current.add(questionKey);
      telemetry.trackEvent({ type: "question_start", questionKey });
    }
    telemetry.trackEvent({ type: "question_answer", questionKey, payload: { value } });

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
      <ProgressIndicator answered={answeredCount} total={totalQuestions} />

      {blocks.map((block, blockIndex) => (
        <Card key={block.key}>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              <EditableText
                keyPath="diagnose.run.block_prefix"
                defaultText="Baustein"
              />{" "}
              {blockIndex + 1}:{" "}
              <EditableText
                keyPath={`template.partner_diagnostic.block.${block.key}.title`}
                defaultText={block.title}
              />
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              <EditableText
                keyPath={`template.partner_diagnostic.block.${block.key}.intro`}
                defaultText={block.intro}
                multiline
              />
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {block.questions.map((question, qIndex) => {
              const value = answers[question.key];
              const errorMsg = saveErrors[question.key];
              return (
                <fieldset key={question.key} className="space-y-3">
                  <legend className="text-sm font-medium text-slate-800">
                    <EditableText
                      keyPath="diagnose.run.question_prefix"
                      defaultText="Frage"
                    />{" "}
                    {blockIndex + 1}.{qIndex + 1}:{" "}
                    <EditableText
                      keyPath={`template.partner_diagnostic.question.${question.key}.label`}
                      defaultText={question.text}
                      multiline
                    />
                    {shouldShowInfoIcon({
                      helperText: question.helper_text,
                      examplesMd: question.examples_md,
                    }) ? (
                      <button
                        type="button"
                        onClick={() => setHelperOpenKey(question.key)}
                        aria-label="Erklaerung mit Beispielen anzeigen"
                        className="ml-1.5 inline-flex h-5 w-5 -mb-0.5 items-center justify-center rounded-full text-slate-400 opacity-60 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </legend>
                  <div className="space-y-2">
                    {question.score_mapping.map((option) => (
                      <AnswerOptionCard
                        key={option.label}
                        name={question.key}
                        label={option.label}
                        selected={value === option.label}
                        onSelect={() => handleAnswer(question.key, option.label)}
                      />
                    ))}
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

      <div>
        <NavigationButtons
          backHref="/dashboard/diagnose/start"
          disabled={!allAnswered}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
        >
          <AutoSaveIndicator
            isSaving={isSaving}
            answeredCount={answeredCount}
          />
        </NavigationButtons>
        {submitError ? (
          <p className="mt-3 flex items-center gap-1 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {submitError}
          </p>
        ) : null}
      </div>

      {/* V7.1 SLC-138 (FEAT-057): geteilter Helper-Modal, wird via helperOpenKey gesteuert. */}
      {helperFor ? (
        <HelperTextModal
          open={true}
          onClose={() => setHelperOpenKey(null)}
          templateSlug="partner_diagnostic"
          questionKey={helperFor.key}
          questionLabel={helperFor.text}
          helperTextDefault={helperFor.helper_text ?? null}
          examplesMdDefault={helperFor.examples_md ?? null}
          captureSessionId={sessionId}
        />
      ) : null}
    </div>
  );
}
