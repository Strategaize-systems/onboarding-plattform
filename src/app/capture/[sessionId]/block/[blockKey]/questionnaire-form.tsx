"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Check, Loader2, MessageCircle, X } from "lucide-react";
import type { TemplateQuestion } from "@/lib/db/template-queries";
import { saveAnswer } from "./actions";
import { ChatPanel } from "./chat-panel";

interface Props {
  sessionId: string;
  blockKey: string;
  blockTitle: string;
  templateName: string;
  questions: TemplateQuestion[];
  savedAnswers: Record<string, string>;
  totalBlocks: number;
}

export function QuestionnaireForm({
  sessionId,
  blockKey,
  blockTitle,
  templateName,
  questions,
  savedAnswers,
  totalBlocks,
}: Props) {
  const locale = useLocale();

  // Local answer state — initialized from saved answers
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of questions) {
      const key = `${blockKey}.${q.id}`;
      initial[q.id] = savedAnswers[key] ?? "";
    }
    return initial;
  });

  // Save state tracking
  const [savingQuestions, setSavingQuestions] = useState<Set<string>>(new Set());
  const [savedQuestions, setSavedQuestions] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Chat panel state
  const [chatQuestionId, setChatQuestionId] = useState<string | null>(null);

  // Debounce timers per question
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // Autosave function
  const doSave = useCallback(
    async (questionId: string, value: string) => {
      setSavingQuestions((prev) => new Set(prev).add(questionId));
      setSavedQuestions((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });

      try {
        const result = await saveAnswer(sessionId, blockKey, questionId, value);
        if (result?.error) {
          setMessage({ text: result.error, type: "error" });
        } else {
          setSavedQuestions((prev) => new Set(prev).add(questionId));
          // Clear saved indicator after 2s
          setTimeout(() => {
            setSavedQuestions((prev) => {
              const next = new Set(prev);
              next.delete(questionId);
              return next;
            });
          }, 2000);
        }
      } catch {
        setMessage({ text: "Speichern fehlgeschlagen", type: "error" });
      } finally {
        setSavingQuestions((prev) => {
          const next = new Set(prev);
          next.delete(questionId);
          return next;
        });
      }
    },
    [sessionId, blockKey]
  );

  // Handle answer change with debounced autosave
  function handleAnswerChange(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));

    // Clear existing timer
    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId]);
    }

    // Set new debounce timer (500ms)
    debounceTimers.current[questionId] = setTimeout(() => {
      doSave(questionId, value);
    }, 500);
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of Object.values(debounceTimers.current)) {
        clearTimeout(timer);
      }
    };
  }, []);

  // Group questions by unterbereich
  const groups: { label: string; questions: TemplateQuestion[] }[] = [];
  let currentLabel = "";
  let currentGroup: TemplateQuestion[] = [];
  const sorted = [...questions].sort((a, b) => a.position - b.position);
  for (const q of sorted) {
    if (q.unterbereich !== currentLabel) {
      if (currentGroup.length > 0) {
        groups.push({ label: currentLabel, questions: currentGroup });
      }
      currentLabel = q.unterbereich;
      currentGroup = [q];
    } else {
      currentGroup.push(q);
    }
  }
  if (currentGroup.length > 0) {
    groups.push({ label: currentLabel, questions: currentGroup });
  }

  // Progress calculation
  const answeredCount = questions.filter(
    (q) => (answers[q.id] ?? "").trim().length > 0
  ).length;
  const progressPercent =
    questions.length > 0
      ? Math.round((answeredCount / questions.length) * 100)
      : 0;

  const chatQuestion = chatQuestionId
    ? questions.find((q) => q.id === chatQuestionId)
    : null;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Main questionnaire area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <Link
                href={`/capture/${sessionId}`}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Zurück
              </Link>
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  Block {blockKey}: {blockTitle}
                </h1>
                <p className="text-sm text-slate-500">{templateName}</p>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-600">
                  {answeredCount}/{questions.length} beantwortet
                </span>
                <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-primary transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-slate-900 tabular-nums">
                  {progressPercent}%
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Message bar */}
        {message && (
          <div className="flex-shrink-0 px-6 pt-3">
            <Alert
              variant={message.type === "error" ? "destructive" : "default"}
            >
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Questions list */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-4xl space-y-8">
            {groups.map((group) => (
              <div key={group.label}>
                {/* Unterbereich heading */}
                <div className="mb-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                    {group.label.replace(/^Block\s+\w+\s*\/\s*/, "")}
                  </h2>
                </div>

                {/* Questions in this group */}
                <div className="space-y-4">
                  {group.questions.map((q) => {
                    const isSaving = savingQuestions.has(q.id);
                    const isSaved = savedQuestions.has(q.id);
                    const hasAnswer = (answers[q.id] ?? "").trim().length > 0;
                    const isChatOpen = chatQuestionId === q.id;

                    return (
                      <Card
                        key={q.id}
                        className={`transition-all ${
                          isChatOpen
                            ? "ring-2 ring-brand-primary/30"
                            : ""
                        }`}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                  {q.frage_id}
                                </span>
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                                  {q.ebene}
                                </span>
                                {q.deal_blocker && (
                                  <span className="text-[10px] uppercase tracking-wider font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                                    Deal-Blocker
                                  </span>
                                )}
                              </div>
                              <CardTitle className="text-sm font-semibold text-slate-900 leading-snug">
                                {q.text}
                              </CardTitle>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {/* Save indicator */}
                              {isSaving && (
                                <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin" />
                              )}
                              {isSaved && (
                                <Check className="h-3.5 w-3.5 text-green-500" />
                              )}
                              {/* Answer status dot */}
                              <div
                                className={`h-2.5 w-2.5 rounded-full ${
                                  hasAnswer
                                    ? "bg-green-500"
                                    : "bg-slate-300"
                                }`}
                              />
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Textarea
                            value={answers[q.id] ?? ""}
                            onChange={(e) =>
                              handleAnswerChange(q.id, e.target.value)
                            }
                            placeholder="Ihre Antwort..."
                            rows={3}
                            className="resize-none text-sm"
                          />
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-slate-400 tabular-nums">
                              {(answers[q.id] ?? "").length} Zeichen
                            </span>
                            <Button
                              variant={isChatOpen ? "default" : "outline"}
                              size="sm"
                              onClick={() =>
                                setChatQuestionId(
                                  isChatOpen ? null : q.id
                                )
                              }
                              className="text-xs gap-1.5"
                            >
                              {isChatOpen ? (
                                <>
                                  <X className="h-3.5 w-3.5" />
                                  Chat schließen
                                </>
                              ) : (
                                <>
                                  <MessageCircle className="h-3.5 w-3.5" />
                                  KI-Assistent
                                </>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chat panel — slides in from right */}
      {chatQuestion && (
        <ChatPanel
          sessionId={sessionId}
          blockKey={blockKey}
          questionId={chatQuestion.id}
          questionText={chatQuestion.text}
          currentAnswer={answers[chatQuestion.id] ?? ""}
          onInsertDraft={(draft) => {
            handleAnswerChange(chatQuestion.id, draft);
          }}
          onClose={() => setChatQuestionId(null)}
        />
      )}
    </div>
  );
}
