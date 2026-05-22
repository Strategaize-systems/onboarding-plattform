// SLC-139 MT-5/MT-6 (FEAT-058) — Admin-Analytics-Page Diagnose-Funnel.
//
// Server-Component fuer strategaize_admin. Liest searchParams (range, partner,
// is_test), faedt diagnose_event-Rows via Admin-Client (RLS-Bypass weil
// strategaize_admin cross-tenant lesen muss), holt Question-Keys aus dem
// partner_diagnostic-Template und delegiert an `computeAnalytics` aus der
// pure Aggregations-Lib.
//
// Auth-Gate: /admin/* Layout erlaubt strategaize_admin + tenant_admin —
// Inline-Check verlangt strategaize_admin (partner-uebergreifende Analytics
// gehoeren nicht in den tenant_admin-Scope). partner_admin-Variante:
// `src/app/partner/dashboard/diagnose-funnel-analytics/page.tsx`.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeAnalytics } from "@/lib/diagnose-analytics/aggregations";
import {
  loadDiagnoseEvents,
  loadPartnerDiagnosticQuestionKeys,
  loadPartnerOptions,
  type DateRangeDays,
} from "./actions";
import { AnalyticsFilters } from "./components/AnalyticsFilters";
import { KpiTiles } from "./components/KpiTiles";
import { DropoffChart } from "./components/DropoffChart";
import { HelperHitsTable } from "./components/HelperHitsTable";
import { TOQHistogram } from "./components/TOQHistogram";

export const metadata = {
  title: "Admin · Diagnose-Funnel-Analytics | Strategaize",
};

const VALID_RANGES: DateRangeDays[] = [7, 30, 90];

interface PageProps {
  searchParams: Promise<{
    range?: string;
    partner?: string;
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

export default async function AdminDiagnoseFunnelAnalyticsPage({
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
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "strategaize_admin") {
    redirect("/admin/tenants");
  }

  const range = parseRange(params.range);
  const includeTest = params.is_test === "1";
  const partnerOrgId = params.partner && params.partner.length > 0 ? params.partner : null;

  const [{ events, truncated }, questionKeysInOrder, partnerOptions] = await Promise.all([
    loadDiagnoseEvents({ rangeDays: range, includeTest, partnerOrgId }),
    loadPartnerDiagnosticQuestionKeys(),
    loadPartnerOptions(),
  ]);

  const analytics = computeAnalytics({ events, questionKeysInOrder });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Diagnose-Funnel-Analytics
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Drop-off-Punkte, Helper-Text-Klicks und Zeit pro Frage im
          partner_diagnostic-Funnel. Aggregationen ab 5 Sessions pro Frage —
          darunter wird &quot;zu wenig Daten&quot; angezeigt (DSGVO).
        </p>
      </div>

      <AnalyticsFilters
        currentRange={range}
        currentIncludeTest={includeTest}
        currentPartnerOrgId={partnerOrgId}
        partnerOptions={partnerOptions}
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
