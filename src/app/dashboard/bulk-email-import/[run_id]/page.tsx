// V9 SLC-165 MT-6 — Bulk-Run-Detail-View mit Pipeline-Stufen-Progress.
//
// Server-Component analog ../page.tsx. Auth-Gate identisch (tenant_admin only;
// strategaize_admin landet auf /dashboard weil V9.0 keinen Cross-Tenant-Admin-
// View hat — RLS-Policy erlaubt SELECT, aber die UI-Route ist V9.0-tenant-only).
//
// Pipeline-Stufen werden aus dem run.status abgeleitet (8 logische Steps:
// Upload → Parsen → Pre-Filter → Threads redacten → Pattern-Extraktion →
// Kuration → Import → Abgeschlossen). Live-Polling via wiederverwendeter
// AutoRefresh-Komponente (Pattern aus src/app/admin/handbook/AutoRefresh.tsx,
// SLC-040) — nur aktiv, wenn der Run noch nicht im Terminal-Status ist.
//
// Failure-Reason wird als Banner gerendert, sobald status='failed'. Storage-
// Pfad bleibt bewusst NICHT sichtbar (sensitiv, RLS-Backstop reicht).

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Circle,
  ArrowRight,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AutoRefresh } from "@/app/admin/handbook/AutoRefresh";

import {
  getBulkRunById,
  getThreadStatusBreakdown,
  type ThreadStatusBreakdown,
} from "../actions";
import type { BulkRunStatus, BulkRunSummary } from "../helpers";

interface PipelineStep {
  key: string;
  label: string;
  /** status-Werte die "diese Stufe ist aktiv (laeuft gerade)" bedeuten. */
  activeStatuses: BulkRunStatus[];
  /** status-Werte ab denen diese Stufe abgeschlossen ist. */
  doneFromStatuses: BulkRunStatus[];
}

// Statuswerte in semantisch sortierter Reihenfolge — wird zur Done-Detection
// genutzt (ein Status hat alle Stufen `done`, deren Pivot vorher liegt).
const STATUS_ORDER: BulkRunStatus[] = [
  "uploaded",
  "parsing",
  "parsed",
  "pre_filtering",
  "pre_filtered",
  "thread_redacting",
  "thread_redacted",
  "pattern_extracting",
  "pattern_extracted",
  "curating",
  "importing",
  "completed",
];

const PIPELINE_STEPS: PipelineStep[] = [
  {
    key: "upload",
    label: "Upload",
    activeStatuses: ["uploaded"],
    doneFromStatuses: ["parsing"],
  },
  {
    key: "parse",
    label: "Parsen",
    activeStatuses: ["parsing"],
    doneFromStatuses: ["parsed"],
  },
  {
    key: "pre_filter",
    label: "Pre-Filter",
    activeStatuses: ["pre_filtering"],
    doneFromStatuses: ["pre_filtered"],
  },
  {
    key: "thread_redact",
    label: "Threads redacten",
    activeStatuses: ["thread_redacting"],
    doneFromStatuses: ["thread_redacted"],
  },
  {
    key: "pattern_extract",
    label: "Pattern-Extraktion",
    activeStatuses: ["pattern_extracting"],
    doneFromStatuses: ["pattern_extracted"],
  },
  {
    key: "curation",
    label: "Kuration",
    activeStatuses: ["curating"],
    doneFromStatuses: ["importing"],
  },
  {
    key: "import",
    label: "Import in Handbuch",
    activeStatuses: ["importing"],
    doneFromStatuses: ["completed"],
  },
  {
    key: "complete",
    label: "Abgeschlossen",
    activeStatuses: [],
    doneFromStatuses: ["completed"],
  },
];

const TERMINAL_STATUSES: BulkRunStatus[] = ["completed", "failed"];

function isTerminal(status: BulkRunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

type StepState = "done" | "active" | "pending";

function stepStateFor(step: PipelineStep, status: BulkRunStatus): StepState {
  // failed: Upload ist immer done (sonst gaebe es keinen Run-Record), alles
  // andere bleibt pending — wir wissen nicht, in welcher Stufe der Fehler
  // entstand. Das Failure-Banner oberhalb zeigt die Ursache.
  if (status === "failed") {
    return step.key === "upload" ? "done" : "pending";
  }

  if (step.activeStatuses.includes(status)) {
    return "active";
  }

  const currentIdx = STATUS_ORDER.indexOf(status);
  if (currentIdx < 0) {
    return "pending";
  }
  // Step ist done, sobald der current-status mindestens auf Hoehe eines der
  // done-Trigger-Werte liegt.
  const reachedDone = step.doneFromStatuses.some(
    (s) => currentIdx >= STATUS_ORDER.indexOf(s),
  );
  return reachedDone ? "done" : "pending";
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return isoString;
  }
}

function formatEuro(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return <CheckCircle2 className="h-5 w-5 text-green-500" aria-hidden />;
  }
  if (state === "active") {
    return <Loader2 className="h-5 w-5 text-brand-primary animate-spin" aria-hidden />;
  }
  return <Circle className="h-5 w-5 text-slate-300" aria-hidden />;
}

function PipelineProgress({ status }: { status: BulkRunStatus }) {
  return (
    <ol
      data-testid="pipeline-progress"
      data-status={status}
      className="space-y-3"
    >
      {PIPELINE_STEPS.map((step) => {
        const state = stepStateFor(step, status);
        const labelClass =
          state === "done"
            ? "text-slate-700"
            : state === "active"
              ? "text-brand-primary font-medium"
              : "text-slate-400";
        return (
          <li
            key={step.key}
            data-step={step.key}
            data-state={state}
            className="flex items-center gap-3"
          >
            <StepIcon state={state} />
            <span className={`text-sm ${labelClass}`}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium tabular-nums text-slate-900">
        {value}
      </span>
    </div>
  );
}

// V9 SLC-166 MT-7 — Thread-Aggregation-Card mit Live-Counts pro thread_status.
//
// Sichtbar, sobald die Pipeline mind. status='thread_redacting' erreicht hat
// (vorher ist breakdown.total=0 und die Card waere irrelevant). Bei
// status='pre_filtered' rendert die Card stattdessen den Filter-Review-Link.
//
// Aggregat-Quelle: getThreadStatusBreakdown (RLS-scoped). Auto-Refresh via
// AutoRefresh-Komponente uebernimmt die Live-Aktualisierung.
function ThreadAggregationCard({
  breakdown,
  run,
}: {
  breakdown: ThreadStatusBreakdown;
  run: BulkRunSummary;
}) {
  const denominator =
    run.content_emails > 0 ? run.content_emails : breakdown.total;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Thread-Aggregation und PII-Redaction</CardTitle>
        <CardDescription>
          {breakdown.total > 0
            ? "Threads, die aus content + unclear Emails aggregiert wurden."
            : "Noch keine Threads aggregiert — laeuft mit der Pre-Filter-Approval."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <StatRow
            label="Threads erkannt"
            value={`${breakdown.total} (aus ${denominator} Emails)`}
          />
          <StatRow
            label="Redact abgeschlossen"
            value={`${breakdown.redacted} / ${breakdown.total}`}
          />
          {breakdown.redacting > 0 ? (
            <StatRow
              label="Redact laeuft"
              value={`${breakdown.redacting}`}
            />
          ) : null}
          {breakdown.aggregated > 0 ? (
            <StatRow
              label="Aggregiert (noch nicht redacted)"
              value={`${breakdown.aggregated}`}
            />
          ) : null}
          {breakdown.failed > 0 ? (
            <StatRow
              label="Fehlgeschlagen"
              value={
                <span className="text-red-600">{breakdown.failed}</span>
              }
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// V9 SLC-166 MT-7 — Inline-Banner mit Link zur Filter-Review-UI.
// Sichtbar exklusiv waehrend status='pre_filtered' (GF-Gate vor Thread-Redact).
function FilterReviewLinkBanner({ runId }: { runId: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-primary/30 bg-brand-primary/5 p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-brand-primary">
          Pre-Filter abgeschlossen — bitte Klassifikationen reviewen
        </p>
        <p className="text-sm text-slate-600">
          Du kannst einzelne Emails korrigieren oder Bulk-Reclassify ausfuehren,
          bevor Threads aggregiert und redacted werden.
        </p>
      </div>
      <Link
        href={`/dashboard/bulk-email-import/${runId}/filter-review`}
        className="inline-flex items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary/90"
      >
        Filter-Review oeffnen
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function RunStats({ run }: { run: BulkRunSummary }) {
  // SLC-168 MT-4 — Cost-Split (Pre-Filter + Pattern-Extraktion) und completed_at
  // werden zusaetzlich angezeigt, sobald der Run terminal ist (completed). Bei
  // status='failed' bleibt nur die Gesamt-Kosten-Zeile (Split aus dem Run-Lauf
  // ist immer noch persistiert, wir verschweigen ihn aber nicht).
  const isCompleted = run.status === "completed";
  return (
    <div className="space-y-1">
      <StatRow label="Datei" value={run.source_file_name} />
      <StatRow label="Emails gesamt" value={run.email_count} />
      <StatRow label="Inhalts-Emails (nach Pre-Filter)" value={run.content_emails} />
      <StatRow label="Threads" value={run.thread_count} />
      <StatRow label="Pattern extrahiert" value={run.patterns_extracted} />
      <StatRow label="Pattern akzeptiert" value={run.patterns_accepted} />
      <StatRow label="Pattern importiert" value={run.patterns_imported} />
      <StatRow
        label="Pre-Filter-Kosten (Haiku)"
        value={formatEuro(run.pre_filter_cost_eur)}
      />
      <StatRow
        label="Pattern-Extraktion-Kosten (Sonnet)"
        value={formatEuro(run.pattern_extraction_cost_eur)}
      />
      <StatRow label="Gesamt-Kosten" value={formatEuro(run.total_cost_eur)} />
      <StatRow label="Hochgeladen" value={formatDate(run.created_at)} />
      <StatRow label="Letzte Aenderung" value={formatDate(run.updated_at)} />
      {isCompleted && run.completed_at ? (
        <StatRow label="Abgeschlossen" value={formatDate(run.completed_at)} />
      ) : null}
    </div>
  );
}

interface BulkEmailRunDetailPageProps {
  params: Promise<{ run_id: string }>;
}

export default async function BulkEmailRunDetailPage({
  params,
}: BulkEmailRunDetailPageProps) {
  const { run_id: runId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .single();
  if (!profile) {
    redirect("/login");
  }
  if (profile.role !== "tenant_admin") {
    redirect("/dashboard");
  }

  const run = await getBulkRunById(runId);
  if (!run) {
    // RLS-Miss oder unbekannte ID — kein Unterschied nach aussen (404 fuer beide).
    notFound();
  }

  // V9 SLC-166 MT-7 — Live-Thread-Aggregation. Parallel zum run-Load, weil
  // unabhaengig. Bei null (RLS-Miss / DB-Fehler) rendert die Card nicht.
  const threadBreakdown = await getThreadStatusBreakdown(runId);

  const pollActive = !isTerminal(run.status);
  const showFilterReviewLink = run.status === "pre_filtered";
  const showThreadAggregation =
    threadBreakdown !== null && threadBreakdown.total > 0;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      {pollActive ? <AutoRefresh intervalMs={3000} /> : null}

      <header className="space-y-2">
        <Link
          href="/dashboard/bulk-email-import"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurueck zur Uebersicht
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          {run.source_file_name}
        </h1>
        <p className="text-sm text-slate-500">
          Bulk-Email-Import — Detail-Ansicht und Pipeline-Status.
        </p>
      </header>

      {run.status === "failed" && run.failure_reason ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
        >
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              Import fehlgeschlagen
            </p>
            <p className="mt-1 text-sm text-red-700">{run.failure_reason}</p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Pipeline-Status</CardTitle>
          <CardDescription>
            {pollActive
              ? "Aktualisiert sich automatisch alle 3 Sekunden."
              : "Pipeline abgeschlossen."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PipelineProgress status={run.status} />
        </CardContent>
      </Card>

      {showFilterReviewLink ? (
        <FilterReviewLinkBanner runId={run.id} />
      ) : null}

      {showThreadAggregation && threadBreakdown ? (
        <ThreadAggregationCard breakdown={threadBreakdown} run={run} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Kennzahlen</CardTitle>
          <CardDescription>
            Werte aktualisieren sich, sobald die jeweilige Pipeline-Stufe
            abgeschlossen ist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RunStats run={run} />
        </CardContent>
      </Card>
    </main>
  );
}
