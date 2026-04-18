"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ChevronDown, ChevronRight } from "lucide-react";

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
};

const EVENT_TYPE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  answer_submitted: "default",
  note_added: "secondary",
};

export function CaptureEventHistory({
  sessionId,
  blockKey,
  questionId,
}: {
  sessionId: string;
  blockKey: string;
  questionId: string;
}) {
  const [events, setEvents] = useState<CaptureEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const loadEvents = useCallback(async () => {
    setLoading(true);
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
    loadEvents();
  }, [loadEvents]);

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
          Antwort-Verlauf ({events.length} {events.length === 1 ? "Eintrag" : "Einträge"})
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2 overflow-y-auto pr-1">
            {events.map((event) => {
              const text =
                (event.event_type === "answer_submitted" || event.event_type === "note_added") &&
                typeof event.payload?.text === "string"
                  ? event.payload.text
                  : null;
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
                        {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
                      </Badge>
                      {answerNum && (
                        <span className="text-[10px] font-bold text-slate-500">#{answerNum}</span>
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
