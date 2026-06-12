// V9 SLC-167 MT-6 — Curation-Page (GF-Gate-3).
// V9.5 SLC-V9.5-D MT-4 — Curation-Contract-Shift (DEC-214, AC-D-4): kuratiert
//   werden konsolidierte email_synthesized_unit-Rows; editierbar ab Status
//   'synthesized' (Synthese-Stage SLC-V9.5-B) statt 'pattern_extracted'.
//
// Server-Component analog ../page.tsx + ../filter-review/page.tsx.
// Auth-Gate identisch: tenant_admin only.
//
// Lifecycle:
//   - Status NOT IN ('synthesized', 'curating', 'importing', 'completed', 'failed'):
//     Banner "Curation noch nicht verfuegbar"
//   - Status IN ('synthesized', 'curating'): editierbar.
//   - Status IN ('importing', 'completed'): read-only.
//   - Status 'failed': Failure-Banner + Read-Only.
//
// Pattern-Reuse:
//   - Auth-Gate + profile + role-Check: ../filter-review/page.tsx:182-205
//   - Header + Back-Link: ../filter-review/page.tsx:215-232
//   - Status-Banner: ../filter-review/page.tsx:89-180

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import { getCurationData } from "./actions";
import { CurationClient } from "./CurationClient";

interface CurationPageProps {
  params: Promise<{ run_id: string }>;
}

const EDITABLE_STATUSES = new Set(["synthesized", "curating"]);
const PENDING_STATUSES = new Set([
  "uploaded",
  "parsing",
  "parsed",
  "pre_filtering",
  "pre_filtered",
  "thread_redacting",
  "thread_redacted",
  "pattern_extracting",
  // SLC-V9.5-D: pattern_extracted ist jetzt PENDING — die Synthese-Stage
  // (SLC-V9.5-B/C) laeuft danach und flippt auf 'synthesized'.
  "pattern_extracted",
  "synthesizing",
]);
const FINISHED_STATUSES = new Set(["importing", "completed"]);

function StatusBanner({
  status,
  runId,
}: {
  status: string;
  runId: string;
}) {
  if (EDITABLE_STATUSES.has(status)) return null;

  if (status === "failed") {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
      >
        <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-800">
            Pipeline fehlgeschlagen
          </p>
          <p className="mt-1 text-sm text-red-700">
            Dieser Bulk-Run hat die Pipeline nicht abgeschlossen. Bereits
            synthetisierte Wissens-Bausteine sind unten read-only sichtbar.
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

  if (PENDING_STATUSES.has(status)) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
      >
        <AlertCircle className="h-5 w-5 flex-shrink-0 text-slate-400" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">
            Curation noch nicht verfuegbar
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Die Pipeline laeuft noch (Status: <code>{status}</code>). Sobald die
            Cross-Thread-Synthese abgeschlossen ist (<code>synthesized</code>),
            kannst du die Wissens-Bausteine kuratieren.
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

  if (FINISHED_STATUSES.has(status)) {
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4"
      >
        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-500" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-800">
            Curation abgeschlossen
          </p>
          <p className="mt-1 text-sm text-green-700">
            Status: <code>{status}</code>. Wissens-Bausteine sind read-only.
            Aenderungen sind nach Abschluss nicht mehr moeglich.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export default async function CurationPage({ params }: CurationPageProps) {
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

  const data = await getCurationData(runId);
  if (!data) {
    notFound();
  }

  const editable = EDITABLE_STATUSES.has(data.run.status);
  const finished = FINISHED_STATUSES.has(data.run.status);

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
          Wissens-Curation: {data.run.source_file_name}
        </h1>
        <p className="text-sm text-slate-500">
          Konsolidierte Wissens-Bausteine kuratieren — akzeptieren, ablehnen,
          editieren und Sections zuordnen. Akzeptierte Bausteine werden ins
          Handbuch uebernommen.
        </p>
      </header>

      <StatusBanner status={data.run.status} runId={runId} />

      <CurationClient
        bulkRunId={runId}
        units={data.units}
        sections={data.sections}
        progress={data.progress}
        editable={editable}
        finished={finished}
      />
    </main>
  );
}
