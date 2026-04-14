"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { ProgressIndicator } from "@/components/progress-indicator";
import { EventHistory } from "@/components/event-history";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Question {
  id: string;
  frage_id: string;
  block: string;
  ebene: string;
  unterbereich: string;
  fragetext: string;
  position: number;
  ko_hart: boolean;
  ko_soft: boolean;
  latest_answer: string | null;
  event_count: number;
  evidence_count: number;
}

interface Run {
  id: string;
  title: string;
  description: string | null;
  status: string;
  survey_type?: string;
  created_at: string;
  submitted_at: string | null;
  questions: Question[];
}

export function RunDetailClient({
  runId,
  email,
}: {
  runId: string;
  email: string;
}) {
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [locking, setLocking] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);

  const loadRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/runs/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setRun(data.run);
      }
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    loadRun();
  }, [loadRun]);

  async function handleExport() {
    setExporting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/runs/${runId}/export`);
      if (!res.ok) {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? "Export fehlgeschlagen", type: "error" });
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename = match?.[1] ?? `export_${runId}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ text: "Export heruntergeladen", type: "success" });
    } catch {
      setMessage({ text: "Netzwerkfehler — Export fehlgeschlagen", type: "error" });
    } finally {
      setExporting(false);
    }
  }

  async function handleLock() {
    setLocking(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/runs/${runId}/lock`, {
        method: "PATCH",
      });
      if (res.ok) {
        setMessage({ text: "Run wurde gesperrt", type: "success" });
        await loadRun();
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? "Sperren fehlgeschlagen", type: "error" });
      }
    } catch {
      setMessage({ text: "Netzwerkfehler", type: "error" });
    } finally {
      setLocking(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!run) {
    return (
      <div>
        <p className="text-muted-foreground">Run nicht gefunden.</p>
        <Link href="/admin/runs" className="text-sm underline mt-2 inline-block">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  const blocks = Array.from(new Set(run.questions.map((q) => q.block))).sort();
  const questionsByBlock = new Map<string, Question[]>();
  blocks.forEach((b) => {
    questionsByBlock.set(b, run.questions.filter((q) => q.block === b));
  });

  const answered = run.questions.filter((q) => q.latest_answer).length;
  const total = run.questions.length;
  const isLocked = run.status === "locked";
  const activeQ = run.questions.find((q) => q.id === activeQuestion);

  return (
    <div>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/admin/runs"
                className="text-sm text-slate-500 hover:text-brand-primary hover:underline"
              >
                Alle Runs
              </Link>
              <span className="text-slate-400">/</span>
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold text-slate-900">{run.title}</h2>
              <StatusBadge status={run.status} />
              {run.survey_type === "mirror" && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                  Mirror
                </Badge>
              )}
            </div>
            {run.description && (
              <p className="text-sm text-muted-foreground mt-1">{run.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/admin/runs/${run.id}/review`}>
              <Button variant="outline">Review-Übersicht</Button>
            </Link>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? "Exportiert..." : run.survey_type === "mirror" ? "Mirror-Export ZIP" : "Export ZIP"}
            </Button>
            {!isLocked && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={locking}>
                    {locking ? "Wird gesperrt..." : "Run sperren"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Run sperren?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Diese Aktion kann nicht rückgängig gemacht werden. Nach dem
                      Sperren kann der Tenant keine Antworten oder Evidence mehr
                      hinzufügen.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={handleLock}>
                      Ja, sperren
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {message && (
          <Alert
            variant={message.type === "error" ? "destructive" : "default"}
            className="mb-4"
          >
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* Stats — Premium KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div className="relative overflow-hidden bg-white rounded-2xl border-2 border-slate-200 shadow-lg">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-primary-dark to-brand-primary" />
            <div className="px-5 pt-5 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Fragen</p>
              <p className="text-3xl font-bold bg-gradient-to-r from-brand-primary-dark to-brand-primary bg-clip-text text-transparent mt-1">{total}</p>
            </div>
          </div>
          <div className="relative overflow-hidden bg-white rounded-2xl border-2 border-slate-200 shadow-lg">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-success-dark to-brand-success" />
            <div className="px-5 pt-5 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Beantwortet</p>
              <p className="text-3xl font-bold bg-gradient-to-r from-brand-success-dark to-brand-success bg-clip-text text-transparent mt-1">{answered}</p>
            </div>
          </div>
          <div className="relative overflow-hidden bg-white rounded-2xl border-2 border-slate-200 shadow-lg">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-primary-dark to-brand-primary" />
            <div className="px-5 pt-5 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Evidence</p>
              <p className="text-3xl font-bold bg-gradient-to-r from-brand-primary-dark to-brand-primary bg-clip-text text-transparent mt-1">
                {run.questions.reduce((sum, q) => sum + q.evidence_count, 0)}
              </p>
            </div>
          </div>
          <div className="relative overflow-hidden bg-white rounded-2xl border-2 border-slate-200 shadow-lg">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-slate-300" />
            <div className="px-5 pt-5 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Erstellt</p>
              <p className="text-lg font-bold text-slate-900 mt-1">
                {new Date(run.created_at).toLocaleDateString("de-DE")}
              </p>
            </div>
          </div>
        </div>

        {/* Progress */}
        <ProgressIndicator answered={answered} total={total} className="mb-6" />

        {/* Questions by block — Premium Layout */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Left: Question navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Fragen</h3>
              </div>
              {/* Block tabs as compact buttons */}
              <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1">
                {blocks.map((b) => {
                  const bQuestions = questionsByBlock.get(b) ?? [];
                  const bAnswered = bQuestions.filter((q) => q.latest_answer).length;
                  const isActiveBlock = activeQ?.block === b;
                  return (
                    <button
                      key={b}
                      onClick={() => {
                        const firstQ = bQuestions[0];
                        if (firstQ) setActiveQuestion(firstQ.id);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                        isActiveBlock
                          ? "bg-gradient-to-r from-brand-primary-dark to-brand-primary text-white shadow-sm"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {b} <span className="font-normal">{bAnswered}/{bQuestions.length}</span>
                    </button>
                  );
                })}
              </div>
              {/* Question list — scrollable */}
              <div className="overflow-y-auto" style={{ maxHeight: "500px" }}>
                {(questionsByBlock.get(activeQ?.block ?? blocks[0]) ?? []).map((q) => {
                  const isActive = activeQuestion === q.id;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setActiveQuestion(q.id)}
                      className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-all ${
                        isActive
                          ? "bg-brand-primary/5 border-l-3 border-l-brand-primary"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-mono ${isActive ? "text-brand-primary" : "text-slate-400"}`}>
                              {q.frage_id}
                            </span>
                            {q.ko_hart && (
                              <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1 rounded">KO</span>
                            )}
                          </div>
                          <p className="text-xs leading-snug line-clamp-2 mt-0.5 text-slate-700">{q.fragetext}</p>
                        </div>
                        <div className="flex-shrink-0 mt-1">
                          <div className={`h-2 w-2 rounded-full ${
                            q.latest_answer
                              ? "bg-brand-success shadow-[0_0_4px_rgba(0,168,79,0.4)]"
                              : "bg-slate-300"
                          }`} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Question detail — Premium */}
          <div className="lg:col-span-2">
            {activeQ ? (
              <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-lg overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-primary-dark via-brand-primary to-brand-success-dark" />
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gradient-to-r from-brand-primary-dark to-brand-primary text-white text-xs font-bold shadow-sm">
                      {activeQ.frage_id}
                    </span>
                    <span className="text-xs text-slate-400">{activeQ.unterbereich}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">{activeQ.ebene}</span>
                    {activeQ.ko_hart && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">KO-hart</span>}
                    {activeQ.ko_soft && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">KO-soft</span>}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-2 leading-snug">{activeQ.fragetext}</h3>
                </div>
                <div className="px-6 py-5 space-y-5">
                  {activeQ.latest_answer && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Aktuelle Antwort</p>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm whitespace-pre-wrap text-slate-800 leading-relaxed">
                        {activeQ.latest_answer}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Alle Antworten &amp; Verlauf</p>
                    <EventHistory
                      runId={run.id}
                      questionId={activeQ.id}
                      isAdmin
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-slate-400 pt-2 border-t border-slate-100">
                    <span>{activeQ.evidence_count} Evidence-Dokumente</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-lg flex items-center justify-center py-20">
                <p className="text-sm text-slate-400">Wählen Sie eine Frage aus der Liste aus.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
