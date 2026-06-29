"use client";

// StB-Modul-Workspace — Detail-View (SLC-175 MT-2, OP V10).
// Client-Presentational fuer die Modul-Detailseite: Liefer-Triple (je Kind eine
// ModuleOutputCard) + KI-Hebel-Liste, mit Druck-Button (CSS-Print-Ansicht).
// Empty-/Error-States nach AC-175-4. Daten + Auth + Heading kommen aus der
// Server-Page; hier nur Rendering + i18n + Print. DATEV-Abgrenzung im Naming.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { KiHebelList } from "@/components/stb/KiHebelList";
import { ModuleOutputCard } from "@/components/stb/ModuleOutputCard";
import { PrintButton } from "@/components/stb/PrintButton";
import type { ModuleWorkspaceData } from "@/lib/stb-vertikale/workspace-read";

export function ModulWorkspaceView({
  heading,
  modulLabel,
  data,
  loadError,
}: {
  heading: string;
  modulLabel: string;
  data: ModuleWorkspaceData | null;
  loadError: boolean;
}) {
  const t = useTranslations("stb.workspace");
  const hasContent = !loadError && data !== null && data.total > 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 print:max-w-none print:py-0">
      <Link
        href="/dashboard/stb/workspace"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground print:hidden"
      >
        ← {t("backToWorkspace")}
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{heading}</h1>
          <p className="mt-1 text-muted-foreground print:text-slate-700">
            {t("detailIntro", { modul: modulLabel })}
          </p>
        </div>
        {hasContent && <PrintButton />}
      </div>

      {loadError ? (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {t("detailLoadError")}
        </div>
      ) : !hasContent ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            {t("detailEmptyTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("detailEmptyBody")}
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <section className="space-y-5">
            {data.triple.map((section) => (
              <ModuleOutputCard
                key={section.kind}
                kind={section.kind}
                rows={section.rows}
              />
            ))}
          </section>
          <KiHebelList items={data.kiHebel} />
        </div>
      )}
    </div>
  );
}
