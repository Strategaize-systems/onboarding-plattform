// SLC-139 MT-5 (FEAT-058) — Filter-Bar fuer Funnel-Analytics.
//
// Plain HTML form mit method=GET. Server Component fuellt die aktuellen
// Werte aus der URL als `defaultValue`/`defaultChecked` — kein Client-JS
// noetig, kein "use client".
//
// Filter-Achsen:
//   - range:       7 | 30 | 90 Tage (Default 30)
//   - is_test:     Default OFF (Test-Daten ausschliessen)
//   - partner:     leer = alle, oder eine partner_org tenant_id
//
// Bei Submit reloaded die Seite mit den neuen searchParams. Da die Page
// Server-Component ist und keine zwischenliegenden Zustaende hat, ist das
// die einfachste robuste Pattern (vergleichbar mit shadcn-Default).

import type { DateRangeDays } from "../actions";
import type { PartnerOption } from "../actions";

interface AnalyticsFiltersProps {
  currentRange: DateRangeDays;
  currentIncludeTest: boolean;
  currentPartnerOrgId: string | null;
  partnerOptions: PartnerOption[];
  showTestToggle?: boolean;
}

const RANGE_OPTIONS: Array<{ value: DateRangeDays; label: string }> = [
  { value: 7, label: "Letzte 7 Tage" },
  { value: 30, label: "Letzte 30 Tage" },
  { value: 90, label: "Letzte 90 Tage" },
];

export function AnalyticsFilters({
  currentRange,
  currentIncludeTest,
  currentPartnerOrgId,
  partnerOptions,
  showTestToggle = true,
}: AnalyticsFiltersProps) {
  return (
    <form
      method="GET"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
    >
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Zeitraum
        <select
          name="range"
          defaultValue={String(currentRange)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary"
        >
          {RANGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {partnerOptions.length > 0 ? (
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Partner
          <select
            name="partner"
            defaultValue={currentPartnerOrgId ?? ""}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-primary"
          >
            <option value="">Alle Partner</option>
            {partnerOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showTestToggle ? (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="is_test"
            value="1"
            defaultChecked={currentIncludeTest}
            className="h-4 w-4 rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
          />
          Test-Daten einschliessen
        </label>
      ) : null}

      <button
        type="submit"
        className="ml-auto rounded-md bg-brand-primary px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-primary-dark focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1"
      >
        Anwenden
      </button>
    </form>
  );
}
