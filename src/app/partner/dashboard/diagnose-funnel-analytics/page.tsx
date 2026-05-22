// SLC-139 MT-5/MT-6 (FEAT-058) — Partner-Variante Diagnose-Funnel-Analytics.
//
// Spiegelt /admin/diagnose-funnel-analytics, aber fest auf den eigenen
// partner_org_id des eingeloggten partner_admin gescoped. Layout
// (/partner/layout.tsx) gated bereits partner_admin only; Inline-Check
// existiert als Defense-in-Depth.
//
// Reuse: gleiche Aggregations-Lib + gleiche Filter/KPI/Chart-Components wie
// die Admin-Variante. Unterschiede: kein Partner-Picker, Header-Text
// "Mein Partner".

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeAnalytics } from "@/lib/diagnose-analytics/aggregations";
import {
  loadDiagnoseEvents,
  loadPartnerDiagnosticQuestionKeys,
  type DateRangeDays,
} from "@/app/admin/diagnose-funnel-analytics/actions";
import { AnalyticsFilters } from "@/app/admin/diagnose-funnel-analytics/components/AnalyticsFilters";
import { KpiTiles } from "@/app/admin/diagnose-funnel-analytics/components/KpiTiles";
import { DropoffChart } from "@/app/admin/diagnose-funnel-analytics/components/DropoffChart";
import { HelperHitsTable } from "@/app/admin/diagnose-funnel-analytics/components/HelperHitsTable";
import { TOQHistogram } from "@/app/admin/diagnose-funnel-analytics/components/TOQHistogram";

export const metadata = {
  title: "Partner · Diagnose-Funnel-Analytics | Strategaize",
};

const VALID_RANGES: DateRangeDays[] = [7, 30, 90];

interface PageProps {
  searchParams: Promise<{
    range?: string;
    is_test?: string;
  }>;
}

function parseRange(raw: string | undefined): DateRangeDays {
  const parsed = Number(raw);
  if (VALID_RANGES.includes(parsed as DateRangeDays)) {
    return parsed as DateRangeDays;
  }
  return 30;
}

export default async function PartnerDiagnoseFunnelAnalyticsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "partner_admin" || !profile.tenant_id) {
    redirect("/login");
  }

  const range = parseRange(params.range);
  const includeTest = params.is_test === "1";
  const partnerOrgId = profile.tenant_id;

  const [{ events, truncated }, questionKeysInOrder] = await Promise.all([
    loadDiagnoseEvents({ rangeDays: range, includeTest, partnerOrgId }),
    loadPartnerDiagnosticQuestionKeys(),
  ]);

  const analytics = computeAnalytics({ events, questionKeysInOrder });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Diagnose-Funnel-Analytics
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Drop-off-Punkte, Helper-Text-Klicks und Zeit pro Frage fuer Deine
          Mandanten. Aggregationen ab 5 Sessions pro Frage — darunter wird
          &quot;zu wenig Daten&quot; angezeigt (DSGVO).
        </p>
      </div>

      <AnalyticsFilters
        currentRange={range}
        currentIncludeTest={includeTest}
        currentPartnerOrgId={partnerOrgId}
        partnerOptions={[]}
        showTestToggle={false}
      />

      {truncated ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Datensatz auf 50 000 Events begrenzt — engere Filter setzen fuer
          praezisere Werte.
        </div>
      ) : null}

      <KpiTiles kpis={analytics.kpis} />

      {questionKeysInOrder.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          Kein partner_diagnostic-Template gefunden. Funnel-Drilldown wird
          sichtbar sobald ein Template aktiv ist.
        </div>
      ) : (
        <div className="space-y-6">
          <DropoffChart perQuestion={analytics.perQuestion} />
          <HelperHitsTable perQuestion={analytics.perQuestion} />
          <TOQHistogram perQuestion={analytics.perQuestion} />
        </div>
      )}
    </div>
  );
}
