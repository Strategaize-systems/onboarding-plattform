"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

interface QuestionEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  created_by: string;
}

const EVENT_TYPE_I18N_KEYS: Record<string, string> = {
  answer_submitted: "events.answer",
  note_added: "events.note",
  evidence_attached: "events.evidenceAttached",
  status_changed: "events.statusChanged",
  document_analysis: "events.documentAnalysis",
};

const EVENT_TYPE_VARIANTS: Record<string, "default" | "secondary" | "outline" | "gradient-primary"> = {
  answer_submitted: "default",
  note_added: "secondary",
  evidence_attached: "outline",
  status_changed: "outline",
  document_analysis: "gradient-primary",
};

export function EventHistory({
  runId,
  questionId,
  isAdmin = false,
}: {
  runId: string;
  questionId: string;
  isAdmin?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [events, setEvents] = useState<QuestionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = isAdmin
        ? `/api/admin/runs/${runId}/questions/${questionId}/events`
        : `/api/tenant/runs/${runId}/questions/${questionId}/events`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [runId, questionId, isAdmin]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Auto-poll when a document analysis is pending (evidence_attached without matching document_analysis)
  const hasPendingAnalysis = events.some((e) => {
    if (e.event_type !== "evidence_attached") return false;
    const evidenceId = (e.payload as Record<string, unknown>)?.evidence_item_id;
    if (!evidenceId) return false;
    // Check if created within last 3 minutes (analysis typically takes 30-90s)
    const age = Date.now() - new Date(e.created_at).getTime();
    if (age > 3 * 60 * 1000) return false;
    // Check if a matching document_analysis event exists
    return !events.some(
      (a) => a.event_type === "document_analysis" &&
        (a.payload as Record<string, unknown>)?.evidence_item_id === evidenceId
    );
  });

  useEffect(() => {
    if (hasPendingAnalysis && !pollRef.current) {
      pollRef.current = setInterval(() => { loadEvents(); }, 5000);
    }
    if (!hasPendingAnalysis && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [hasPendingAnalysis, loadEvents]);

  function toggleEvent(id: string) {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return <Skeleton className="h-20 w-full" />;
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-slate-400 py-2">
        {t("events.empty")}
      </p>
    );
  }

  return (
    <Accordion type="single" collapsible className="w-full" defaultValue="history">
      <AccordionItem value="history">
        <AccordionTrigger className="text-xs">
          {t("events.header", { count: events.length })}
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2 overflow-y-auto pr-1">
            {hasPendingAnalysis && (
              <div className="rounded-lg border border-brand-primary/30 bg-brand-primary/5 p-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" />
                  <span className="text-brand-primary font-medium">{t("events.analyzing")}</span>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  {t("events.analyzingDescription")}
                </p>
              </div>
            )}
            {(() => {
              // Number answers in reverse (oldest=1, newest=N)
              const answerEvents = events.filter((e) => e.event_type === "answer_submitted");
              const answerNumberMap = new Map<string, number>();
              answerEvents.forEach((e, idx) => {
                answerNumberMap.set(e.id, answerEvents.length - idx);
              });
              return events.map((event) => {
              const text =
                (event.event_type === "answer_submitted" || event.event_type === "note_added" || event.event_type === "document_analysis") &&
                typeof event.payload?.text === "string"
                  ? event.payload.text
                  : null;
              const fileName = event.event_type === "document_analysis" && typeof event.payload?.file_name === "string"
                ? event.payload.file_name : null;
              const isLong = text ? text.length > 120 : false;
              const isExpanded = expandedEvents.has(event.id);
              const answerNum = answerNumberMap.get(event.id);

              return (
                <div
                  key={event.id}
                  className="rounded-lg border border-slate-200 p-2.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={EVENT_TYPE_VARIANTS[event.event_type] ?? "outline"}
                        className="text-[10px]"
                      >
                        {EVENT_TYPE_I18N_KEYS[event.event_type] ? t(EVENT_TYPE_I18N_KEYS[event.event_type]) : event.event_type}
                      </Badge>
                      {answerNum && (
                        <span className="text-[10px] font-bold text-slate-500">#{answerNum}</span>
                      )}
                      {fileName && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={fileName}>📄 {fileName}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {new Date(event.created_at).toLocaleString(locale)}
                    </span>
                  </div>
                  {text && (
                    <>
                      <p className={`mt-1.5 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap ${!isExpanded && isLong ? "line-clamp-3" : ""}`}>
                        {text}
                      </p>
                      {isLong && (
                        <button
                          onClick={() => toggleEvent(event.id)}
                          className="mt-1 text-[10px] font-semibold text-brand-primary hover:text-brand-primary-dark flex items-center gap-0.5 hover:underline"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronDown className="h-3 w-3" />
                              {t("common.showLess")}
                            </>
                          ) : (
                            <>
                              <ChevronRight className="h-3 w-3" />
                              {t("common.showMore")}
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            });
            })()}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
