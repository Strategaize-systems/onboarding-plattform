"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, CheckCircle2, Clock, ArrowLeft } from "lucide-react";

interface BlockStat {
  block: string;
  name: string;
  total: number;
  answered: number;
  percent: number;
  evidenceCount: number;
  checkpoint: { version: number; submitted_at: string } | null;
  lastActivity: string | null;
}

interface ReviewData {
  run: {
    id: string;
    title: string;
    status: string;
    created_at: string;
    submitted_at: string | null;
  };
  overview: {
    totalQuestions: number;
    totalAnswered: number;
    totalPercent: number;
    totalEvidence: number;
    totalCheckpoints: number;
  };
  blocks: BlockStat[];
}

export function ReviewClient({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runId, setRunId] = useState<string>("");

  const loadReview = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/runs/${id}/review`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    paramsPromise.then((p) => {
      setRunId(p.id);
      loadReview(p.id);
    });
  }, [paramsPromise, loadReview]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-slate-400">Review-Daten konnten nicht geladen werden.</p>;
  }

  const { run, overview, blocks } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Link
            href={`/admin/runs/${runId}`}
            className="text-sm text-slate-400 hover:text-brand-primary flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Zurück zum Run
          </Link>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Review: {run.title}</h2>
            <p className="mt-1 text-sm text-slate-500">Block-für-Block Fortschrittsübersicht</p>
          </div>
          <StatusBadge status={run.status} />
        </div>
      </div>

      {/* Gesamt-KPIs — Premium */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="relative overflow-hidden bg-white rounded-2xl border-2 border-slate-200 shadow-lg">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-primary-dark to-brand-primary" />
          <div className="p-5 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gesamt</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-brand-primary-dark to-brand-primary bg-clip-text text-transparent mt-1">{overview.totalPercent}%</p>
            <p className="text-xs text-slate-400 mt-1">{overview.totalAnswered}/{overview.totalQuestions} Fragen</p>
          </div>
        </div>
        <div className="relative overflow-hidden bg-white rounded-2xl border-2 border-slate-200 shadow-lg">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-primary-dark to-brand-primary" />
          <div className="p-5 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Evidence</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-brand-primary-dark to-brand-primary bg-clip-text text-transparent mt-1">{overview.totalEvidence}</p>
            <p className="text-xs text-slate-400 mt-1">Dokumente hochgeladen</p>
          </div>
        </div>
        <div className="relative overflow-hidden bg-white rounded-2xl border-2 border-slate-200 shadow-lg">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-success-dark to-brand-success" />
          <div className="p-5 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Checkpoints</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-brand-success-dark to-brand-success bg-clip-text text-transparent mt-1">{overview.totalCheckpoints}</p>
            <p className="text-xs text-slate-400 mt-1">Blöcke eingereicht</p>
          </div>
        </div>
        <div className="relative overflow-hidden bg-white rounded-2xl border-2 border-slate-200 shadow-lg">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-slate-300" />
          <div className="p-5 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</p>
            <div className="mt-2">
              <StatusBadge status={run.status} />
            </div>
            <p className="text-xs text-slate-400 mt-2">Erstellt: {new Date(run.created_at).toLocaleDateString("de-DE")}</p>
          </div>
        </div>
      </div>

      {/* Block-Grid */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-4">Blöcke im Detail</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {blocks.map((block) => (
            <Link key={block.block} href={`/admin/runs/${runId}?block=${block.block}`}>
              <div className={`relative overflow-hidden bg-white rounded-2xl border-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 cursor-pointer ${
                block.percent === 100 ? "border-brand-success/50" : block.percent > 0 ? "border-brand-primary/30" : "border-slate-200"
              }`}>
                {/* Top accent */}
                <div className={`h-1.5 ${
                  block.percent === 100
                    ? "bg-gradient-to-r from-brand-success-dark to-brand-success"
                    : block.percent > 0
                      ? "bg-gradient-to-r from-brand-primary-dark to-brand-primary"
                      : "bg-slate-200"
                }`} />

                <div className="p-5">
                  {/* Block header */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Block {block.block}</h4>
                      <p className="text-xs text-slate-500">{block.name}</p>
                    </div>
                    <span className="text-2xl font-bold tabular-nums text-slate-900">{block.percent}%</span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 mb-3">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${block.percent}%`,
                        background: block.percent === 100
                          ? "linear-gradient(to right, #00a84f, #4dcb8b)"
                          : block.percent > 0
                            ? "linear-gradient(to right, #120774, #4454b8)"
                            : "#cbd5e1",
                      }}
                    />
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {block.answered}/{block.total}
                    </span>
                    {block.evidenceCount > 0 && (
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3 text-brand-primary" />
                        {block.evidenceCount} Evidence
                      </span>
                    )}
                    {block.checkpoint && (
                      <span className="flex items-center gap-1 text-brand-success-dark">
                        <CheckCircle2 className="h-3 w-3" />
                        v{block.checkpoint.version}
                      </span>
                    )}
                  </div>

                  {/* Last activity */}
                  {block.lastActivity && (
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
                      <Clock className="h-3 w-3" />
                      Letzte Aktivität: {new Date(block.lastActivity).toLocaleString("de-DE")}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
