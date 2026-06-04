// V9 SLC-167 MT-4 — Pre-Cost-Estimate-Page (GF-Gate-2 Cost-Approval) (FEAT-073).
//
// Server-Component analog ../page.tsx + ../filter-review/page.tsx. Auth-Gate
// identisch (tenant_admin only; strategaize_admin landet auf /dashboard, weil
// V9.0 keinen Cross-Tenant-Approval-Flow hat).
//
// Lifecycle:
//   - Status != 'thread_redacted': Banner "Pattern-Start noch nicht verfuegbar"
//     + Link zur Detail-View. Stadium-spezifisch (pending/failed/after).
//   - Status == 'thread_redacted': Cost-Estimate-Card + Cap-Status + Start-Trigger.
//   - Status > 'thread_redacted' (z.B. 'pattern_extracting'): Banner "Pattern-
//     Extraktion laeuft bereits".
//
// Cap-Pre-Checks Server-Side gerendert (kein round-trip noetig):
//   - Run-Cap-Check: hard block bei estimate > runCap
//   - Tenant-Monatscap-Check: hard block bei (monthSoFar + estimate) > tenantMonthCap
//   - Pre-Approval-Schwelle: soft block (Trigger zeigt 2-Step-Confirm in Client-
//     Component).
//
// Pattern-Reuse:
//   - Auth-Gate + profile + role-Check: ../filter-review/page.tsx:182-209
//   - Header + Back-Link: ../filter-review/page.tsx:217-232
//   - Card-Layout: shadcn
//   - StatRow Pattern: ../page.tsx:220-229

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle, CheckCircle2, Euro, ShieldAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  checkPreApprovalThreshold,
  checkRunCap,
  checkTenantMonthlyCap,
} from "@/lib/bulk-email/cost-cap";

import { getPatternStartData, type PatternStartData } from "./actions";
import { PatternStartTrigger } from "./PatternStartTrigger";

interface PatternStartPageProps {
  params: Promise<{ run_id: string }>;
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatInt(value: number): string {
  return new Intl.NumberFormat("de-DE").format(value);
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

function StatusBanner({ status, runId }: { status: string; runId: string }) {
  if (status === "thread_redacted") return null;

  const isPending =
    status === "uploaded" ||
    status === "parsing" ||
    status === "parsed" ||
    status === "pre_filtering" ||
    status === "pre_filtered" ||
    status === "thread_redacting";
  const isFailed = status === "failed";
  const isAfter = !isPending && !isFailed; // pattern_extracting, pattern_extracted, etc.

  if (isFailed) {
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
            Dieser Bulk-Run hat einen fruehren Schritt nicht abgeschlossen.
            Bitte die Detail-View oeffnen fuer den Fehlergrund.
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
            Pattern-Start noch nicht verfuegbar
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Threads muessen erst aggregiert und PII-redacted sein. Aktueller
            Status: <code>{status}</code>.
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
            Pattern-Extraktion bereits gestartet oder abgeschlossen
          </p>
          <p className="mt-1 text-sm text-green-700">
            Status: <code>{status}</code>. Pre-Approval-Schritt ist nicht mehr
            relevant.
          </p>
          <Link
            href={`/dashboard/bulk-email-import/${runId}`}
            className="mt-2 inline-flex items-center gap-1 text-sm text-green-800 underline"
          >
            Zur Detail-View
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

function CostEstimateCard({ data }: { data: PatternStartData }) {
  const { estimate, caps } = data;
  const tokensInRounded = Math.round(estimate.tokensIn);
  const tokensOutRounded = Math.round(estimate.tokensOut);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pre-Cost-Estimate</CardTitle>
        <CardDescription>
          Geschaetzte Bedrock-Sonnet-Kosten fuer Pattern-Extraktion ueber{" "}
          {formatInt(estimate.threadCount)} Thread
          {estimate.threadCount === 1 ? "" : "s"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <StatRow label="Threads im Estimate" value={formatInt(estimate.threadCount)} />
          <StatRow label="Geschaetzte Input-Tokens" value={formatInt(tokensInRounded)} />
          <StatRow label="Geschaetzte Output-Tokens" value={formatInt(tokensOutRounded)} />
          <StatRow label="USD-Cost" value={`${estimate.costUsd.toFixed(4)} USD`} />
          <StatRow
            label="EUR-Cost (Approx)"
            value={<strong>{formatEuro(estimate.costEur)}</strong>}
          />
          <StatRow label="Run-Cap" value={formatEuro(caps.runCapEur)} />
          <StatRow
            label="Pre-Approval-Schwelle"
            value={formatEuro(caps.preApprovalThresholdEur)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function TenantMonthCard({
  data,
  newRunEur,
}: {
  data: PatternStartData;
  newRunEur: number;
}) {
  const { caps, tenantMonthSoFarEur } = data;
  const remainingEur = caps.tenantMonthCapEur - tenantMonthSoFarEur;
  const projected = tenantMonthSoFarEur + newRunEur;
  const wouldExceed = projected > caps.tenantMonthCapEur;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenant-Monatscap</CardTitle>
        <CardDescription>
          Hard-Cap fuer den laufenden Monat ueber alle Bulk-Email-Runs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <StatRow
            label="Bereits verbraucht (Monat)"
            value={formatEuro(tenantMonthSoFarEur)}
          />
          <StatRow label="Cap" value={formatEuro(caps.tenantMonthCapEur)} />
          <StatRow
            label="Verbleibend"
            value={
              <span className={remainingEur > 0 ? "text-slate-900" : "text-red-600"}>
                {formatEuro(remainingEur)}
              </span>
            }
          />
          <StatRow
            label="Nach diesem Run"
            value={
              <span className={wouldExceed ? "text-red-600" : "text-slate-900"}>
                {formatEuro(projected)}
              </span>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function CapBlockBanner({
  kind,
  message,
}: {
  kind: "run_cap" | "tenant_month_cap";
  message: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
      data-cap-kind={kind}
    >
      <ShieldAlert className="h-5 w-5 flex-shrink-0 text-red-500" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-red-800">
          {kind === "run_cap"
            ? "Run-Cap ueberschritten — Start blockiert"
            : "Tenant-Monatscap ueberschritten — Start blockiert"}
        </p>
        <p className="mt-1 text-sm text-red-700">{message}</p>
      </div>
    </div>
  );
}

export default async function PatternStartPage({
  params,
}: PatternStartPageProps) {
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

  const data = await getPatternStartData(runId);
  if (!data) {
    notFound();
  }

  const startable = data.run.status === "thread_redacted";

  // Server-Side Cap-Checks fuer UI-State.
  const runCapBlocks =
    startable && !checkRunCap(data.estimate.costEur, data.caps.runCapEur);
  const tenantCap = startable
    ? await checkTenantMonthlyCap(
        // Tenant-ID nicht hier verfuegbar — wir nutzen tenantMonthSoFarEur+estimate aus data
        profile.tenant_id as string,
        data.estimate.costEur,
        data.caps.tenantMonthCapEur,
        {
          async getTenantMonthCostEur() {
            return data.tenantMonthSoFarEur;
          },
          async getRunPatternExtractionCostEur() {
            return 0;
          },
        },
      )
    : null;
  const tenantCapBlocks = startable && tenantCap !== null && !tenantCap.allowed;
  const requiresPreApproval =
    startable &&
    !runCapBlocks &&
    !tenantCapBlocks &&
    checkPreApprovalThreshold(
      data.estimate.costEur,
      data.caps.preApprovalThresholdEur,
    );

  const noThreads = startable && data.estimate.threadCount === 0;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="space-y-2">
        <Link
          href={`/dashboard/bulk-email-import/${runId}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurueck zur Detail-Ansicht
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">
          Pattern-Extraktion starten: {data.run.source_file_name}
        </h1>
        <p className="text-sm text-slate-500">
          GF-Gate-2 Cost-Approval. Pre-Cost-Estimate pruefen und Bedrock-Sonnet-
          Pattern-Extraktion freigeben.
        </p>
      </header>

      <StatusBanner status={data.run.status} runId={runId} />

      {startable ? (
        <>
          <CostEstimateCard data={data} />
          <TenantMonthCard data={data} newRunEur={data.estimate.costEur} />

          {runCapBlocks ? (
            <CapBlockBanner
              kind="run_cap"
              message={`Erwartete Kosten ${formatEuro(
                data.estimate.costEur,
              )} ueberschreiten den Run-Cap (${formatEuro(
                data.caps.runCapEur,
              )}). Cap konfigurierbar via V9_BULK_EMAIL_RUN_CAP_EUR.`}
            />
          ) : null}

          {tenantCapBlocks && tenantCap !== null ? (
            <CapBlockBanner
              kind="tenant_month_cap"
              message={`Bereits ${formatEuro(
                tenantCap.currentMonthEur,
              )} im Monat verbraucht. Neuer Run ${formatEuro(
                data.estimate.costEur,
              )} ueberschreitet Cap ${formatEuro(
                data.caps.tenantMonthCapEur,
              )}. Verbleibend: ${formatEuro(tenantCap.remainingEur)}.`}
            />
          ) : null}

          {noThreads ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
            >
              <Euro className="h-5 w-5 flex-shrink-0 text-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">
                  Keine Threads gefunden
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  Der Bulk-Run hat keine redacted Threads. Bitte erst Pipeline-
                  Schritt &quot;Thread-Aggregation und PII-Redaction&quot; abschliessen
                  lassen.
                </p>
              </div>
            </div>
          ) : (
            <PatternStartTrigger
              bulkRunId={runId}
              estimateEur={data.estimate.costEur}
              preApprovalThresholdEur={data.caps.preApprovalThresholdEur}
              disabled={runCapBlocks || tenantCapBlocks}
              disabledReason={
                runCapBlocks
                  ? "Run-Cap blockt Start."
                  : tenantCapBlocks
                    ? "Tenant-Monatscap blockt Start."
                    : undefined
              }
            />
          )}

          {!runCapBlocks && !tenantCapBlocks && requiresPreApproval ? (
            <p className="text-xs text-slate-500">
              Erwartete Kosten {formatEuro(data.estimate.costEur)} ueberschreiten
              die Pre-Approval-Schwelle {formatEuro(data.caps.preApprovalThresholdEur)}.
              Bestaetigung in 2 Schritten erforderlich.
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
