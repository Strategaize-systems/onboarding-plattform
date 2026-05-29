"use client";

// V8 SLC-149 MT-4 — Mandanten-Report-Teaser Frage-Flow Client-Component.
//
// V8-Render-Komponente fuer `template.metadata.usage_kind='mandanten_report_teaser_v1'`.
// V6.3-Bestand (`QuestionFlow.tsx` + `AnswerOptionCard`) bleibt STRIKT
// unveraendert — Run-Page (page.tsx) entscheidet auf usage_kind welche
// Component gerendert wird.
//
// V8-Block-Struktur (V8TemplateBlock):
//   - modul_id (M0..M10), name, answer_schema_kind am Block-Level
//   - score_mapping nur auf reife_skala_5-Bloecken (Map "1".."5" → 0/2/5/8/10)
//   - questions[]: { frage_id, text, subsection? }
//
// Antwort-Format in capture_session.answers (Record<frage_id, string>):
//   - hygiene_yes_partial_no → "ja" | "teilweise" | "nein"
//   - reife_skala_5          → "1" | "2" | "3" | "4" | "5" (Stufe-String)
//   - reflexion_freitext     → freier Text
//
// Submit-Logic:
//   - Required: alle hygiene + alle reife_skala Fragen beantwortet
//   - Optional: M10 reflexion (kann leer bleiben, sui-engine.aggregateReflexion
//     filtert non-empty automatisch raus)
//
// Telemetry: question_start (first interaction per question), question_answer
// (per onChange), helper_text_open (per HelperTextModal open). Reuse FEAT-058
// Pattern aus V6.3-QuestionFlow.tsx (siehe Z. 80-86 dort).
//
// Ref: src/components/diagnose/QuestionFlow.tsx (Pattern-Vorlage V6.3),
//      src/lib/diagnose/types.ts (V8-Types),
//      slices/SLC-149 (MT-4 Spec).

import { useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditableText } from "@/components/text-override/EditableText";
import { HelperTextModal } from "./HelperTextModal";
import { useDiagnoseTelemetry } from "./DiagnoseTelemetryProvider";
import { HygieneAnswerPills } from "./HygieneAnswerPills";
import { ReifeSkalaAnswer } from "./ReifeSkalaAnswer";
import { ReflexionTextarea } from "./ReflexionTextarea";
import { getAnswerComponentKind } from "./question-flow-switch-logic";
import { ProgressIndicator } from "@/app/dashboard/diagnose/run/components/ProgressIndicator";
import { AutoSaveIndicator } from "@/app/dashboard/diagnose/run/components/AutoSaveIndicator";
import { NavigationButtons } from "@/app/dashboard/diagnose/run/components/NavigationButtons";
import {
  saveDiagnoseDraft,
  submitDiagnoseRun,
} from "@/app/dashboard/diagnose/actions";
import type {
  V8TemplateBlock,
  V8TemplateQuestion,
} from "@/lib/diagnose/types";
import type { HygieneValue } from "./hygiene-answer-pills-logic";

interface V8QuestionFlowProps {
  sessionId: string;
  templateSlug: string;
  blocks: V8TemplateBlock[];
  initialAnswers: Record<string, string>;
}

function isRequiredSchema(
  schemaKind: V8TemplateBlock["answer_schema_kind"],
): boolean {
  return (
    schemaKind === "hygiene_yes_partial_no" || schemaKind === "reife_skala_5"
  );
}

function flattenQuestions(
  blocks: V8TemplateBlock[],
): { block: V8TemplateBlock; question: V8TemplateQuestion }[] {
  return blocks.flatMap((block) =>
    block.questions.map((question) => ({ block, question })),
  );
}

export function V8QuestionFlow({
  sessionId,
  templateSlug,
  blocks,
  initialAnswers,
}: V8QuestionFlowProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();
  const [helperOpenKey, setHelperOpenKey] = useState<string | null>(null);

  const telemetry = useDiagnoseTelemetry();
  const startedQuestionsRef = useRef<Set<string>>(
    new Set(Object.keys(initialAnswers)),
  );

  const flatQuestions = useMemo(() => flattenQuestions(blocks), [blocks]);
  const helperFor = useMemo(
    () =>
      helperOpenKey
        ? flatQuestions.find((it) => it.question.frage_id === helperOpenKey) ?? null
        : null,
    [helperOpenKey, flatQuestions],
  );

  // Required-Counting: alle hygiene + alle reife_skala Fragen muessen beantwortet
  // sein. M10 reflexion ist optional (sui-engine.aggregateReflexion filtert
  // empty raus, kein Submit-Block).
  const requiredQuestionIds = useMemo(
    () =>
      flatQuestions
        .filter(({ block }) => isRequiredSchema(block.answer_schema_kind))
        .map(({ question }) => question.frage_id),
    [flatQuestions],
  );

  const totalRequired = requiredQuestionIds.length;
  const answeredRequiredCount = requiredQuestionIds.filter(
    (id) => typeof answers[id] === "string" && answers[id].length > 0,
  ).length;
  const allRequiredAnswered = answeredRequiredCount === totalRequired;

  function trackFirstInteraction(questionKey: string) {
    if (!startedQuestionsRef.current.has(questionKey)) {
      startedQuestionsRef.current.add(questionKey);
      telemetry.trackEvent({ type: "question_start", questionKey });
    }
  }

  function persistAnswer(questionKey: string, value: string) {
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

  function handleHygieneChange(
    questionKey: string,
    value: HygieneValue | null,
  ) {
    trackFirstInteraction(questionKey);
    // value=null bedeutet Toggle-Off (deselect). Wir persistieren als
    // empty-string damit allRequiredAnswered die Frage wieder als
    // unbeantwortet wertet.
    const persistValue = value ?? "";
    telemetry.trackEvent({
      type: "question_answer",
      questionKey,
      payload: { value: persistValue },
    });
    persistAnswer(questionKey, persistValue);
  }

  function handleSkalaChange(
    questionKey: string,
    _score: number,
    stufe: 1 | 2 | 3 | 4 | 5,
  ) {
    trackFirstInteraction(questionKey);
    const stufeStr = String(stufe);
    telemetry.trackEvent({
      type: "question_answer",
      questionKey,
      payload: { value: stufeStr },
    });
    persistAnswer(questionKey, stufeStr);
  }

  function handleReflexionChange(questionKey: string, text: string) {
    trackFirstInteraction(questionKey);
    telemetry.trackEvent({
      type: "question_answer",
      questionKey,
      payload: { text_length: text.length },
    });
    persistAnswer(questionKey, text);
  }

  function handleHelperOpen(questionKey: string) {
    telemetry.trackEvent({ type: "helper_text_open", questionKey });
    setHelperOpenKey(questionKey);
  }

  function handleSubmit() {
    setSubmitError(null);
    startSubmit(async () => {
      const result = await submitDiagnoseRun(sessionId);
      if (result?.error) {
        setSubmitError(result.error);
      }
      // Bei Erfolg redirected die Server-Action — kein Client-Side-Routing.
    });
  }

  return (
    <div className="space-y-8">
      <ProgressIndicator
        answered={answeredRequiredCount}
        total={totalRequired}
      />

      {blocks.map((block, blockIndex) => (
        <Card key={block.modul_id}>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              <EditableText
                keyPath={`template.${templateSlug}.block.${block.modul_id}.name`}
                defaultText={`${block.modul_id} — ${block.name}`}
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {block.questions.map((question, qIndex) => {
              const componentKind = getAnswerComponentKind({
                answer_schema_kind: block.answer_schema_kind,
              });
              const value = answers[question.frage_id];
              const errorMsg = saveErrors[question.frage_id];
              const questionLabel = question.text;

              return (
                <div
                  key={question.frage_id}
                  className="space-y-3 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {block.modul_id}.{qIndex + 1}
                  </p>
                  {componentKind === "hygiene" ? (
                    <HygieneAnswerPills
                      templateSlug={templateSlug}
                      questionKey={question.frage_id}
                      questionLabel={questionLabel}
                      currentValue={
                        value === "ja" ||
                        value === "teilweise" ||
                        value === "nein"
                          ? (value as HygieneValue)
                          : null
                      }
                      onChange={(v) =>
                        handleHygieneChange(question.frage_id, v)
                      }
                      onOpenHelper={() => handleHelperOpen(question.frage_id)}
                    />
                  ) : componentKind === "reife_skala" ? (
                    <ReifeSkalaAnswer
                      templateSlug={templateSlug}
                      questionKey={question.frage_id}
                      questionLabel={questionLabel}
                      currentValue={
                        value && block.score_mapping
                          ? block.score_mapping[value] ?? null
                          : null
                      }
                      scoreMapping={
                        block.score_mapping
                          ? {
                              1: block.score_mapping["1"] ?? 0,
                              2: block.score_mapping["2"] ?? 2,
                              3: block.score_mapping["3"] ?? 5,
                              4: block.score_mapping["4"] ?? 8,
                              5: block.score_mapping["5"] ?? 10,
                            }
                          : { 1: 0, 2: 2, 3: 5, 4: 8, 5: 10 }
                      }
                      onChange={(score, stufe) =>
                        handleSkalaChange(question.frage_id, score, stufe)
                      }
                      onOpenHelper={() => handleHelperOpen(question.frage_id)}
                    />
                  ) : componentKind === "reflexion" ? (
                    <ReflexionTextarea
                      templateSlug={templateSlug}
                      questionKey={question.frage_id}
                      questionLabel={questionLabel}
                      currentText={value ?? ""}
                      onChange={(t) =>
                        handleReflexionChange(question.frage_id, t)
                      }
                      isSaving={isSaving}
                      onOpenHelper={() => handleHelperOpen(question.frage_id)}
                    />
                  ) : (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                      <span className="flex items-center gap-1 font-medium">
                        <Info className="h-4 w-4" />
                        Unbekanntes Antwort-Schema:{" "}
                        {block.answer_schema_kind ?? "(leer)"}
                      </span>
                    </div>
                  )}
                  {errorMsg ? (
                    <p className="flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle className="h-3 w-3" />
                      {errorMsg}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <div>
        <NavigationButtons
          backHref="/dashboard/diagnose/start"
          disabled={!allRequiredAnswered}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
        >
          <AutoSaveIndicator
            isSaving={isSaving}
            answeredCount={answeredRequiredCount}
          />
        </NavigationButtons>
        {submitError ? (
          <p className="mt-3 flex items-center gap-1 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {submitError}
          </p>
        ) : null}
      </div>

      {helperFor ? (
        <HelperTextModal
          open={true}
          onClose={() => setHelperOpenKey(null)}
          templateSlug={templateSlug}
          questionKey={helperFor.question.frage_id}
          questionLabel={helperFor.question.text}
          helperTextDefault={null}
          examplesMdDefault={null}
          captureSessionId={sessionId}
        />
      ) : null}
    </div>
  );
}
