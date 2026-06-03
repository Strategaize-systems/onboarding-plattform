// V9 SLC-166 MT-3 — Filter-Review-Page (GF-Klassifikations-Review).
//
// Server-Component analog ../page.tsx (Bulk-Run-Detail-View aus SLC-165 MT-6).
// Auth-Gate identisch: tenant_admin only. strategaize_admin landet auf
// /dashboard (V9.0 hat keinen Cross-Tenant-Admin-Review — RLS-Policy erlaubt
// SELECT, aber UI ist tenant-only weil Approval-Aktionen Tenant-scoped sind).
//
// Lifecycle:
//   - Status != 'pre_filtered': Banner "Filter-Review noch nicht verfuegbar"
//     + Link zurueck zur Detail-View.
//   - Status == 'pre_filtered': Counts-Card + Filter-Liste + Approval-Button.
//   - Status > 'pre_filtered': Banner "Pre-Filter bereits approved" +
//     Read-Only-Liste.
//
// Pattern-Reuse:
//   - Auth-Gate + profile + role-Check: ../page.tsx:241-264
//   - Header + Back-Link: ../page.tsx:278-292
//   - Card-Layout: shadcn

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { getFilterReviewData } from "./actions";
import { FilterReviewClient } from "./FilterReviewClient";
import {
  PRE_FILTER_LABELS,
  PRE_FILTER_LABEL_DESCRIPTIONS,
} from "./helpers";

interface FilterReviewPageProps {
  params: Promise<{ run_id: string }>;
}

function CountsCard({
  counts,
  total,
}: {
  counts: Record<string, number>;
  total: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Klassifikations-Uebersicht</CardTitle>
        <CardDescription>
          {total} Email{total === 1 ? "" : "s"} insgesamt klassifiziert. Pruefe
          die Verteilung, korrigiere bei Bedarf, und gib dann frei.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRE_FILTER_LABELS.map((label) => {
            const count = counts[label] ?? 0;
            return (
              <li
                key={label}
                data-label={label}
                data-count={count}
                className="flex items-baseline justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <span
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                  title={PRE_FILTER_LABEL_DESCRIPTIONS[label]}
                >
                  {label}
                </span>
                <span className="text-lg font-semibold tabular-nums text-slate-900">
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function StatusBanner({
  status,
  runId,
}: {
  status: string;
  runId: string;
}) {
  if (status === "pre_filtered") return null;

  const isPending =
    status === "uploaded" ||
    status === "parsing" ||
    status === "parsed" ||
    status === "pre_filtering";
  const isFailed = status === "failed";
  const isAfter = !isPending && !isFailed; // Status > pre_filtered

  if (isFailed) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
      >
        <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-800">
            Pre-Filter fehlgeschlagen
          </p>
          <p className="mt-1 text-sm text-red-700">
            Dieser Bulk-Run hat den Pre-Filter nicht abgeschlossen. Bitte die
            Detail-View oeffnen fuer Details.
          </p>
          <Link
            href={`/dashboard/bulk-email-import/${runId}`}
            className="mt-2 inline-flex items-center gap-1 text-sm text-red-800 underline"
          >
            Zur Detail-View
          </Link>
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
      >
        <AlertCircle className="h-5 w-5 flex-shrink-0 text-slate-400" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">
            Filter-Review noch nicht verfuegbar
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Der Pre-Filter laeuft noch (Status: <code>{status}</code>). Sobald
            er abgeschlossen ist (<code>pre_filtered</code>), kannst du die
            Klassifikationen pruefen und freigeben.
          </p>
          <Link
            href={`/dashboard/bulk-email-import/${runId}`}
            className="mt-2 inline-flex items-center gap-1 text-sm text-slate-700 underline"
          >
            Zur Detail-View mit Live-Progress
          </Link>
        </div>
      </div>
    );
  }

  if (isAfter) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4"
      >
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-500" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-800">
            Pre-Filter bereits freigegeben
          </p>
          <p className="mt-1 text-sm text-green-700">
            Status: <code>{status}</code>. Klassifikationen sind read-only.
            Aenderungen sind nach Approval nicht mehr moeglich.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export default async function FilterReviewPage({
  params,
}: FilterReviewPageProps) {
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

  const data = await getFilterReviewData(runId);
  if (!data) {
    notFound();
  }

  const editable = data.run.status === "pre_filtered";

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="space-y-2">
        <Link
          href={`/dashboard/bulk-email-import/${runId}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurueck zur Detail-Ansicht
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          Filter-Review: {data.run.source_file_name}
        </h1>
        <p className="text-sm text-slate-500">
          KI-Klassifikation pruefen, bei Bedarf korrigieren und Pre-Filter
          freigeben fuer den naechsten Pipeline-Schritt (Thread-Aggregation +
          PII-Redaction).
        </p>
      </header>

      <StatusBanner status={data.run.status} runId={runId} />

      <CountsCard counts={data.counts} total={data.items.length} />

      <FilterReviewClient
        bulkRunId={runId}
        items={data.items}
        editable={editable}
      />
    </main>
  );
}
