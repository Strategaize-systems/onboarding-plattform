"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { ProgressIndicator } from "@/components/progress-indicator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Menu, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { HelpButton } from "@/components/help-button";
import { LearningCenterPanel } from "@/components/learning-center/learning-center-panel";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

interface Profile {
  id: string;
  tenant_id: string | null;
  email: string;
  role: string;
}

interface Run {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  question_count: number;
  answered_count: number;
  evidence_count: number;
  created_at: string;
  submitted_at: string | null;
}

export function DashboardClient({ profile }: { profile: Profile }) {
  const t = useTranslations();
  const locale = useLocale();
  const isMirror = profile.role === "mirror_respondent";
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [learningCenterOpen, setLearningCenterOpen] = useState(false);

  useEffect(() => {
    async function loadRuns() {
      try {
        const res = await fetch("/api/tenant/runs");
        if (res.ok) {
          const data = await res.json();
          setRuns(data.runs ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    loadRuns();
  }, []);

  const sidebar = <DashboardSidebar profile={profile} activePage="runs" />;

  // ─── Main layout ──────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-white p-2 shadow-md lg:hidden"
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[280px] transform transition-transform duration-300 lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 bg-white/95 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
          <div className="flex items-center justify-between px-8 py-5 pl-14 lg:pl-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{isMirror ? t("mirror.dashboardTitle") : t("dashboard.title")}</h1>
              <p className="text-sm text-slate-500 mt-0.5">{isMirror ? t("mirror.dashboardSubtitle") : t("dashboard.subtitle")}</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="mx-auto max-w-4xl">
            {loading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-xl" />
                ))}
              </div>
            ) : runs.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                    <FileText className="h-8 w-8 text-slate-400" />
                  </div>
                  <p className="text-lg font-semibold text-slate-900">{t("dashboard.emptyTitle")}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {t("dashboard.emptyDescription")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {runs.map((run) => (
                  <Link key={run.id} href={`/runs/${run.id}`}>
                    <Card className="relative overflow-hidden cursor-pointer">
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-primary-dark to-brand-primary" />
                      <CardHeader className="pb-3 pt-5">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg text-brand-primary-dark">{run.title}</CardTitle>
                          <StatusBadge status={run.status} />
                        </div>
                        {run.description && (
                          <CardDescription>{run.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <ProgressIndicator
                          answered={run.answered_count}
                          total={run.question_count}
                        />
                        <div className="flex flex-wrap gap-4 text-xs text-slate-500 mt-3">
                          <span>
                            <span className="font-semibold text-brand-primary">{run.evidence_count}</span> {t("dashboard.evidenceLabel")}
                          </span>
                          <span>
                            {t("dashboard.created", { date: new Date(run.created_at).toLocaleDateString(locale) })}
                          </span>
                          {run.submitted_at && (
                            <span>
                              {t("dashboard.submitted", { date: new Date(run.submitted_at).toLocaleDateString(locale) })}
                            </span>
                          )}
                          {run.due_date && (() => {
                            const due = new Date(run.due_date);
                            const now = new Date();
                            const daysLeft = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                            const badgeClass = daysLeft < 0
                              ? "bg-red-100 text-red-700 border border-red-300"
                              : daysLeft <= 3
                                ? "bg-amber-100 text-amber-700 border border-amber-300"
                                : "bg-slate-100 text-slate-600 border border-slate-200";
                            const label = daysLeft < 0 ? t("deadline.overdue") : daysLeft <= 3 ? t("deadline.dueSoon") : t("deadline.dueDate");
                            return (
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badgeClass}`}>
                                {label}: {due.toLocaleDateString(locale)}
                              </span>
                            );
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Learning Center */}
      <HelpButton onClick={() => setLearningCenterOpen(true)} />
      <LearningCenterPanel
        open={learningCenterOpen}
        onOpenChange={setLearningCenterOpen}
        isMirror={isMirror}
      />
    </div>
  );
}
