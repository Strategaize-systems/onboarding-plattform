"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Menu, X, Clock, PlayCircle, CheckCircle2, MessageSquare, ClipboardList, FileUp, Mic } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { HelpButton } from "@/components/help-button";
import { LearningCenterPanel } from "@/components/learning-center/learning-center-panel";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { createClient } from "@/lib/supabase/client";

interface Profile {
  id: string;
  tenant_id: string | null;
  email: string;
  role: string;
}

interface CaptureSession {
  id: string;
  status: string;
  started_at: string;
  updated_at: string;
  capture_mode: string | null;
  template: { name: string; slug: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  active: { label: "dashboard.statusActive", icon: PlayCircle, className: "bg-blue-50 text-blue-700 border-blue-200" },
  completed: { label: "dashboard.statusCompleted", icon: CheckCircle2, className: "bg-green-50 text-green-700 border-green-200" },
};

export function DashboardClient({ profile }: { profile: Profile }) {
  const t = useTranslations();
  const locale = useLocale();
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [learningCenterOpen, setLearningCenterOpen] = useState(false);
  const [gapCounts, setGapCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadSessions() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("capture_session")
          .select("id, status, started_at, updated_at, capture_mode, template:template_id(name, slug)")
          .order("updated_at", { ascending: false });
        const mapped: CaptureSession[] = (data ?? []).map((row) => ({
          id: row.id,
          status: row.status,
          started_at: row.started_at,
          updated_at: row.updated_at,
          capture_mode: (row as Record<string, unknown>).capture_mode as string | null,
          template: Array.isArray(row.template) ? row.template[0] ?? null : row.template,
        }));
        setSessions(mapped);

        // Load pending gap question counts per session
        const { data: pendingGaps } = await supabase
          .from("gap_question")
          .select("capture_session_id")
          .eq("status", "pending");

        if (pendingGaps && pendingGaps.length > 0) {
          const counts: Record<string, number> = {};
          for (const g of pendingGaps) {
            counts[g.capture_session_id] = (counts[g.capture_session_id] ?? 0) + 1;
          }
          setGapCounts(counts);
        }
      } finally {
        setLoading(false);
      }
    }
    loadSessions();
  }, []);

  const sidebar = <DashboardSidebar profile={profile} activePage="capture" />;

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
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t("dashboard.title")}</h1>
              <p className="text-sm text-slate-500 mt-0.5">{t("dashboard.subtitle")}</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="mx-auto max-w-4xl">
            {loading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-xl" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
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
                {sessions.map((session) => {
                  const statusCfg = STATUS_CONFIG[session.status] ?? {
                    label: "dashboard.statusActive",
                    icon: Clock,
                    className: "bg-slate-50 text-slate-600 border-slate-200",
                  };
                  const StatusIcon = statusCfg.icon;
                  const ModeIcon =
                    session.capture_mode === "dialogue"
                      ? Mic
                      : session.capture_mode === "evidence"
                        ? FileUp
                        : ClipboardList;
                  const modeLabel =
                    session.capture_mode === "dialogue"
                      ? t("dashboard.modeDialogue")
                      : session.capture_mode === "evidence"
                        ? t("dashboard.modeEvidence")
                        : t("dashboard.modeQuestionnaire");
                  const sessionHref =
                    session.capture_mode === "dialogue"
                      ? `/admin/session/${session.id}/dialogue`
                      : `/capture/${session.id}`;

                  return (
                    <Link key={session.id} href={sessionHref}>
                      <Card className="relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-primary-dark to-brand-primary" />
                        <CardHeader className="pb-3 pt-5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <ModeIcon className="h-4 w-4 text-slate-400" />
                              <CardTitle className="text-lg text-brand-primary-dark">
                                {session.template?.name ?? t("dashboard.unknownTemplate")}
                              </CardTitle>
                            </div>
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusCfg.className}`}>
                              <StatusIcon className="h-3.5 w-3.5" />
                              {t(statusCfg.label)}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              {modeLabel}
                            </span>
                            <span>
                              {t("dashboard.started", { date: new Date(session.started_at).toLocaleDateString(locale) })}
                            </span>
                            <span>
                              {t("dashboard.lastUpdated", { date: new Date(session.updated_at).toLocaleDateString(locale) })}
                            </span>
                            {(gapCounts[session.id] ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                <MessageSquare className="h-3 w-3" />
                                {t("gapQuestions.pendingBadge", { count: gapCounts[session.id] })}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
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
      />
    </div>
  );
}
