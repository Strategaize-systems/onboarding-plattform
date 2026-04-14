"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Star, CheckCircle2 } from "lucide-react";

interface FeedbackItem {
  question_key: string;
  response_text: string | null;
  response_rating: number | null;
}

const QUESTION_KEYS = ["coverage", "clarity", "improvements", "overall"] as const;
type QuestionKey = (typeof QUESTION_KEYS)[number];

export function FeedbackPanel({ runId }: { runId: string }) {
  const t = useTranslations("workspace.feedback");

  const [responses, setResponses] = useState<Record<QuestionKey, string>>({
    coverage: "",
    clarity: "",
    improvements: "",
    overall: "",
  });
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFeedback = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenant/runs/${runId}/feedback`);
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      const feedback: FeedbackItem[] = data.feedback ?? [];
      const newResponses = { ...responses };
      let loadedRating: number | null = null;
      for (const item of feedback) {
        if (QUESTION_KEYS.includes(item.question_key as QuestionKey)) {
          newResponses[item.question_key as QuestionKey] = item.response_text ?? "";
          if (item.question_key === "overall" && item.response_rating) {
            loadedRating = item.response_rating;
          }
        }
      }
      setResponses(newResponses);
      if (loadedRating) setRating(loadedRating);
    } catch {
      setError(t("errorLoading"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, t]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const items = QUESTION_KEYS.map((key) => ({
        question_key: key,
        response_text: responses[key] || null,
        response_rating: key === "overall" ? rating : null,
      }));
      const res = await fetch(`/api/tenant/runs/${runId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "Unknown error");
      }
      setSubmitted(true);
    } catch {
      setError(t("errorSaving"));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center px-4">
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-green-50 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <p className="text-lg font-bold text-slate-900 mb-1">{t("successTitle")}</p>
          <p className="text-sm text-slate-500">{t("successMessage")}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setSubmitted(false)}
          >
            {t("title")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t("title")}</h2>
          <p className="text-sm text-slate-500 mt-1">{t("description")}</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Coverage */}
        <FeedbackCard
          question={t("coverageQuestion")}
          placeholder={t("coveragePlaceholder")}
          value={responses.coverage}
          onChange={(v) => setResponses((prev) => ({ ...prev, coverage: v }))}
        />

        {/* Clarity */}
        <FeedbackCard
          question={t("clarityQuestion")}
          placeholder={t("clarityPlaceholder")}
          value={responses.clarity}
          onChange={(v) => setResponses((prev) => ({ ...prev, clarity: v }))}
        />

        {/* Improvements */}
        <FeedbackCard
          question={t("improvementsQuestion")}
          placeholder={t("improvementsPlaceholder")}
          value={responses.improvements}
          onChange={(v) => setResponses((prev) => ({ ...prev, improvements: v }))}
        />

        {/* Overall Rating */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-slate-900">{t("overallQuestion")}</p>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500 mr-2">{t("ratingLabel")}:</span>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(null)}
                className="p-0.5 transition-transform hover:scale-110"
              >
                <Star
                  className={`h-6 w-6 transition-colors ${
                    star <= (hoverRating ?? rating ?? 0)
                      ? "fill-amber-400 text-amber-400"
                      : "fill-slate-200 text-slate-200"
                  }`}
                />
              </button>
            ))}
          </div>
          <Textarea
            value={responses.overall}
            onChange={(e) => setResponses((prev) => ({ ...prev, overall: e.target.value }))}
            placeholder={t("overallPlaceholder")}
            rows={3}
            className="resize-none"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-gradient-to-r from-brand-primary-dark to-brand-primary text-white shadow-md hover:shadow-lg"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("submitting")}
              </>
            ) : (
              t("submit")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FeedbackCard({
  question,
  placeholder,
  value,
  onChange,
}: {
  question: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
      <p className="text-sm font-semibold text-slate-900">{question}</p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="resize-none"
      />
    </div>
  );
}
