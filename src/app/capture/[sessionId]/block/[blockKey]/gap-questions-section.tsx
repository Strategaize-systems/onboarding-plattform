"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, MessageSquare, SkipForward } from "lucide-react";
import { useGapQuestions, type GapQuestion } from "./use-gap-questions";
import { answerGapQuestion, skipGapQuestion } from "./gap-actions";

interface GapQuestionsSectionProps {
  sessionId: string;
  blockKey: string;
}

export function GapQuestionsSection({ sessionId, blockKey }: GapQuestionsSectionProps) {
  const t = useTranslations("gapQuestions");
  const { gaps, loading, pendingCount, refresh } = useGapQuestions(sessionId, blockKey);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-6 py-4">
        <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
        <span className="text-sm text-slate-500">{t("title")}...</span>
      </div>
    );
  }

  if (gaps.length === 0) {
    return null;
  }

  const pendingGaps = gaps.filter((g) => g.status === "pending");
  const answeredGaps = gaps.filter((g) => g.status === "answered" || g.status === "recondensed");
  const skippedGaps = gaps.filter((g) => g.status === "skipped");

  return (
    <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-amber-200 bg-amber-50/50">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md">
            <MessageSquare className="h-4 w-4 text-white" />
          </div>
          {t("title")}
          {pendingCount > 0 && (
            <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-300">
              {t("pendingBadge", { count: pendingCount })}
            </span>
          )}
        </h3>
        <p className="mt-1 text-xs text-slate-500 pl-11">{t("subtitle")}</p>
      </div>

      {/* Gap cards */}
      <div className="p-5 space-y-3">
        {/* Pending gaps first */}
        {pendingGaps.map((gap) => (
          <GapQuestionCard key={gap.id} gap={gap} onUpdate={refresh} />
        ))}

        {/* Answered/skipped gaps — collapsed style */}
        {(answeredGaps.length > 0 || skippedGaps.length > 0) && pendingGaps.length > 0 && (
          <div className="border-t border-slate-200 pt-3 mt-3" />
        )}

        {answeredGaps.map((gap) => (
          <AnsweredGapCard key={gap.id} gap={gap} />
        ))}

        {skippedGaps.map((gap) => (
          <SkippedGapCard key={gap.id} gap={gap} />
        ))}
      </div>
    </div>
  );
}

function GapQuestionCard({ gap, onUpdate }: { gap: GapQuestion; onUpdate: () => void }) {
  const t = useTranslations("gapQuestions");
  const [answerText, setAnswerText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function handleSubmit() {
    if (!answerText.trim() || submitting) return;
    setSubmitting(true);
    setMessage(null);

    const result = await answerGapQuestion(gap.id, answerText.trim());

    if (result.success) {
      setMessage({
        text: result.recondenseTriggered ? t("recondenseTriggered") : t("submitted"),
        type: "success",
      });
      setAnswerText("");
      setTimeout(() => onUpdate(), 500);
    } else {
      setMessage({ text: result.error ?? "Fehler", type: "error" });
    }

    setSubmitting(false);
  }

  async function handleSkip() {
    if (skipping) return;
    setSkipping(true);
    setMessage(null);

    const result = await skipGapQuestion(gap.id);

    if (result.success) {
      setTimeout(() => onUpdate(), 300);
    } else {
      setMessage({ text: result.error ?? "Fehler", type: "error" });
    }

    setSkipping(false);
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/30 px-4 py-3 space-y-2">
      {/* Priority badge + question */}
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            gap.priority === "required"
              ? "bg-red-100 text-red-700 border border-red-200"
              : "bg-slate-100 text-slate-600 border border-slate-200"
          }`}
        >
          {gap.priority === "required" ? t("required") : t("niceToHave")}
        </span>
        <p className="text-sm font-medium text-slate-800 flex-1">{gap.question_text}</p>
      </div>

      {/* Context */}
      {gap.context && (
        <div className="pl-[calc(theme(spacing.2)+4rem)] text-xs text-slate-500 italic">
          <span className="font-semibold not-italic">{t("context")}:</span> {gap.context}
        </div>
      )}

      {/* Answer textarea */}
      <div className="space-y-2">
        <textarea
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          placeholder={t("answerPlaceholder")}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm leading-relaxed focus:border-brand-primary focus:outline-none transition-colors resize-none"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleSubmit}
            disabled={!answerText.trim() || submitting}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-primary-dark to-brand-primary text-white text-xs font-bold shadow-sm hover:shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {submitting ? t("submitting") : t("submit")}
          </button>
          <button
            onClick={handleSkip}
            disabled={skipping}
            className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {skipping ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <SkipForward className="h-3.5 w-3.5" />
            )}
            {t("skip")}
          </button>
        </div>
      </div>

      {/* Feedback message */}
      {message && (
        <div
          className={`text-xs px-3 py-1.5 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

function AnsweredGapCard({ gap }: { gap: GapQuestion }) {
  const t = useTranslations("gapQuestions");

  return (
    <div className="rounded-xl border border-green-200 bg-green-50/30 px-4 py-3 opacity-75">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-600 line-through">{gap.question_text}</p>
          {gap.answer_text && (
            <p className="mt-1 text-xs text-green-700 bg-green-50 rounded-lg px-2 py-1">
              {gap.answer_text}
            </p>
          )}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-green-600 flex-shrink-0">
          {t("answered")}
        </span>
      </div>
    </div>
  );
}

function SkippedGapCard({ gap }: { gap: GapQuestion }) {
  const t = useTranslations("gapQuestions");

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/30 px-4 py-3 opacity-60">
      <div className="flex items-start gap-2">
        <SkipForward className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-slate-400 flex-1">{gap.question_text}</p>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0">
          {t("skipped")}
        </span>
      </div>
    </div>
  );
}
