// V9 SLC-165 MT-4 — Bulk-Email-Import Dashboard-Page.
//
// Server-Component mit Auth-Gate (tenant_admin) + Upload-Zone + Status-Liste.
// Pattern-Reuse: Auth/Profile-Read aus diagnose/start/page.tsx; Card-Layout aus
// shadcn/ui Standard; Drag-Drop-Zone aus evidence FileUploadZone (FEAT-013).

import { redirect } from "next/navigation";
import Link from "next/link";
import { Mail } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { BulkEmailUploadZone } from "./BulkEmailUploadZone";
import { listBulkRunsForTenant } from "./actions";
import type { BulkRunStatus, BulkRunSummary } from "./helpers";

export const metadata = {
  title: "Bulk-Email-Import | Strategaize",
  description:
    "Historische .mbox-/.eml-Datei hochladen und gegen Pattern-Extraktion auswerten.",
};

const STATUS_LABEL: Record<BulkRunStatus, string> = {
  uploaded: "Hochgeladen",
  parsing: "Parsen laeuft",
  parsed: "Geparst",
  pre_filtering: "Pre-Filter laeuft",
  pre_filtered: "Pre-Filter fertig",
  thread_redacting: "Threads redacten",
  thread_redacted: "Threads redactet",
  pattern_extracting: "Pattern-Extraktion",
  pattern_extracted: "Pattern extrahiert",
  curating: "Kuration offen",
  importing: "Import laeuft",
  completed: "Abgeschlossen",
  failed: "Fehlgeschlagen",
};

const STATUS_BADGE_CLASS: Record<BulkRunStatus, string> = {
  uploaded: "bg-slate-100 text-slate-700",
  parsing: "bg-blue-100 text-blue-700",
  parsed: "bg-blue-100 text-blue-700",
  pre_filtering: "bg-indigo-100 text-indigo-700",
  pre_filtered: "bg-indigo-100 text-indigo-700",
  thread_redacting: "bg-violet-100 text-violet-700",
  thread_redacted: "bg-violet-100 text-violet-700",
  pattern_extracting: "bg-purple-100 text-purple-700",
  pattern_extracted: "bg-purple-100 text-purple-700",
  curating: "bg-amber-100 text-amber-700",
  importing: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

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

function StatusBadge({ status }: { status: BulkRunStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function RunRow({ run }: { run: BulkRunSummary }) {
  return (
    <tr className="border-t border-slate-200">
      <td className="px-3 py-2 text-sm">
        <Link
          href={`/dashboard/bulk-email-import/${run.id}`}
          className="text-brand-primary hover:underline"
        >
          {run.source_file_name}
        </Link>
      </td>
      <td className="px-3 py-2 text-sm tabular-nums">{run.email_count}</td>
      <td className="px-3 py-2 text-sm">
        <StatusBadge status={run.status} />
      </td>
      <td className="px-3 py-2 text-sm text-slate-500">
        {formatDate(run.created_at)}
      </td>
    </tr>
  );
}

export default async function BulkEmailImportPage() {
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

  // Auth-Gate: tenant_admin only. strategaize_admin sieht eigenen Cockpit
  // (Cross-Tenant-Read funktioniert ueber RLS — separater Admin-View kaeme in
  // V9.1+). employee/tenant_member werden bewusst auf /dashboard zurueck-redirected.
  if (profile.role !== "tenant_admin") {
    redirect("/dashboard");
  }

  const runs = await listBulkRunsForTenant();

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary/10">
          <Mail className="h-5 w-5 text-brand-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Bulk-Email-Import
          </h1>
          <p className="text-sm text-slate-500">
            Historische Gmail-Takeout-.mbox oder einzelne .eml-Dateien hochladen,
            Pattern-Extraktion laeuft anschliessend automatisch.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Datei hochladen</CardTitle>
          <CardDescription>
            Datei wird ausschliesslich in Ihrem Tenant gespeichert. Doppelte
            Uploads werden automatisch erkannt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BulkEmailUploadZone />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bisherige Importe</CardTitle>
          <CardDescription>
            {runs.length === 0
              ? "Noch keine Imports gestartet."
              : `${runs.length} Import${runs.length === 1 ? "" : "e"} sichtbar.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-slate-500">
              Starten Sie oben einen Import, um die Pattern-Pipeline auszuloesen.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Datei</th>
                    <th className="px-3 py-2">Emails</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Hochgeladen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {runs.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
