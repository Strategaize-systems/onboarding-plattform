"use client";

// StB-Modul-Workspace — Uebersicht-View (SLC-175 MT-2, OP V10).
// Client-Presentational fuer die Workspace-Startseite: je Modul mit Outputs eine
// Karte (Liefer-Output-/KI-Hebel-Counts + zuletzt erzeugt) -> Link auf Detail.
// Daten + Auth kommen aus der Server-Page; hier nur Rendering + i18n + States.

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import {
  modulKeyToLabel,
  type ModulSummary,
} from "@/lib/stb-vertikale/workspace-read";
import type { Ampel } from "@/lib/stb-vertikale/blueprint";

// Reife-Ampel-Badge-Styles je Signal (SLC-178). green/yellow/red.
const AMPEL_BADGE: Record<Ampel, { badge: string; dot: string }> = {
  green: { badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  yellow: { badge: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  red: { badge: "bg-red-50 text-red-700", dot: "bg-red-600" },
};

function useDateFormatter() {
  const locale = useLocale();
  return (iso: string | null): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };
}

export function WorkspaceOverview({
  summaries,
  loadError,
}: {
  summaries: ModulSummary[];
  loadError: boolean;
}) {
  const t = useTranslations("stb.workspace");
  const formatDate = useDateFormatter();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← {t("backToDashboard")}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
      <p className="mt-1 text-muted-foreground">{t("intro")}</p>

      {loadError ? (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {t("loadError")}
        </div>
      ) : summaries.length === 0 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            {t("emptyTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyBody")}</p>
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {summaries.map((s) => (
            <li key={s.modulKey}>
              <Link
                href={`/dashboard/stb/workspace/${s.modulKey}`}
                className="block rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-primary/50"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">
                      {modulKeyToLabel(s.modulKey)}
                    </h2>
                    {s.ampel ? (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                          AMPEL_BADGE[s.ampel].badge
                        }`}
                        aria-label={t("ampel.label", {
                          state: t(`ampel.${s.ampel}`),
                        })}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            AMPEL_BADGE[s.ampel].dot
                          }`}
                          aria-hidden="true"
                        />
                        {t(`ampel.${s.ampel}`)}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t("lastGenerated", { date: formatDate(s.latestCreatedAt) })}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("outputCount", { count: s.tripleCount })} ·{" "}
                  {t("kiHebelCount", { count: s.kiHebelCount })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
