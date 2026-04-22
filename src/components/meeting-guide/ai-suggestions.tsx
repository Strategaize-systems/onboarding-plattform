"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, Loader2 } from "lucide-react";
import type { MeetingGuideTopic } from "@/types/meeting-guide";

interface Props {
  sessionId: string;
  onAccept: (topics: MeetingGuideTopic[]) => void;
}

export function AiSuggestions({ sessionId, onAccept }: Props) {
  const t = useTranslations("meetingGuide");
  const [suggestions, setSuggestions] = useState<MeetingGuideTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setAccepted(new Set());

    try {
      const res = await fetch("/api/meeting-guide/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capture_session_id: sessionId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? t("suggestError"));
        return;
      }

      const data = await res.json();
      setSuggestions(data.topics ?? []);
    } catch {
      setError(t("suggestError"));
    } finally {
      setLoading(false);
    }
  }

  function handleAcceptSingle(topic: MeetingGuideTopic) {
    setAccepted((prev) => new Set(prev).add(topic.key));
    onAccept([topic]);
  }

  function handleAcceptAll() {
    const remaining = suggestions.filter((s) => !accepted.has(s.key));
    if (remaining.length > 0) {
      onAccept(remaining);
      setAccepted(new Set(suggestions.map((s) => s.key)));
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
          <Sparkles className="h-4 w-4" />
          {t("aiSuggestionsTitle")}
        </div>
        <div className="flex items-center gap-2">
          {suggestions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleAcceptAll}
              disabled={accepted.size === suggestions.length}
            >
              <Check className="mr-1 h-3 w-3" />
              {t("acceptAll")}
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 bg-amber-600 text-xs hover:bg-amber-700"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t("generating")}
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {t("generateSuggestions")}
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {suggestions.map((suggestion) => {
            const isAccepted = accepted.has(suggestion.key);
            return (
              <div
                key={suggestion.key}
                className={`rounded-lg border p-3 transition-colors ${
                  isAccepted
                    ? "border-green-300 bg-green-50"
                    : "border-amber-200 bg-white"
                }`}
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-800">
                    {suggestion.title}
                  </h4>
                  {suggestion.block_key && (
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {suggestion.block_key}
                    </Badge>
                  )}
                </div>
                <p className="mb-2 text-xs text-slate-500">
                  {suggestion.description}
                </p>
                {suggestion.questions.length > 0 && (
                  <ul className="mb-2 space-y-0.5">
                    {suggestion.questions.map((q, i) => (
                      <li key={i} className="text-xs text-slate-600">
                        • {q}
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  variant={isAccepted ? "ghost" : "outline"}
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => handleAcceptSingle(suggestion)}
                  disabled={isAccepted}
                >
                  {isAccepted ? (
                    <>
                      <Check className="mr-1 h-3 w-3 text-green-600" />
                      {t("accepted")}
                    </>
                  ) : (
                    t("acceptTopic")
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
