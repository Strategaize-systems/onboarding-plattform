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

interface CaptureEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  created_by: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  answer_submitted: "Antwort",
  note_added: "Notiz",
  evidence_attached: "Dokument",
  document_analysis: "KI-Analyse",
};

const EVENT_TYPE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  answer_submitted: "default",
  note_added: "secondary",
  evidence_attached: "outline",
  document_analysis: "default",
};

export function CaptureEventHistory({
  sessionId,
  blockKey,
  questionId,
  refreshKey = 0,
}: {
  sessionId: string;
  blockKey: string;
  questionId: string;
  refreshKey?: number;
}) {
  const [events, setEvents] = useState<CaptureEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/capture/${sessionId}/events?blockKey=${blockKey}&questionId=${questionId}`
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId, blockKey, questionId]);

  useEffect(() => {
    setLoading(true);
    loadEvents();
  }, [loadEvents, refreshKey]);

  // Auto-poll when a document analysis might be pending (Blueprint pattern)
  const hasPendingAnalysis = events.some((e) => {
    if (e.event_type !== "evidence_attached") return false;
    const evidenceId = e.payload?.evidence_file_id;
    if (!evidenceId) return false;
    const age = Date.now() - new Date(e.created_at).getTime();
    if (age > 3 * 60 * 1000) return false;
    return !events.some(
      (a) => a.event_type === "document_analysis" &&
        a.payload?.evidence_file_id === evidenceId
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
        Noch keine gespeicherten Antworten.
      </p>
    );
  }

  // Number answers in reverse (oldest=1, newest=N)
  const answerEvents = events.filter((e) => e.event_type === "answer_submitted");
  const answerNumberMap = new Map<string, number>();
  answerEvents.forEach((e, idx) => {
    answerNumberMap.set(e.id, answerEvents.length - idx);
  });

  return (
    <Accordion type="single" collapsible className="w-full" defaultValue="history">
      <AccordionItem value="history">
        <AccordionTrigger className="text-xs">
          Antwort-Verlauf ({events.length} {events.length === 1 ? "Eintrag" : "Eintraege"})
        </AccordionTrigger>
        <AccordionContent>
          {/* Pending analysis indicator */}
          {hasPendingAnalysis && (
            <div className="rounded-lg border border-brand-primary/30 bg-brand-primary/5 p-2.5 text-xs mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" />
                <span className="text-brand-primary font-medium">Dokument wird analysiert...</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Die KI-Analyse wird in wenigen Sekunden verfuegbar sein.
              </p>
            </div>
          )}
          <div className="space-y-2 overflow-y-auto pr-1">
            {events.map((event) => {
              const text =
                (event.event_type === "answer_submitted" ||
                 event.event_type === "note_added" ||
                 event.event_type === "document_analysis") &&
                typeof event.payload?.text === "string"
                  ? event.payload.text
                  : null;
              const fileName =
                event.event_type === "document_analysis" &&
                typeof event.payload?.file_name === "string"
                  ? event.payload.file_name
                  : null;
              const isLong = text ? text.length > 120 : false;
              const isExpanded = expandedEvents.has(event.id);
              const answerNum = answerNumberMap.get(event.id);
              const isAnalysis = event.event_type === "document_analysis";

              return (
                <div
                  key={event.id}
                  className={`rounded-lg border p-2.5 text-xs ${
                    isAnalysis
                      ? "border-brand-primary/30 bg-brand-primary/5"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={EVENT_TYPE_VARIANTS[event.event_type] ?? "outline"}
                        className={`text-[10px] ${isAnalysis ? "bg-brand-primary text-white" : ""}`}
                      >
                        {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
                      </Badge>
                      {answerNum && (
                        <span className="text-[10px] font-bold text-slate-500">#{answerNum}</span>
                      )}
                      {fileName && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[120px]" title={fileName}>
                          {fileName}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {new Date(event.created_at).toLocaleString("de-DE")}
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
                              Weniger
                            </>
                          ) : (
                            <>
                              <ChevronRight className="h-3 w-3" />
                              Mehr
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
