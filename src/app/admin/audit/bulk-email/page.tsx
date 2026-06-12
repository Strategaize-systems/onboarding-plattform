// V9 SLC-168 MT-4 — Admin Cross-Tenant Bulk-Email-Audit-View (FEAT-074).
//
// Strategaize-admin-only-Page. Listet alle bulk_run-Records Cross-Tenant mit
// Tenant-Name, Status, Final-Stats, Cost-Aggregat (vw_bulk_email_cost_monthly
// per Tenant + aktueller Monat).
//
// Pattern-Reuse:
//   - Auth-Gate strategaize_admin: src/app/admin/tenants/page.tsx:24-26 (SLC-040+)
//   - createAdminClient + try/catch fuer service_role-Lookup: gleicher Pattern
//   - Server-Component (kein Client-Interaktiv-State — V9.0 read-only Audit)
//
// Sicherheits-Hinweis:
//   - Role-Check vor jeder Data-Load — kein Cross-Tenant-Leak fuer tenant_admin
//   - admin-Client (service_role) bypassed RLS, deshalb Pflicht-Pre-Check oben
//   - Bei Fehler im Aggregations-Lookup faellt die Cost-Aggregation auf 0 zurueck

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getForwardSourceStats,
  type ForwardStatsRow,
} from "@/lib/bulk-email/forward-source-stats";
import { selectFlaggedRuns, flaggedStatusLabel } from "./banner-data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface BulkRunAuditRow {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  source_file_name: string;
  status: string;
  email_count: number;
  patterns_extracted: number;
  patterns_accepted: number;
  patterns_imported: number;
  total_cost_eur: string;
  created_at: string;
  completed_at: string | null;
}

interface TenantMonthlyCost {
  tenant_id: string;
  total_cost_eur: number;
  run_count: number;
}

function formatDate(isoString: string | null): string {
  if (!isoString) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

function formatEuro(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

function StatusPill({ status }: { status: string }) {
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const isInFlight = !isCompleted && !isFailed;
  const tone = isCompleted
    ? "bg-green-100 text-green-700"
    : isFailed
      ? "bg-red-100 text-red-700"
      : "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
      data-status={status}
      data-in-flight={isInFlight ? "true" : "false"}
    >
      {status}
    </span>
  );
}

export default async function AdminBulkEmailAuditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "strategaize_admin") {
    redirect("/dashboard");
  }

  // Daten-Load via service_role-Client. Tenant-Name-Lookup als Map fuer
  // konstanten JOIN. Bei Fehler in einer der Loads faellt die jeweilige
  // Komponente auf leere Anzeige zurueck — kein Crash.
  let runs: BulkRunAuditRow[] = [];
  let monthlyCosts: Map<string, TenantMonthlyCost> = new Map();
  let loadError: string | null = null;

  try {
    const adminClient = createAdminClient();

    const { data: runRows, error: runError } = await adminClient
      .from("email_bulk_run")
      .select(
        "id, tenant_id, source_file_name, status, email_count, patterns_extracted, patterns_accepted, patterns_imported, total_cost_eur, created_at, completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (runError) throw runError;

    const tenantIds = Array.from(
      new Set((runRows ?? []).map((r) => r.tenant_id as string)),
    );

    const tenantNameMap = new Map<string, string>();
    if (tenantIds.length > 0) {
      const { data: tenantRows } = await adminClient
        .from("tenants")
        .select("id, name")
        .in("id", tenantIds);
      for (const t of tenantRows ?? []) {
        tenantNameMap.set(t.id as string, t.name as string);
      }
    }

    runs = (runRows ?? []).map((r) => ({
      id: r.id as string,
      tenant_id: r.tenant_id as string,
      tenant_name: tenantNameMap.get(r.tenant_id as string) ?? null,
      source_file_name: r.source_file_name as string,
      status: r.status as string,
      email_count: Number(r.email_count ?? 0),
      patterns_extracted: Number(r.patterns_extracted ?? 0),
      patterns_accepted: Number(r.patterns_accepted ?? 0),
      patterns_imported: Number(r.patterns_imported ?? 0),
      total_cost_eur: r.total_cost_eur as string,
      created_at: r.created_at as string,
      completed_at: r.completed_at as string | null,
    }));

    // Cost-Aggregat aus vw_bulk_email_cost_monthly fuer aktuellen Monat.
    // Pattern-Reuse: SLC-167 MT-1 (Migration 109 + cost-cap.ts).
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthStartIso = monthStart.toISOString().slice(0, 10);

    // Hinweis: vw_bulk_email_cost_monthly (MIG-054) hat die Spalte `month`,
    // nicht `month_start` (Bug-Fix SLC-V9.1-D MT-5 — vorher silent leeres Aggregat).
    const { data: costRows } = await adminClient
      .from("vw_bulk_email_cost_monthly")
      .select("tenant_id, month, total_cost_eur, run_count")
      .eq("month", monthStartIso);

    for (const c of costRows ?? []) {
      monthlyCosts.set(c.tenant_id as string, {
        tenant_id: c.tenant_id as string,
        total_cost_eur: Number(c.total_cost_eur ?? 0),
        run_count: Number(c.run_count ?? 0),
      });
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    const { captureException } = await import("@/lib/logger");
    captureException(err, { source: "admin/audit/bulk-email/load" });
  }

  // SLC-V9.1-D MT-5: Forward-Source-Statistik (Inbound-Endpoints). Eigener Load,
  // damit ein Stats-Fehler die uebrige Audit-Sicht nicht bricht.
  let forwardStats: ForwardStatsRow[] = [];
  try {
    forwardStats = await getForwardSourceStats();
  } catch (err) {
    const { captureException } = await import("@/lib/logger");
    captureException(err, { source: "admin/audit/bulk-email/forward-stats" });
  }

  // Per-Tenant-Aggregat fuer Cost-Cap-Sicht.
  const tenantAggregates = new Map<
    string,
    {
      tenant_id: string;
      tenant_name: string | null;
      total_runs: number;
      total_cost_eur_all_time: number;
      monthly_cost_eur: number;
      monthly_run_count: number;
    }
  >();
  for (const run of runs) {
    const existing = tenantAggregates.get(run.tenant_id) ?? {
      tenant_id: run.tenant_id,
      tenant_name: run.tenant_name,
      total_runs: 0,
      total_cost_eur_all_time: 0,
      monthly_cost_eur: 0,
      monthly_run_count: 0,
    };
    existing.total_runs += 1;
    existing.total_cost_eur_all_time += Number(run.total_cost_eur ?? 0);
    tenantAggregates.set(run.tenant_id, existing);
  }
  for (const [tenantId, monthlyCost] of monthlyCosts) {
    const existing = tenantAggregates.get(tenantId);
    if (existing) {
      existing.monthly_cost_eur = monthlyCost.total_cost_eur;
      existing.monthly_run_count = monthlyCost.run_count;
    }
  }
  const tenantList = Array.from(tenantAggregates.values()).sort(
    (a, b) => b.monthly_cost_eur - a.monthly_cost_eur,
  );

  // SLC-V9.1-B MT-4: Cap-Hit / Approval-Banner. Quelle sind die geladenen Runs
  // (letzte 200) — fuer den Founder-internen V9.1-Test ausreichend.
  const flaggedRuns = selectFlaggedRuns(runs);

  return (
    <main
      className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 sm:py-10"
      data-page="admin-audit-bulk-email"
    >
      <header className="space-y-2">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurueck zum Admin-Cockpit
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          Bulk-Email-Import Audit (Cross-Tenant)
        </h1>
        <p className="text-sm text-slate-500">
          Strategaize-Admin-Sicht ueber alle Tenants. Live-Sicht auf die letzten
          200 Runs + Cost-Aggregation fuer den aktuellen Kalendermonat.
        </p>
      </header>

      {loadError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          Daten-Load fehlgeschlagen: {loadError}
        </div>
      ) : null}

      {flaggedRuns.length > 0 ? (
        <div
          role="alert"
          data-testid="cap-hit-banner"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">
            {flaggedRuns.length} Run(s) benoetigen Aufmerksamkeit (Kostenlimit
            erreicht oder Freigabe erforderlich).
          </p>
          <ul className="mt-2 space-y-1">
            {flaggedRuns.map((run) => {
              const meta = flaggedStatusLabel(run.status);
              return (
                <li
                  key={run.id}
                  data-flagged-run-id={run.id}
                  data-flagged-status={run.status}
                  className="flex items-center justify-between gap-3"
                >
                  <span>
                    <span className="font-medium">
                      {run.tenant_name ?? "(unbenannt)"}
                    </span>{" "}
                    — {meta.label}
                  </span>
                  <Link
                    href={`/dashboard/bulk-email-import/${run.id}`}
                    className="shrink-0 font-medium text-brand-primary hover:underline"
                  >
                    {meta.action}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Cost-Aggregat aktueller Monat</CardTitle>
          <CardDescription>
            Pro Tenant aus vw_bulk_email_cost_monthly. Cap-Hard-Limit
            standardmaessig 100 EUR/Monat (DEC-182).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tenantList.length === 0 ? (
            <p className="text-sm text-slate-500">
              Keine Bulk-Runs sichtbar — entweder noch keine angelegt oder
              Daten-Load-Fehler oben.
            </p>
          ) : (
            <table className="w-full text-sm" data-testid="tenant-aggregates">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="py-2 font-medium text-slate-600">Tenant</th>
                  <th className="py-2 text-right font-medium text-slate-600">
                    Runs (aktueller Monat)
                  </th>
                  <th className="py-2 text-right font-medium text-slate-600">
                    Kosten (aktueller Monat)
                  </th>
                  <th className="py-2 text-right font-medium text-slate-600">
                    Runs (gesamt)
                  </th>
                  <th className="py-2 text-right font-medium text-slate-600">
                    Kosten (gesamt)
                  </th>
                </tr>
              </thead>
              <tbody>
                {tenantList.map((t) => (
                  <tr
                    key={t.tenant_id}
                    className="border-b border-slate-100 last:border-0"
                    data-tenant-id={t.tenant_id}
                  >
                    <td className="py-2">
                      <span className="font-medium text-slate-900">
                        {t.tenant_name ?? "(unbenannt)"}
                      </span>
                      <span className="ml-2 font-mono text-xs text-slate-400">
                        {t.tenant_id.slice(0, 8)}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {t.monthly_run_count}
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold">
                      {formatEuro(t.monthly_cost_eur)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {t.total_runs}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatEuro(t.total_cost_eur_all_time)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Letzte 200 Bulk-Runs</CardTitle>
          <CardDescription>
            Chronologisch absteigend. Klick auf einen Run oeffnet die
            Tenant-Detail-Ansicht.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Runs gefunden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="bulk-runs">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="py-2 font-medium text-slate-600">Tenant</th>
                    <th className="py-2 font-medium text-slate-600">Datei</th>
                    <th className="py-2 font-medium text-slate-600">Status</th>
                    <th className="py-2 text-right font-medium text-slate-600">
                      Emails
                    </th>
                    <th className="py-2 text-right font-medium text-slate-600">
                      Pattern (e/a/i)
                    </th>
                    <th className="py-2 text-right font-medium text-slate-600">
                      Kosten
                    </th>
                    <th className="py-2 font-medium text-slate-600">
                      Erstellt
                    </th>
                    <th className="py-2 font-medium text-slate-600">
                      Abgeschlossen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className="border-b border-slate-100 last:border-0"
                      data-run-id={run.id}
                    >
                      <td className="py-2 text-slate-600">
                        {run.tenant_name ?? "(unbenannt)"}
                      </td>
                      <td className="py-2 font-mono text-xs text-slate-500">
                        <Link
                          href={`/dashboard/bulk-email-import/${run.id}`}
                          className="text-brand-primary hover:underline"
                        >
                          {run.source_file_name}
                        </Link>
                      </td>
                      <td className="py-2">
                        <StatusPill status={run.status} />
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {run.email_count}
                      </td>
                      <td className="py-2 text-right tabular-nums text-xs text-slate-500">
                        {run.patterns_extracted} /{" "}
                        {run.patterns_accepted} /{" "}
                        {run.patterns_imported}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatEuro(run.total_cost_eur)}
                      </td>
                      <td className="py-2 text-xs text-slate-500">
                        {formatDate(run.created_at)}
                      </td>
                      <td className="py-2 text-xs text-slate-500">
                        {formatDate(run.completed_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Forward-Source-Statistik (Inbound-Endpoints)</CardTitle>
          <CardDescription>
            Pro Tenant + Endpoint: Vendor, Inbound-Volumen (30 Tage), Reject-Rate
            je Layer, Monats-Kosten, Last-Inbound. Reject-Rate &gt; 20% (Spam-Influx)
            ist hervorgehoben.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forwardStats.length === 0 ? (
            <p className="text-sm text-slate-500">
              Keine Inbound-Endpoints angelegt.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="forward-source-stats">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="py-2 font-medium text-slate-600">Tenant</th>
                    <th className="py-2 font-medium text-slate-600">Endpoint</th>
                    <th className="py-2 font-medium text-slate-600">Vendor</th>
                    <th className="py-2 font-medium text-slate-600">Status</th>
                    <th className="py-2 text-right font-medium text-slate-600">
                      Inbound (30d)
                    </th>
                    <th className="py-2 text-right font-medium text-slate-600">
                      Rejects (30d)
                    </th>
                    <th className="py-2 text-right font-medium text-slate-600">
                      Kosten (Monat)
                    </th>
                    <th className="py-2 font-medium text-slate-600">
                      Last-Inbound
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {forwardStats.map((s) => {
                    const denom = s.inbound_count_30d + s.reject_count_30d_total;
                    const rejectRate = denom > 0 ? s.reject_count_30d_total / denom : 0;
                    const highReject = rejectRate > 0.2;
                    const rejectDetail = Object.entries(s.reject_count_30d_by_layer)
                      .map(([layer, n]) => `${layer}:${n}`)
                      .join(", ");
                    return (
                      <tr
                        key={s.endpoint_id}
                        className="border-b border-slate-100 last:border-0"
                        data-endpoint-id={s.endpoint_id}
                        data-high-reject={highReject ? "true" : "false"}
                      >
                        <td className="py-2 text-slate-600">
                          {s.tenant_name ?? "(unbenannt)"}
                        </td>
                        <td className="py-2 font-mono text-xs text-slate-500">
                          bulk-{s.slug}
                        </td>
                        <td className="py-2 text-xs text-slate-500">{s.vendor}</td>
                        <td className="py-2">
                          <StatusPill status={s.endpoint_status} />
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {s.inbound_count_30d}
                        </td>
                        <td
                          className={`py-2 text-right tabular-nums ${
                            highReject ? "font-semibold text-red-700" : ""
                          }`}
                          title={rejectDetail || undefined}
                        >
                          {s.reject_count_30d_total}
                          {denom > 0 ? ` (${Math.round(rejectRate * 100)}%)` : ""}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatEuro(s.monthly_cost_eur)}
                        </td>
                        <td className="py-2 text-xs text-slate-500">
                          {formatDate(s.last_inbound_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
